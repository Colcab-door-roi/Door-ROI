import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { calculatePlugInFreezerSavings } from '../lib/calculate'
import { generateStoreReport, reportFilename } from '../lib/pdf'
import type {
  AppSettings,
  CasemSettings,
  CaseType,
  Category,
  CostRate,
  DoorType,
  PlantType,
  PlugInFreezerSettings,
  PlugInFreezerType,
  RemoteFreezerType,
  SalesRep,
  StoreItem,
  StoreVisit,
} from '../types'

const REP_STORAGE_KEY = 'fridge-rep-id'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function StoreCapture() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [caseTypes, setCaseTypes] = useState<CaseType[]>([])
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([])
  const [doorTypes, setDoorTypes] = useState<DoorType[]>([])
  const [costRates, setCostRates] = useState<CostRate[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [casemSettings, setCasemSettings] = useState<CasemSettings | null>(null)
  const [salesReps, setSalesReps] = useState<SalesRep[]>([])
  const [remoteFreezerTypes, setRemoteFreezerTypes] = useState<RemoteFreezerType[]>([])
  const [plugInFreezerTypes, setPlugInFreezerTypes] = useState<PlugInFreezerType[]>([])
  const [plugInFreezerSettings, setPlugInFreezerSettings] = useState<PlugInFreezerSettings | null>(null)

  const [currentRep, setCurrentRep] = useState<SalesRep | null>(null)
  const [loginDigest, setLoginDigest] = useState<string[]>([])
  const [checkedStoredLogin, setCheckedStoredLogin] = useState(false)

  const [store, setStore] = useState<StoreVisit | null>(null)
  const [items, setItems] = useState<StoreItem[]>([])
  const [creatingNew, setCreatingNew] = useState(false)

  useEffect(() => {
    async function load() {
      const [
        catRes,
        caseRes,
        plantRes,
        doorRes,
        costRes,
        settingsRes,
        casemRes,
        repsRes,
        remoteFreezerRes,
        plugInFreezerRes,
        plugInFreezerSettingsRes,
      ] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('case_types').select('*').order('name'),
        supabase.from('plant_types').select('*').order('name'),
        supabase.from('door_types').select('*').order('name'),
        supabase.from('cost_rates').select('*'),
        supabase.from('app_settings').select('*').single(),
        supabase.from('casem_settings').select('*').single(),
        supabase.from('sales_reps').select('*').order('name'),
        supabase.from('remote_freezer_types').select('*').order('name'),
        supabase.from('plugin_freezer_types').select('*').order('name'),
        supabase.from('plugin_freezer_settings').select('*').single(),
      ])
      const firstError =
        catRes.error ||
        caseRes.error ||
        plantRes.error ||
        doorRes.error ||
        costRes.error ||
        settingsRes.error ||
        casemRes.error ||
        repsRes.error ||
        remoteFreezerRes.error ||
        plugInFreezerRes.error ||
        plugInFreezerSettingsRes.error
      if (firstError) {
        setError(firstError.message)
      } else {
        setCategories(catRes.data ?? [])
        setCaseTypes(caseRes.data ?? [])
        setPlantTypes(plantRes.data ?? [])
        setDoorTypes(doorRes.data ?? [])
        setCostRates(costRes.data ?? [])
        setSettings(settingsRes.data)
        setCasemSettings(casemRes.data)
        setSalesReps(repsRes.data ?? [])
        setRemoteFreezerTypes(remoteFreezerRes.data ?? [])
        setPlugInFreezerTypes(plugInFreezerRes.data ?? [])
        setPlugInFreezerSettings(plugInFreezerSettingsRes.data)

        const storedId = localStorage.getItem(REP_STORAGE_KEY)
        const matched = storedId ? (repsRes.data ?? []).find((r) => r.id === storedId) : null
        if (matched) setCurrentRep(matched)
        else if (storedId) localStorage.removeItem(REP_STORAGE_KEY)
      }
      setLoading(false)
      setCheckedStoredLogin(true)
    }
    load()
  }, [])

  async function loadSurvey(visit: StoreVisit) {
    const { data, error } = await supabase
      .from('store_items')
      .select('*')
      .eq('store_visit_id', visit.id)
    if (error) {
      setError(error.message)
      return
    }
    setItems(data ?? [])
    setStore(visit)
    setCreatingNew(false)
  }

  function handleLogout() {
    localStorage.removeItem(REP_STORAGE_KEY)
    setCurrentRep(null)
    setLoginDigest([])
    setStore(null)
    setItems([])
    setCreatingNew(false)
  }

  if (loading || !checkedStoredLogin) {
    return <div className="p-4 text-sm text-slate-500 dark:text-slate-400">Loading…</div>
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-700 dark:text-red-300">
        Couldn't load data: {error}
      </div>
    )
  }

  if (!currentRep) {
    return (
      <RepLogin
        reps={salesReps}
        onLoggedIn={(rep, digest) => {
          setCurrentRep(rep)
          setLoginDigest(digest)
        }}
      />
    )
  }

  if (!store) {
    if (creatingNew) {
      return (
        <StoreProfileForm
          rep={currentRep}
          plantTypes={plantTypes}
          doorTypes={doorTypes}
          defaultRate={settings?.default_electricity_rate ?? 0}
          existingStore={null}
          onSaved={(visit) => {
            setStore(visit)
            setItems([])
            setCreatingNew(false)
          }}
          onCancel={() => setCreatingNew(false)}
        />
      )
    }
    return (
      <RepLandingPage
        rep={currentRep}
        digest={loginDigest}
        onLogout={handleLogout}
        onNewSurvey={() => setCreatingNew(true)}
        onSelectSurvey={loadSurvey}
      />
    )
  }

  return (
    <ItemCapture
      store={store}
      rep={currentRep}
      items={items}
      setItems={setItems}
      categories={categories}
      caseTypes={caseTypes}
      plantTypes={plantTypes}
      doorTypes={doorTypes}
      costRates={costRates}
      settings={settings}
      casemSettings={casemSettings}
      remoteFreezerTypes={remoteFreezerTypes}
      plugInFreezerTypes={plugInFreezerTypes}
      plugInFreezerSettings={plugInFreezerSettings}
      onStoreUpdated={setStore}
      onBackToList={() => {
        setStore(null)
        setItems([])
      }}
    />
  )
}

function RepLogin({
  reps,
  onLoggedIn,
}: {
  reps: SalesRep[]
  onLoggedIn: (rep: SalesRep, digest: string[]) => void
}) {
  const [repId, setRepId] = useState(reps[0]?.id ?? '')
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const repMeta = reps.find((r) => r.id === repId)
    if (!repMeta) {
      setError('Select your name')
      return
    }
    setLoggingIn(true)
    setError('')

    // Re-fetch fresh rather than trusting `reps`, which was loaded once on
    // page mount — its last_login/passcode can be stale by the time of a
    // second login in the same session (e.g. after a logout).
    const { data: rep, error: fetchError } = await supabase
      .from('sales_reps')
      .select('*')
      .eq('id', repMeta.id)
      .single()

    if (fetchError || !rep) {
      setLoggingIn(false)
      setError(fetchError?.message ?? 'Could not load rep')
      return
    }

    if (passcode !== rep.passcode) {
      setLoggingIn(false)
      setError('Incorrect passcode')
      return
    }

    let digest: string[] = []
    if (rep.last_login) {
      const { data } = await supabase
        .from('admin_activity_log')
        .select('description')
        .gt('created_at', rep.last_login)
        .order('created_at', { ascending: false })
      digest = (data ?? []).map((d) => d.description)
    }

    const { data: updated, error: updateError } = await supabase
      .from('sales_reps')
      .update({ last_login: new Date().toISOString() })
      .eq('id', rep.id)
      .select()
      .single()

    setLoggingIn(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    localStorage.setItem(REP_STORAGE_KEY, rep.id)
    onLoggedIn(updated, digest)
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Sales rep login</h1>

      {reps.length === 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          No sales reps set up yet — ask admin to add one.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Name</span>
          <select
            required
            value={repId}
            onChange={(e) => setRepId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Passcode</span>
          <input
            required
            type="password"
            autoFocus
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loggingIn || reps.length === 0}
          className="rounded-lg bg-slate-900 p-3 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {loggingIn ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <Link to="/admin" className="text-center text-sm text-slate-400 hover:underline">
        Admin
      </Link>
    </div>
  )
}

function RepLandingPage({
  rep,
  digest,
  onLogout,
  onNewSurvey,
  onSelectSurvey,
}: {
  rep: SalesRep
  digest: string[]
  onLogout: () => void
  onNewSurvey: () => void
  onSelectSurvey: (visit: StoreVisit) => void
}) {
  const [surveys, setSurveys] = useState<StoreVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [digestDismissed, setDigestDismissed] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('store_visits')
        .select('*')
        .eq('sales_rep_id', rep.id)
        .order('visit_date', { ascending: false })
      if (error) setError(error.message)
      else setSurveys(data ?? [])
      setLoading(false)
    }
    load()
  }, [rep.id])

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col gap-6 p-4 pb-16">
      <header className="flex items-center justify-between pt-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{rep.name}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{rep.region}</p>
        </div>
        <div className="flex gap-3">
          <Link to="/admin" className="text-sm text-slate-400 hover:underline">
            Admin
          </Link>
          <button onClick={onLogout} className="text-sm text-slate-400 hover:underline">
            Log out
          </button>
        </div>
      </header>

      {digest.length > 0 && !digestDismissed && (
        <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Updates since your last login
            </h2>
            <button
              onClick={() => setDigestDismissed(true)}
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Dismiss
            </button>
          </div>
          <ul className="flex flex-col gap-1 text-sm text-blue-700 dark:text-blue-300">
            {digest.map((d, i) => (
              <li key={i}>• {d}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        onClick={onNewSurvey}
        className="rounded-lg bg-slate-900 p-3 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
      >
        + New store survey
      </button>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Your store surveys ({surveys.length})
        </h2>
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {!loading && surveys.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">No store surveys yet.</p>
        )}
        {surveys.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelectSurvey(s)}
            className="flex flex-col items-start rounded-lg border border-slate-200 p-3 text-left dark:border-slate-800"
          >
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{s.store_name}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{s.visit_date}</span>
          </button>
        ))}
      </section>
    </div>
  )
}

function StoreProfileForm({
  rep,
  plantTypes,
  doorTypes,
  defaultRate,
  existingStore,
  onSaved,
  onCancel,
}: {
  rep: SalesRep
  plantTypes: PlantType[]
  doorTypes: DoorType[]
  defaultRate: number
  existingStore: StoreVisit | null
  onSaved: (store: StoreVisit) => void
  onCancel: () => void
}) {
  const [storeName, setStoreName] = useState(existingStore?.store_name ?? '')
  const [plantTypeId, setPlantTypeId] = useState(existingStore?.plant_type_id ?? plantTypes[0]?.id ?? '')
  const [doorTypeId, setDoorTypeId] = useState(existingStore?.door_type_id ?? doorTypes[0]?.id ?? '')
  const [rate, setRate] = useState((existingStore?.electricity_rate ?? defaultRate).toString())
  const [outlying, setOutlying] = useState(existingStore?.outlying ?? false)
  const [casem, setCasem] = useState(existingStore?.casem ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedDoorType = doorTypes.find((d) => d.id === doorTypeId)
  const showCasem = (selectedDoorType?.heater_watts_per_ft ?? 0) > 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      store_name: storeName,
      plant_type_id: plantTypeId,
      door_type_id: doorTypeId,
      electricity_rate: Number(rate) || 0,
      outlying,
      casem: showCasem && casem,
    }

    const { data, error } = existingStore
      ? await supabase.from('store_visits').update(payload).eq('id', existingStore.id).select().single()
      : await supabase
          .from('store_visits')
          .insert({ ...payload, visit_date: todayISO(), sales_rep_id: rep.id })
          .select()
          .single()

    if (error) setError(error.message)
    else onSaved(data)
    setSaving(false)
  }

  const canSubmit = plantTypes.length > 0 && doorTypes.length > 0

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col gap-6 p-4 pb-16">
      <header className="flex items-center justify-between pt-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {existingStore ? 'Edit store details' : 'New store survey'}
        </h1>
        <button onClick={onCancel} className="text-sm text-slate-400 hover:underline">
          Cancel
        </button>
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {plantTypes.length === 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          No plant types set up yet — add one from Admin first.
        </p>
      )}
      {doorTypes.length === 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          No door types set up yet — add one from Admin first.
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Store name</span>
          <input
            required
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Sales rep</span>
          <input
            disabled
            value={`${rep.name} (${rep.region})`}
            className="rounded-lg border border-slate-300 bg-slate-100 p-3 text-base text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
          />
        </label>

        {!existingStore && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Date</span>
            <input
              disabled
              value={todayISO()}
              className="rounded-lg border border-slate-300 bg-slate-100 p-3 text-base text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            />
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Refrigeration plant type
          </span>
          <select
            required
            value={plantTypeId}
            onChange={(e) => setPlantTypeId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {plantTypes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (COP {p.cop})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Door type</span>
          <select
            required
            value={doorTypeId}
            onChange={(e) => setDoorTypeId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {doorTypes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">Applies to every non-GDF case in this survey.</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Electricity rate (R/kWh)
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={outlying} onChange={(e) => setOutlying(e.target.checked)} />
          Outlying (adds outlying labour cost to the whole survey)
        </label>

        {showCasem && (
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={casem} onChange={(e) => setCasem(e.target.checked)} />
            Casem (RH-adaptive heater control for this heated door)
          </label>
        )}

        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="rounded-lg bg-slate-900 p-3 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {existingStore ? 'Save changes' : 'Start capturing cases'}
        </button>
      </form>
    </div>
  )
}

const emptyItemForm = {
  isGdf: false,
  isPluginFreezer: false,
  categoryId: '',
  caseTypeId: '',
  qtyFt: '',
  qtyDoors: '',
  qtyGdfUnits: '',
  doors: true,
  reclad: false,
  canopyLed: false,
  undershelfLed: false,
  verticalLed: false,
  casem: false,
  casemUnits: '',
  spineRemoteFreezerTypeId: '',
  spineRemoteQty: '',
  spinePlugInFreezerTypeId: '',
  endRemoteFreezerTypeId: '',
  endRemoteQty: '',
  endPlugInFreezerTypeId: '',
  notes: '',
}

function ItemCapture({
  store,
  rep,
  items,
  setItems,
  categories,
  caseTypes,
  plantTypes,
  doorTypes,
  costRates,
  settings,
  casemSettings,
  remoteFreezerTypes,
  plugInFreezerTypes,
  plugInFreezerSettings,
  onStoreUpdated,
  onBackToList,
}: {
  store: StoreVisit
  rep: SalesRep
  items: StoreItem[]
  setItems: React.Dispatch<React.SetStateAction<StoreItem[]>>
  categories: Category[]
  caseTypes: CaseType[]
  plantTypes: PlantType[]
  doorTypes: DoorType[]
  costRates: CostRate[]
  settings: AppSettings | null
  casemSettings: CasemSettings | null
  remoteFreezerTypes: RemoteFreezerType[]
  plugInFreezerTypes: PlugInFreezerType[]
  plugInFreezerSettings: PlugInFreezerSettings | null
  onStoreUpdated: (store: StoreVisit) => void
  onBackToList: () => void
}) {
  const [form, setForm] = useState(emptyItemForm)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [editingStoreDetails, setEditingStoreDetails] = useState(false)

  const plantType = plantTypes.find((p) => p.id === store.plant_type_id)
  const doorType = doorTypes.find((d) => d.id === store.door_type_id)

  if (editingStoreDetails) {
    return (
      <StoreProfileForm
        rep={rep}
        plantTypes={plantTypes}
        doorTypes={doorTypes}
        defaultRate={settings?.default_electricity_rate ?? 0}
        existingStore={store}
        onSaved={(updated) => {
          onStoreUpdated(updated)
          setEditingStoreDetails(false)
        }}
        onCancel={() => setEditingStoreDetails(false)}
      />
    )
  }

  function resetItemForm() {
    setEditingItemId(null)
    setForm(emptyItemForm)
  }

  function startEditItem(item: StoreItem) {
    setEditingItemId(item.id)
    setForm({
      isGdf: item.is_gdf,
      isPluginFreezer: item.is_plugin_freezer,
      categoryId: item.category_id,
      caseTypeId: item.case_type_id ?? '',
      qtyFt: item.qty_ft?.toString() ?? '',
      qtyDoors: item.qty_doors?.toString() ?? '',
      qtyGdfUnits: item.qty_gdf_units?.toString() ?? '',
      doors: item.doors,
      reclad: item.reclad,
      canopyLed: item.canopy_led,
      undershelfLed: item.undershelf_led,
      verticalLed: item.vertical_led,
      casem: item.casem,
      casemUnits: item.casem_units?.toString() ?? '',
      spineRemoteFreezerTypeId: item.spine_remote_freezer_type_id ?? '',
      spineRemoteQty: item.spine_remote_qty?.toString() ?? '',
      spinePlugInFreezerTypeId: item.spine_plugin_freezer_type_id ?? '',
      endRemoteFreezerTypeId: item.end_remote_freezer_type_id ?? '',
      endRemoteQty: item.end_remote_qty?.toString() ?? '',
      endPlugInFreezerTypeId: item.end_plugin_freezer_type_id ?? '',
      notes: item.notes ?? '',
    })
  }

  async function handleSubmitItem(e: FormEvent) {
    e.preventDefault()
    if (!form.categoryId) return
    if (form.isPluginFreezer) {
      const hasSpine = form.spineRemoteFreezerTypeId && form.spineRemoteQty && form.spinePlugInFreezerTypeId
      const hasEnd = form.endRemoteFreezerTypeId && form.endRemoteQty && form.endPlugInFreezerTypeId
      if (!hasSpine && !hasEnd) return
    } else if (form.isGdf) {
      if (!form.qtyDoors || !form.qtyGdfUnits) return
    } else if (!form.caseTypeId || !form.qtyFt) {
      return
    }
    setSaving(true)
    setError(null)

    const base = {
      category_id: form.categoryId,
      case_type_id: null,
      is_gdf: false,
      is_plugin_freezer: false,
      qty_ft: null,
      qty_doors: null,
      qty_gdf_units: null,
      doors: false,
      reclad: false,
      canopy_led: false,
      undershelf_led: false,
      vertical_led: false,
      casem: false,
      casem_units: null,
      spine_remote_freezer_type_id: null,
      spine_remote_qty: null,
      spine_plugin_freezer_type_id: null,
      end_remote_freezer_type_id: null,
      end_remote_qty: null,
      end_plugin_freezer_type_id: null,
      notes: form.notes || null,
    }

    const payload = form.isPluginFreezer
      ? {
          ...base,
          is_plugin_freezer: true,
          spine_remote_freezer_type_id: form.spineRemoteFreezerTypeId || null,
          spine_remote_qty: form.spineRemoteFreezerTypeId ? Number(form.spineRemoteQty) || 0 : null,
          spine_plugin_freezer_type_id: form.spinePlugInFreezerTypeId || null,
          end_remote_freezer_type_id: form.endRemoteFreezerTypeId || null,
          end_remote_qty: form.endRemoteFreezerTypeId ? Number(form.endRemoteQty) || 0 : null,
          end_plugin_freezer_type_id: form.endPlugInFreezerTypeId || null,
        }
      : form.isGdf
        ? {
            ...base,
            is_gdf: true,
            qty_doors: Number(form.qtyDoors) || 0,
            qty_gdf_units: Number(form.qtyGdfUnits) || 0,
            casem: form.casem,
          }
        : {
            ...base,
            case_type_id: form.caseTypeId,
            qty_ft: Number(form.qtyFt) || 0,
            doors: form.doors,
            reclad: form.reclad,
            canopy_led: form.canopyLed,
            undershelf_led: form.undershelfLed,
            vertical_led: form.verticalLed,
            casem_units: store.casem && form.doors ? Number(form.casemUnits) || 0 : null,
          }

    const { data, error } = editingItemId
      ? await supabase.from('store_items').update(payload).eq('id', editingItemId).select().single()
      : await supabase
          .from('store_items')
          .insert({ ...payload, store_visit_id: store.id })
          .select()
          .single()

    if (error) {
      setError(error.message)
    } else if (editingItemId) {
      setItems((prev) => prev.map((i) => (i.id === editingItemId ? data : i)))
      resetItemForm()
    } else {
      setItems((prev) => [...prev, data])
      resetItemForm()
    }
    setSaving(false)
  }

  async function handleDeleteItem(id: string) {
    if (!confirm('Remove this case or line-up?')) return
    const { error } = await supabase.from('store_items').delete().eq('id', id)
    if (error) setError(error.message)
    else {
      setItems((prev) => prev.filter((i) => i.id !== id))
      if (editingItemId === id) resetItemForm()
    }
  }

  async function handleFinish() {
    if (!plantType || !doorType || !settings || !casemSettings || !plugInFreezerSettings) return
    setGenerating(true)
    try {
      const doc = await generateStoreReport({
        store,
        items,
        caseTypes,
        categories,
        plantType,
        doorType,
        settings,
        costRates,
        casemSettings,
        remoteFreezerTypes,
        plugInFreezerTypes,
        plugInFreezerSettings,
        rep,
      })
      const blob = doc.output('blob')
      // Wrapping in a named File (not a plain Blob) so the browser's own PDF
      // viewer "download" button, and integrations like "Save to Drive",
      // pick up the right filename — a PDF's internal title metadata isn't
      // reliably honored for that, but a File's name generally is.
      const file = new File([blob], reportFilename(store), { type: 'application/pdf' })
      const url = URL.createObjectURL(file)

      window.open(url, '_blank')

      const link = document.createElement('a')
      link.href = url
      link.download = reportFilename(store)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col gap-6 p-4 pb-16">
      <header className="flex items-center justify-between pt-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {store.store_name}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {rep.name} · {store.visit_date} · {plantType?.name} · {doorType?.name}
            {store.outlying && ' · Outlying'}
            {store.casem && ' · Casem'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={onBackToList} className="text-sm text-slate-400 hover:underline">
            ← Your surveys
          </button>
          <button
            onClick={() => setEditingStoreDetails(true)}
            className="text-sm text-slate-400 hover:underline"
          >
            Edit store details
          </button>
        </div>
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmitItem}
        className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {editingItemId ? 'Edit case or line-up' : 'Add a case or line-up'}
        </h2>

        <div className="flex gap-2 rounded-lg border border-slate-300 p-1 dark:border-slate-700">
          <button
            type="button"
            onClick={() =>
              setForm({ ...emptyItemForm, categoryId: form.categoryId, isGdf: false, isPluginFreezer: false })
            }
            className={`flex-1 rounded-md p-2 text-sm font-medium ${
              !form.isGdf && !form.isPluginFreezer
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Door Retrofit
          </button>
          <button
            type="button"
            onClick={() =>
              setForm({ ...emptyItemForm, categoryId: form.categoryId, isGdf: true, isPluginFreezer: false })
            }
            className={`flex-1 rounded-md p-2 text-sm font-medium ${
              form.isGdf
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Casem
          </button>
          <button
            type="button"
            onClick={() =>
              setForm({ ...emptyItemForm, categoryId: form.categoryId, isGdf: false, isPluginFreezer: true })
            }
            className={`flex-1 rounded-md p-2 text-sm font-medium ${
              form.isPluginFreezer
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Plug-in Freezer
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600 dark:text-slate-400">Category</span>
          <select
            required
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">— select —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {!form.isGdf && !form.isPluginFreezer && (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600 dark:text-slate-400">Case type</span>
            <select
              required
              value={form.caseTypeId}
              onChange={(e) => setForm({ ...form, caseTypeId: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">— select —</option>
              {caseTypes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {form.isPluginFreezer ? (
          <>
            <p className="text-xs text-slate-400">
              Most lineups have Spine units in the middle with an End unit capping each side —
              fill in either or both.
            </p>

            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Spine (middle, double-depth)
              </span>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Remote spine unit on site
                </span>
                <select
                  value={form.spineRemoteFreezerTypeId}
                  onChange={(e) => setForm({ ...form, spineRemoteFreezerTypeId: e.target.value })}
                  className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">— none —</option>
                  {remoteFreezerTypes
                    .filter((r) => r.shape === 'spine')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.length_m}m)
                      </option>
                    ))}
                </select>
              </label>
              {form.spineRemoteFreezerTypeId && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600 dark:text-slate-400">How many on site</span>
                    <input
                      required
                      type="number"
                      inputMode="numeric"
                      step="1"
                      value={form.spineRemoteQty}
                      onChange={(e) => setForm({ ...form, spineRemoteQty: e.target.value })}
                      className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Replace with</span>
                    <select
                      required
                      value={form.spinePlugInFreezerTypeId}
                      onChange={(e) => setForm({ ...form, spinePlugInFreezerTypeId: e.target.value })}
                      className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">— select —</option>
                      {plugInFreezerTypes
                        .filter((p) => p.shape === 'spine')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.length_m}m)
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                End (each side, single-depth)
              </span>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Remote end unit on site
                </span>
                <select
                  value={form.endRemoteFreezerTypeId}
                  onChange={(e) => setForm({ ...form, endRemoteFreezerTypeId: e.target.value })}
                  className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">— none —</option>
                  {remoteFreezerTypes
                    .filter((r) => r.shape === 'end')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.length_m}m)
                      </option>
                    ))}
                </select>
              </label>
              {form.endRemoteFreezerTypeId && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600 dark:text-slate-400">How many on site</span>
                    <input
                      required
                      type="number"
                      inputMode="numeric"
                      step="1"
                      value={form.endRemoteQty}
                      onChange={(e) => setForm({ ...form, endRemoteQty: e.target.value })}
                      className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Replace with</span>
                    <select
                      required
                      value={form.endPlugInFreezerTypeId}
                      onChange={(e) => setForm({ ...form, endPlugInFreezerTypeId: e.target.value })}
                      className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">— select —</option>
                      {plugInFreezerTypes
                        .filter((p) => p.shape === 'end')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.length_m}m)
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
            </div>

            <span className="text-xs text-slate-400">
              The number of plug-in units needed, and the transport / joint kit / centre
              superstructure costs, are worked out automatically when the report is generated.
            </span>
          </>
        ) : form.isGdf ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600 dark:text-slate-400">Number of doors</span>
              <input
                required
                type="number"
                inputMode="numeric"
                step="1"
                value={form.qtyDoors}
                onChange={(e) => setForm({ ...form, qtyDoors: e.target.value })}
                className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Number of GDF units (physical cabinets)
              </span>
              <input
                required
                type="number"
                inputMode="numeric"
                step="1"
                value={form.qtyGdfUnits}
                onChange={(e) => setForm({ ...form, qtyGdfUnits: e.target.value })}
                className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <span className="text-xs text-slate-400">
                e.g. a 4dr + 4dr + 3dr + 3dr lineup = 14 doors across 4 units.
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.casem}
                onChange={(e) => setForm({ ...form, casem: e.target.checked })}
              />
              Casem (RH-adaptive door heater control)
            </label>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Case size or line-up length (ft)
              </span>
              <input
                required
                type="number"
                inputMode="decimal"
                step="0.1"
                value={form.qtyFt}
                onChange={(e) => setForm({ ...form, qtyFt: e.target.value })}
                className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.doors}
                  onChange={(e) => setForm({ ...form, doors: e.target.checked })}
                />
                Doors
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.reclad}
                  onChange={(e) => setForm({ ...form, reclad: e.target.checked })}
                />
                Reclad
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.canopyLed}
                  onChange={(e) => setForm({ ...form, canopyLed: e.target.checked })}
                />
                Canopy LEDs
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.undershelfLed}
                  onChange={(e) => setForm({ ...form, undershelfLed: e.target.checked })}
                />
                Undershelf LEDs
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.verticalLed}
                  onChange={(e) => setForm({ ...form, verticalLed: e.target.checked })}
                />
                Vertical LEDs
              </label>
            </div>

            {store.casem && form.doors && (
              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Number of cases in this line-up (for Casem cost)
                </span>
                <input
                  required
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={form.casemUnits}
                  onChange={(e) => setForm({ ...form, casemUnits: e.target.value })}
                  className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <span className="text-xs text-slate-400">
                  One Casem module per physical case, not per ft — a 4dr + 3dr line-up is 2 cases.
                </span>
              </label>
            )}
          </>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600 dark:text-slate-400">Notes</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="Anything worth noting about this case or line-up"
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-slate-900 p-3 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {editingItemId ? 'Save changes' : 'Add to store'}
          </button>
          {editingItemId && (
            <button
              type="button"
              onClick={resetItemForm}
              className="rounded-lg border border-slate-300 px-4 py-2 dark:border-slate-700"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Cases / line-ups captured ({items.length})
        </h2>
        {items.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">No cases added yet.</p>
        )}
        {items.map((item) => {
          const caseType = caseTypes.find((c) => c.id === item.case_type_id)
          const category = categories.find((c) => c.id === item.category_id)
          const spineRemoteType = remoteFreezerTypes.find((r) => r.id === item.spine_remote_freezer_type_id)
          const spinePlugInType = plugInFreezerTypes.find((p) => p.id === item.spine_plugin_freezer_type_id)
          const endRemoteType = remoteFreezerTypes.find((r) => r.id === item.end_remote_freezer_type_id)
          const endPlugInType = plugInFreezerTypes.find((p) => p.id === item.end_plugin_freezer_type_id)
          const plugInResult =
            item.is_plugin_freezer && plantType && plugInFreezerSettings
              ? calculatePlugInFreezerSavings(
                  spineRemoteType ?? null,
                  item.spine_remote_qty ?? 0,
                  spinePlugInType ?? null,
                  endRemoteType ?? null,
                  item.end_remote_qty ?? 0,
                  endPlugInType ?? null,
                  plantType.freezer_cop,
                  store.electricity_rate,
                  plugInFreezerSettings,
                )
              : null
          return (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {category?.name} —{' '}
                  {item.is_plugin_freezer
                    ? [spineRemoteType?.name, endRemoteType?.name].filter(Boolean).join(' + ')
                    : item.is_gdf
                      ? 'Casem'
                      : caseType?.name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {item.is_plugin_freezer ? (
                    <>
                      {spineRemoteType && `${item.spine_remote_qty}× ${spineRemoteType.length_m}m spine`}
                      {spineRemoteType && endRemoteType && ' + '}
                      {endRemoteType && `${item.end_remote_qty}× end`}
                      {plugInResult &&
                        ` · Replace with ${[
                          plugInResult.requiredSpinePlugInUnits > 0 && spinePlugInType
                            ? `${plugInResult.requiredSpinePlugInUnits}× ${spinePlugInType.name}`
                            : '',
                          plugInResult.requiredEndPlugInUnits > 0 && endPlugInType
                            ? `${plugInResult.requiredEndPlugInUnits}× ${endPlugInType.name}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' + ')}`}
                    </>
                  ) : item.is_gdf ? (
                    <>
                      {item.qty_doors} doors / {item.qty_gdf_units} units
                      {item.casem && ' · Casem'}
                    </>
                  ) : (
                    <>
                      {item.qty_ft}ft
                      {!item.doors && ' · No Doors'}
                      {item.reclad && ' · Reclad'}
                      {item.canopy_led && ' · Canopy LED'}
                      {item.undershelf_led && ' · Undershelf LED'}
                      {item.vertical_led && ' · Vertical LED'}
                      {store.casem && item.doors && !!item.casem_units && ` · Casem x${item.casem_units}`}
                    </>
                  )}
                </div>
                {item.notes && (
                  <div className="mt-1 text-xs italic text-slate-500 dark:text-slate-400">
                    {item.notes}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={() => startEditItem(item)}
                  className="text-sm text-slate-500 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="text-sm text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          )
        })}
      </section>

      <button
        onClick={handleFinish}
        disabled={items.length === 0 || generating}
        className="rounded-lg bg-emerald-600 p-3 font-medium text-white disabled:opacity-50"
      >
        {generating ? 'Generating…' : 'Finish & generate report'}
      </button>
    </div>
  )
}

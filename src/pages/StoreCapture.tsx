import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateStoreReport, reportFilename } from '../lib/pdf'
import type {
  AppSettings,
  CaseType,
  Category,
  CostRate,
  PlantType,
  StoreItem,
  StoreVisit,
} from '../types'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function StoreCapture() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [caseTypes, setCaseTypes] = useState<CaseType[]>([])
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([])
  const [costRates, setCostRates] = useState<CostRate[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)

  const [store, setStore] = useState<StoreVisit | null>(null)
  const [items, setItems] = useState<StoreItem[]>([])

  useEffect(() => {
    async function load() {
      const [catRes, caseRes, plantRes, costRes, settingsRes] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('case_types').select('*').order('name'),
        supabase.from('plant_types').select('*').order('name'),
        supabase.from('cost_rates').select('*'),
        supabase.from('app_settings').select('*').single(),
      ])
      const firstError =
        catRes.error || caseRes.error || plantRes.error || costRes.error || settingsRes.error
      if (firstError) {
        setError(firstError.message)
      } else {
        setCategories(catRes.data ?? [])
        setCaseTypes(caseRes.data ?? [])
        setPlantTypes(plantRes.data ?? [])
        setCostRates(costRes.data ?? [])
        setSettings(settingsRes.data)
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="p-4 text-sm text-slate-500 dark:text-slate-400">Loading…</div>
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-700 dark:text-red-300">
        Couldn't load data: {error}
      </div>
    )
  }

  if (!store) {
    return (
      <StoreProfileForm
        plantTypes={plantTypes}
        defaultRate={settings?.default_electricity_rate ?? 0}
        onCreated={setStore}
      />
    )
  }

  return (
    <ItemCapture
      store={store}
      items={items}
      setItems={setItems}
      categories={categories}
      caseTypes={caseTypes}
      plantTypes={plantTypes}
      costRates={costRates}
      settings={settings}
      onNewStore={() => {
        setStore(null)
        setItems([])
      }}
    />
  )
}

function StoreProfileForm({
  plantTypes,
  defaultRate,
  onCreated,
}: {
  plantTypes: PlantType[]
  defaultRate: number
  onCreated: (store: StoreVisit) => void
}) {
  const [storeName, setStoreName] = useState('')
  const [salesRepName, setSalesRepName] = useState('')
  const [plantTypeId, setPlantTypeId] = useState(plantTypes[0]?.id ?? '')
  const [rate, setRate] = useState(defaultRate.toString())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { data, error } = await supabase
      .from('store_visits')
      .insert({
        store_name: storeName,
        sales_rep_name: salesRepName,
        visit_date: todayISO(),
        plant_type_id: plantTypeId,
        electricity_rate: Number(rate) || 0,
      })
      .select()
      .single()

    if (error) setError(error.message)
    else onCreated(data)
    setSaving(false)
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col gap-6 p-4 pb-16">
      <header className="flex items-center justify-between pt-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          New store visit
        </h1>
        <Link to="/admin" className="text-sm text-slate-400 hover:underline">
          Admin
        </Link>
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
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Sales rep name</span>
          <input
            required
            value={salesRepName}
            onChange={(e) => setSalesRepName(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Date</span>
          <input
            disabled
            value={todayISO()}
            className="rounded-lg border border-slate-300 bg-slate-100 p-3 text-base text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
          />
        </label>

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

        <button
          type="submit"
          disabled={saving || plantTypes.length === 0}
          className="rounded-lg bg-slate-900 p-3 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          Start capturing cases
        </button>
      </form>
    </div>
  )
}

function ItemCapture({
  store,
  items,
  setItems,
  categories,
  caseTypes,
  plantTypes,
  costRates,
  settings,
  onNewStore,
}: {
  store: StoreVisit
  items: StoreItem[]
  setItems: React.Dispatch<React.SetStateAction<StoreItem[]>>
  categories: Category[]
  caseTypes: CaseType[]
  plantTypes: PlantType[]
  costRates: CostRate[]
  settings: AppSettings | null
  onNewStore: () => void
}) {
  const [categoryId, setCategoryId] = useState('')
  const [caseTypeId, setCaseTypeId] = useState('')
  const [qtyFt, setQtyFt] = useState('')
  const [reclad, setReclad] = useState(false)
  const [canopyLed, setCanopyLed] = useState(false)
  const [undershelfLed, setUndershelfLed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const plantType = plantTypes.find((p) => p.id === store.plant_type_id)

  async function handleAddItem(e: FormEvent) {
    e.preventDefault()
    if (!categoryId || !caseTypeId || !qtyFt) return
    setSaving(true)
    setError(null)

    const { data, error } = await supabase
      .from('store_items')
      .insert({
        store_visit_id: store.id,
        category_id: categoryId,
        case_type_id: caseTypeId,
        qty_ft: Number(qtyFt) || 0,
        reclad,
        canopy_led: canopyLed,
        undershelf_led: undershelfLed,
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
    } else {
      setItems((prev) => [...prev, data])
      setCaseTypeId('')
      setQtyFt('')
      setReclad(false)
      setCanopyLed(false)
      setUndershelfLed(false)
    }
    setSaving(false)
  }

  async function handleDeleteItem(id: string) {
    const { error } = await supabase.from('store_items').delete().eq('id', id)
    if (error) setError(error.message)
    else setItems((prev) => prev.filter((i) => i.id !== id))
  }

  function handleFinish() {
    if (!plantType || !settings) return
    setGenerating(true)
    try {
      const doc = generateStoreReport({
        store,
        items,
        caseTypes,
        categories,
        plantType,
        settings,
        costRates,
      })
      const blob = doc.output('blob')
      const url = URL.createObjectURL(blob)

      window.open(url, '_blank')

      // Browser PDF viewers don't reliably use a PDF's internal metadata for
      // "Save As" filenames, so save a correctly-named copy directly.
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
            {store.sales_rep_name} · {store.visit_date} · {plantType?.name}
          </p>
        </div>
        <button onClick={onNewStore} className="text-sm text-slate-400 hover:underline">
          New store
        </button>
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <form
        onSubmit={handleAddItem}
        className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Add a case or line-up</h2>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600 dark:text-slate-400">Category</span>
          <select
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
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

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600 dark:text-slate-400">Case type</span>
          <select
            required
            value={caseTypeId}
            onChange={(e) => setCaseTypeId(e.target.value)}
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

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600 dark:text-slate-400">Case size or line-up length (ft)</span>
          <input
            required
            type="number"
            inputMode="decimal"
            step="0.1"
            value={qtyFt}
            onChange={(e) => setQtyFt(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={reclad} onChange={(e) => setReclad(e.target.checked)} />
            Reclad
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={canopyLed}
              onChange={(e) => setCanopyLed(e.target.checked)}
            />
            Canopy LEDs
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={undershelfLed}
              onChange={(e) => setUndershelfLed(e.target.checked)}
            />
            Undershelf LEDs
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 p-3 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          Add to store
        </button>
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
          return (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {category?.name} — {caseType?.name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {item.qty_ft}ft
                  {item.reclad && ' · Reclad'}
                  {item.canopy_led && ' · Canopy LED'}
                  {item.undershelf_led && ' · Undershelf LED'}
                </div>
              </div>
              <button
                onClick={() => handleDeleteItem(item.id)}
                className="text-sm text-red-500 hover:underline"
              >
                Remove
              </button>
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

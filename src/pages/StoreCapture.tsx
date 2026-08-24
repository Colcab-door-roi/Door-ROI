import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateStoreReport, reportFilename } from '../lib/pdf'
import type {
  AppSettings,
  CaseType,
  Category,
  CostRate,
  DoorType,
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
  const [doorTypes, setDoorTypes] = useState<DoorType[]>([])
  const [costRates, setCostRates] = useState<CostRate[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)

  const [store, setStore] = useState<StoreVisit | null>(null)
  const [items, setItems] = useState<StoreItem[]>([])

  useEffect(() => {
    async function load() {
      const [catRes, caseRes, plantRes, doorRes, costRes, settingsRes] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('case_types').select('*').order('name'),
        supabase.from('plant_types').select('*').order('name'),
        supabase.from('door_types').select('*').order('name'),
        supabase.from('cost_rates').select('*'),
        supabase.from('app_settings').select('*').single(),
      ])
      const firstError =
        catRes.error || caseRes.error || plantRes.error || doorRes.error || costRes.error || settingsRes.error
      if (firstError) {
        setError(firstError.message)
      } else {
        setCategories(catRes.data ?? [])
        setCaseTypes(caseRes.data ?? [])
        setPlantTypes(plantRes.data ?? [])
        setDoorTypes(doorRes.data ?? [])
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
        doorTypes={doorTypes}
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
      doorTypes={doorTypes}
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
  doorTypes,
  defaultRate,
  onCreated,
}: {
  plantTypes: PlantType[]
  doorTypes: DoorType[]
  defaultRate: number
  onCreated: (store: StoreVisit) => void
}) {
  const [storeName, setStoreName] = useState('')
  const [salesRepName, setSalesRepName] = useState('')
  const [plantTypeId, setPlantTypeId] = useState(plantTypes[0]?.id ?? '')
  const [doorTypeId, setDoorTypeId] = useState(doorTypes[0]?.id ?? '')
  const [rate, setRate] = useState(defaultRate.toString())
  const [outlying, setOutlying] = useState(false)
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
        door_type_id: doorTypeId,
        electricity_rate: Number(rate) || 0,
        outlying,
      })
      .select()
      .single()

    if (error) setError(error.message)
    else onCreated(data)
    setSaving(false)
  }

  const canSubmit = plantTypes.length > 0 && doorTypes.length > 0

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col gap-6 p-4 pb-16">
      <header className="flex items-center justify-between pt-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Store survey
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
          <span className="text-xs text-slate-400">Applies to every case in this survey.</span>
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

        <button
          type="submit"
          disabled={saving || !canSubmit}
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
  doorTypes,
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
  doorTypes: DoorType[]
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
  const [notes, setNotes] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const plantType = plantTypes.find((p) => p.id === store.plant_type_id)
  const doorType = doorTypes.find((d) => d.id === store.door_type_id)

  function resetItemForm() {
    setEditingItemId(null)
    setCategoryId('')
    setCaseTypeId('')
    setQtyFt('')
    setReclad(false)
    setCanopyLed(false)
    setUndershelfLed(false)
    setNotes('')
  }

  function startEditItem(item: StoreItem) {
    setEditingItemId(item.id)
    setCategoryId(item.category_id)
    setCaseTypeId(item.case_type_id)
    setQtyFt(item.qty_ft.toString())
    setReclad(item.reclad)
    setCanopyLed(item.canopy_led)
    setUndershelfLed(item.undershelf_led)
    setNotes(item.notes ?? '')
  }

  async function handleSubmitItem(e: FormEvent) {
    e.preventDefault()
    if (!categoryId || !caseTypeId || !qtyFt) return
    setSaving(true)
    setError(null)

    const payload = {
      category_id: categoryId,
      case_type_id: caseTypeId,
      qty_ft: Number(qtyFt) || 0,
      reclad,
      canopy_led: canopyLed,
      undershelf_led: undershelfLed,
      notes: notes || null,
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
    if (!plantType || !doorType || !settings) return
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
            {store.sales_rep_name} · {store.visit_date} · {plantType?.name} · {doorType?.name}
            {store.outlying && ' · Outlying'}
          </p>
        </div>
        <button onClick={onNewStore} className="text-sm text-slate-400 hover:underline">
          New survey
        </button>
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

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600 dark:text-slate-400">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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

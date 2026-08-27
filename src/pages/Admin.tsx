import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activityLog'
import type {
  AppSettings,
  CasemSettings,
  CaseType,
  Category,
  CostRate,
  DoorType,
  PlantType,
  SalesRep,
  StoreVisit,
} from '../types'

const PASSCODE = import.meta.env.VITE_ADMIN_PASSCODE as string | undefined
const SESSION_KEY = 'fridge-admin-unlocked'

export default function Admin() {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === 'true',
  )
  const [passcodeInput, setPasscodeInput] = useState('')
  const [passcodeError, setPasscodeError] = useState('')
  const [tab, setTab] = useState<'data' | 'reps'>('data')

  if (!unlocked) {
    return (
      <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Admin access
        </h1>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!PASSCODE) {
              setPasscodeError('No VITE_ADMIN_PASSCODE configured — set it in .env')
              return
            }
            if (passcodeInput === PASSCODE) {
              sessionStorage.setItem(SESSION_KEY, 'true')
              setUnlocked(true)
            } else {
              setPasscodeError('Incorrect passcode')
            }
          }}
          className="flex flex-col gap-3"
        >
          <input
            type="password"
            autoFocus
            placeholder="Passcode"
            className="rounded-lg border border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            value={passcodeInput}
            onChange={(e) => setPasscodeInput(e.target.value)}
          />
          {passcodeError && <p className="text-sm text-red-600">{passcodeError}</p>}
          <button
            type="submit"
            className="rounded-lg bg-slate-900 p-3 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Unlock
          </button>
        </form>
        <Link to="/" className="text-sm text-slate-400 hover:underline">
          ← Back to calculator
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col gap-8 p-4 pb-16">
      <header className="flex items-center justify-between pt-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Data admin
        </h1>
        <Link to="/" className="text-sm text-slate-400 hover:underline">
          ← Calculator
        </Link>
      </header>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setTab('data')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'data'
              ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
              : 'text-slate-500'
          }`}
        >
          Data
        </button>
        <button
          onClick={() => setTab('reps')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'reps'
              ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
              : 'text-slate-500'
          }`}
        >
          Sales Reps
        </button>
      </div>

      {tab === 'data' ? (
        <>
          <SettingsSection />
          <CostRatesSection />
          <DoorTypesSection />
          <CasemSection />
          <CategoriesSection />
          <CaseTypesSection />
          <PlantTypesSection />
        </>
      ) : (
        <SalesRepsSection />
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">{title}</h2>
      {children}
    </section>
  )
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      {error}
    </p>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <input
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
    </label>
  )
}

// --- Settings (default electricity rate, legal disclaimer) ---

function SettingsSection() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [rate, setRate] = useState('')
  const [priceIncrease, setPriceIncrease] = useState('')
  const [subassemblyCost, setSubassemblyCost] = useState('')
  const [outlyingCost, setOutlyingCost] = useState('')
  const [vatPercent, setVatPercent] = useState('')
  const [disclaimer, setDisclaimer] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState<'header' | 'footer' | null>(null)

  async function load() {
    const { data, error } = await supabase.from('app_settings').select('*').single()
    if (error) setError(error.message)
    else if (data) {
      setSettings(data)
      setRate(data.default_electricity_rate.toString())
      setPriceIncrease(data.annual_price_increase_percent.toString())
      setSubassemblyCost(data.subassembly_transport_labour_cost_4ft.toString())
      setOutlyingCost(data.outlying_labour_cost_4ft.toString())
      setVatPercent(data.vat_percent.toString())
      setDisclaimer(data.legal_disclaimer ?? '')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    const { error } = await supabase
      .from('app_settings')
      .update({
        default_electricity_rate: Number(rate) || 0,
        annual_price_increase_percent: Number(priceIncrease) || 0,
        subassembly_transport_labour_cost_4ft: Number(subassemblyCost) || 0,
        outlying_labour_cost_4ft: Number(outlyingCost) || 0,
        vat_percent: Number(vatPercent) || 0,
        legal_disclaimer: disclaimer,
      })
      .eq('id', true)
    if (error) setError(error.message)
    else {
      setSaved(true)
      await logActivity('Settings updated')
    }
    setSaving(false)
  }

  async function handleImageUpload(file: File, slot: 'header' | 'footer') {
    setUploading(slot)
    setError(null)
    const column = slot === 'header' ? 'header_image_url' : 'footer_image_url'
    const path = `${slot}-${Date.now()}.jpg`

    const { error: uploadError } = await supabase.storage
      .from('report-assets')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadError) {
      setError(uploadError.message)
      setUploading(null)
      return
    }

    const { data } = supabase.storage.from('report-assets').getPublicUrl(path)
    const { error: saveError } = await supabase
      .from('app_settings')
      .update({ [column]: data.publicUrl })
      .eq('id', true)

    if (saveError) setError(saveError.message)
    else {
      await load()
      await logActivity(`PDF ${slot} image updated`)
    }
    setUploading(null)
  }

  if (loading) return <Card title="Settings"><p className="text-sm text-slate-500">Loading…</p></Card>
  if (!settings) return <Card title="Settings"><ErrorBox error={error} /></Card>

  return (
    <Card title="Settings">
      <ErrorBox error={error} />
      <form
        onSubmit={handleSave}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <Field label="Default electricity rate (R/kWh)" value={rate} onChange={setRate} type="number" />
        <Field
          label="Annual electricity price increase (%)"
          value={priceIncrease}
          onChange={setPriceIncrease}
          type="number"
        />
        <Field
          label="Subassembly, transport & labour cost (R per 4ft)"
          value={subassemblyCost}
          onChange={setSubassemblyCost}
          type="number"
        />
        <Field
          label="Outlying labour cost (R per 4ft)"
          value={outlyingCost}
          onChange={setOutlyingCost}
          type="number"
        />
        <p className="text-xs text-slate-400">
          Both apply to the survey's total footage across all cases (total ft ÷ 4 × cost) —
          subassembly/transport/labour always applies; outlying labour only when the survey is
          flagged "Outlying".
        </p>
        <Field label="VAT (%)" value={vatPercent} onChange={setVatPercent} type="number" />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Legal disclaimer (shown on PDF reports)</span>
          <textarea
            value={disclaimer}
            onChange={(e) => setDisclaimer(e.target.value)}
            rows={4}
            className="rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            Save settings
          </button>
          {saved && <span className="text-sm text-emerald-600">Saved</span>}
        </div>
      </form>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">PDF header image (JPG)</span>
          {settings.header_image_url && (
            <img src={settings.header_image_url} alt="Header preview" className="h-16 w-full rounded object-contain" />
          )}
          <input
            type="file"
            accept="image/jpeg"
            disabled={uploading === 'header'}
            onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'header')}
            className="text-sm"
          />
          {uploading === 'header' && <span className="text-xs text-slate-500">Uploading…</span>}
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">PDF footer image (JPG)</span>
          {settings.footer_image_url && (
            <img src={settings.footer_image_url} alt="Footer preview" className="h-16 w-full rounded object-contain" />
          )}
          <input
            type="file"
            accept="image/jpeg"
            disabled={uploading === 'footer'}
            onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'footer')}
            className="text-sm"
          />
          {uploading === 'footer' && <span className="text-xs text-slate-500">Uploading…</span>}
        </div>
      </div>
    </Card>
  )
}

// --- Cost rates (door / reclad / canopy LED / undershelf LED, 4ft/5ft/7ft) ---

function CostRatesSection() {
  const [rates, setRates] = useState<CostRate[]>([])
  const [drafts, setDrafts] = useState<Record<string, { cost_4ft: string; cost_5ft: string; cost_7ft: string }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingType, setSavingType] = useState<string | null>(null)

  const [verticalLedCost, setVerticalLedCost] = useState('')
  const [verticalLedSaving, setVerticalLedSaving] = useState(false)
  const [verticalLedSaved, setVerticalLedSaved] = useState(false)

  async function load() {
    setLoading(true)
    const [ratesRes, settingsRes] = await Promise.all([
      supabase.from('cost_rates').select('*').order('cost_type'),
      supabase.from('app_settings').select('vertical_led_cost_4ft').single(),
    ])
    if (ratesRes.error) setError(ratesRes.error.message)
    else if (ratesRes.data) {
      setRates(ratesRes.data)
      const d: typeof drafts = {}
      for (const r of ratesRes.data) {
        d[r.cost_type] = {
          cost_4ft: r.cost_4ft.toString(),
          cost_5ft: r.cost_5ft.toString(),
          cost_7ft: r.cost_7ft.toString(),
        }
      }
      setDrafts(d)
    }
    if (settingsRes.data) setVerticalLedCost(settingsRes.data.vertical_led_cost_4ft.toString())
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSave(costType: string) {
    setSavingType(costType)
    setError(null)
    const d = drafts[costType]
    const { error } = await supabase
      .from('cost_rates')
      .update({
        cost_4ft: Number(d.cost_4ft) || 0,
        cost_5ft: Number(d.cost_5ft) || 0,
        cost_7ft: Number(d.cost_7ft) || 0,
      })
      .eq('cost_type', costType)
    if (error) setError(error.message)
    else {
      const label = rates.find((r) => r.cost_type === costType)?.label ?? costType
      await load()
      await logActivity(`${label} cost rate updated`)
    }
    setSavingType(null)
  }

  async function handleSaveVerticalLed() {
    setVerticalLedSaving(true)
    setError(null)
    setVerticalLedSaved(false)
    const { error } = await supabase
      .from('app_settings')
      .update({ vertical_led_cost_4ft: Number(verticalLedCost) || 0 })
      .eq('id', true)
    if (error) setError(error.message)
    else {
      setVerticalLedSaved(true)
      await logActivity('Vertical LED cost updated')
    }
    setVerticalLedSaving(false)
  }

  return (
    <Card title="Cost rates">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        ~90% of jobs price in fixed 4ft/5ft/7ft segments. Any other case length is priced
        proportionally off the 4ft rate: (length ÷ 4) × 4ft cost.
      </p>
      <ErrorBox error={error} />
      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      <div className="flex flex-col gap-3">
        {rates.map((r) => {
          const d = drafts[r.cost_type] ?? { cost_4ft: '', cost_5ft: '', cost_7ft: '' }
          return (
            <div
              key={r.cost_type}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
            >
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{r.label}</h3>
              <div className="grid grid-cols-3 gap-3">
                <Field
                  label="4ft cost (R)"
                  value={d.cost_4ft}
                  type="number"
                  onChange={(v) => setDrafts({ ...drafts, [r.cost_type]: { ...d, cost_4ft: v } })}
                />
                <Field
                  label="5ft cost (R)"
                  value={d.cost_5ft}
                  type="number"
                  onChange={(v) => setDrafts({ ...drafts, [r.cost_type]: { ...d, cost_5ft: v } })}
                />
                <Field
                  label="7ft cost (R)"
                  value={d.cost_7ft}
                  type="number"
                  onChange={(v) => setDrafts({ ...drafts, [r.cost_type]: { ...d, cost_7ft: v } })}
                />
              </div>
              <button
                onClick={() => handleSave(r.cost_type)}
                disabled={savingType === r.cost_type}
                className="self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              >
                Save {r.label}
              </button>
            </div>
          )
        })}

        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Vertical LED</h3>
          <p className="text-xs text-slate-400">
            Flat rate, always proportional — no 5ft/7ft fixed pricing (length ÷ 4 × cost).
          </p>
          <Field
            label="4ft cost (R)"
            value={verticalLedCost}
            type="number"
            onChange={setVerticalLedCost}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveVerticalLed}
              disabled={verticalLedSaving}
              className="self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              Save Vertical LED
            </button>
            {verticalLedSaved && <span className="text-sm text-emerald-600">Saved</span>}
          </div>
        </div>
      </div>
    </Card>
  )
}

// --- Categories ---

function CategoriesSection() {
  const [items, setItems] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('categories').select('*').order('name')
    if (error) setError(error.message)
    else setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const { error } = await supabase.from('categories').insert({ name: name.trim() })
    if (error) setError(error.message)
    else {
      await logActivity(`Category added: ${name.trim()}`)
      setName('')
      await load()
    }
  }

  async function handleDelete(id: string, deletedName: string) {
    if (!confirm('Delete this category? Case types using it will need reassigning.')) return
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) setError(error.message)
    else {
      await logActivity(`Category deleted: ${deletedName}`)
      await load()
    }
  }

  return (
    <Card title="Categories">
      <ErrorBox error={error} />
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
          className="flex-1 rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          Add
        </button>
      </form>
      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      <div className="flex flex-wrap gap-2">
        {items.map((c) => (
          <span
            key={c.id}
            className="flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
          >
            {c.name}
            <button onClick={() => handleDelete(c.id, c.name)} className="text-red-500 hover:underline">
              ×
            </button>
          </span>
        ))}
      </div>
    </Card>
  )
}

// --- Case types ---

const emptyCaseForm = {
  name: '',
  w_per_ft_without_doors: '',
  savings_percent: '',
  notes: '',
}

function CaseTypesSection() {
  const [items, setItems] = useState<CaseType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyCaseForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('case_types')
      .select('*')
      .order('name', { ascending: true })
    if (error) setError(error.message)
    else setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function startEdit(item: CaseType) {
    setEditingId(item.id)
    setForm({
      name: item.name,
      w_per_ft_without_doors: item.w_per_ft_without_doors.toString(),
      savings_percent: item.savings_percent.toString(),
      notes: item.notes ?? '',
    })
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyCaseForm)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name,
      w_per_ft_without_doors: Number(form.w_per_ft_without_doors) || 0,
      savings_percent: Number(form.savings_percent) || 0,
      notes: form.notes || null,
    }

    const { error } = editingId
      ? await supabase.from('case_types').update(payload).eq('id', editingId)
      : await supabase.from('case_types').insert(payload)

    if (error) setError(error.message)
    else {
      await logActivity(editingId ? `Case type updated: ${form.name}` : `Case type added: ${form.name}`)
      resetForm()
      await load()
    }
    setSaving(false)
  }

  async function handleDelete(id: string, deletedName: string) {
    if (!confirm('Delete this case type?')) return
    const { error } = await supabase.from('case_types').delete().eq('id', id)
    if (error) setError(error.message)
    else {
      await logActivity(`Case type deleted: ${deletedName}`)
      await load()
    }
  }

  return (
    <Card title="Case types">
      <ErrorBox error={error} />
      <form
        onSubmit={handleSave}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {editingId ? 'Edit case type' : 'Add new case type'}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Field
            label="W/ft without doors"
            value={form.w_per_ft_without_doors}
            onChange={(v) => setForm({ ...form, w_per_ft_without_doors: v })}
            type="number"
            required
          />
          <Field
            label="Door saving (%)"
            value={form.savings_percent}
            onChange={(v) => setForm({ ...form, savings_percent: v })}
            type="number"
            required
          />
          <Field label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {editingId ? 'Save changes' : 'Add case type'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-300 px-4 py-2 dark:border-slate-700"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="flex flex-col gap-2">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-slate-500">No case types yet.</p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800"
          >
            <div>
              <div className="font-medium text-slate-900 dark:text-slate-100">{item.name}</div>
              <div className="text-xs text-slate-500">
                {item.w_per_ft_without_doors} W/ft, {item.savings_percent}% saving
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(item)} className="text-sm text-slate-500 hover:underline">
                Edit
              </button>
              <button onClick={() => handleDelete(item.id, item.name)} className="text-sm text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// --- Door types ---

const emptyDoorForm = { name: '', cost_4ft: '', cost_5ft: '', cost_7ft: '', heater_watts_per_ft: '' }

function DoorTypesSection() {
  const [items, setItems] = useState<DoorType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyDoorForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('door_types').select('*').order('name')
    if (error) setError(error.message)
    else setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function startEdit(item: DoorType) {
    setEditingId(item.id)
    setForm({
      name: item.name,
      cost_4ft: item.cost_4ft.toString(),
      cost_5ft: item.cost_5ft.toString(),
      cost_7ft: item.cost_7ft.toString(),
      heater_watts_per_ft: item.heater_watts_per_ft.toString(),
    })
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyDoorForm)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name,
      cost_4ft: Number(form.cost_4ft) || 0,
      cost_5ft: Number(form.cost_5ft) || 0,
      cost_7ft: Number(form.cost_7ft) || 0,
      heater_watts_per_ft: Number(form.heater_watts_per_ft) || 0,
    }

    const { error } = editingId
      ? await supabase.from('door_types').update(payload).eq('id', editingId)
      : await supabase.from('door_types').insert(payload)

    if (error) setError(error.message)
    else {
      await logActivity(editingId ? `Door type updated: ${form.name}` : `Door type added: ${form.name}`)
      resetForm()
      await load()
    }
    setSaving(false)
  }

  async function handleDelete(id: string, deletedName: string) {
    if (!confirm('Delete this door type?')) return
    const { error } = await supabase.from('door_types').delete().eq('id', id)
    if (error) setError(error.message)
    else {
      await logActivity(`Door type deleted: ${deletedName}`)
      await load()
    }
  }

  return (
    <Card title="Door types">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Chosen once per store survey and applied to every case in it. Cost follows the same
        4ft/5ft/7ft rule as other cost rates.
      </p>
      <ErrorBox error={error} />
      <form
        onSubmit={handleSave}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {editingId ? 'Edit door type' : 'Add new door type'}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Field
            label="4ft cost (R)"
            value={form.cost_4ft}
            onChange={(v) => setForm({ ...form, cost_4ft: v })}
            type="number"
            required
          />
          <Field
            label="5ft cost (R)"
            value={form.cost_5ft}
            onChange={(v) => setForm({ ...form, cost_5ft: v })}
            type="number"
            required
          />
          <Field
            label="7ft cost (R)"
            value={form.cost_7ft}
            onChange={(v) => setForm({ ...form, cost_7ft: v })}
            type="number"
            required
          />
          <Field
            label="Heater consumption (W/ft)"
            value={form.heater_watts_per_ft}
            onChange={(v) => setForm({ ...form, heater_watts_per_ft: v })}
            type="number"
          />
        </div>
        <p className="text-xs text-slate-400">
          Only for heated glass doors — draws power directly (not through the compressor) to
          prevent condensation, offsetting some of the energy savings. Leave at 0 for unheated
          doors.
        </p>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {editingId ? 'Save changes' : 'Add door type'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-300 px-4 py-2 dark:border-slate-700"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="flex flex-col gap-2">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-slate-500">No door types yet.</p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800"
          >
            <div>
              <div className="font-medium text-slate-900 dark:text-slate-100">{item.name}</div>
              <div className="text-xs text-slate-500">
                R{item.cost_4ft}/4ft, R{item.cost_5ft}/5ft, R{item.cost_7ft}/7ft
                {item.heater_watts_per_ft > 0 && ` · Heated (${item.heater_watts_per_ft} W/ft)`}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(item)} className="text-sm text-slate-500 hover:underline">
                Edit
              </button>
              <button onClick={() => handleDelete(item.id, item.name)} className="text-sm text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// --- GDF / Casem (RH-adaptive door heater controller) ---

function CasemSection() {
  const [settings, setSettings] = useState<CasemSettings | null>(null)
  const [baselineWattsPerDoor, setBaselineWattsPerDoor] = useState('')
  const [costPerUnit, setCostPerUnit] = useState('')
  const [installationCostPerUnit, setInstallationCostPerUnit] = useState('')
  const [savingsPercent, setSavingsPercent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('casem_settings').select('*').single()
      if (error) setError(error.message)
      else if (data) {
        setSettings(data)
        setBaselineWattsPerDoor(data.baseline_watts_per_door.toString())
        setCostPerUnit(data.cost_per_unit.toString())
        setInstallationCostPerUnit(data.installation_cost_per_unit.toString())
        setSavingsPercent(data.savings_percent.toString())
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    const { error } = await supabase
      .from('casem_settings')
      .update({
        baseline_watts_per_door: Number(baselineWattsPerDoor) || 0,
        cost_per_unit: Number(costPerUnit) || 0,
        installation_cost_per_unit: Number(installationCostPerUnit) || 0,
        savings_percent: Number(savingsPercent) || 0,
      })
      .eq('id', true)
    if (error) setError(error.message)
    else {
      setSaved(true)
      await logActivity('GDF / Casem settings updated')
    }
    setSaving(false)
  }

  if (loading) return <Card title="GDF / Casem"><p className="text-sm text-slate-500">Loading…</p></Card>
  if (!settings) return <Card title="GDF / Casem"><ErrorBox error={error} /></Card>

  return (
    <Card title="GDF / Casem">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        GDF (Glass Door Freezer) is captured by door/unit count, not ft — one baseline load
        applies to every GDF line-up. Casem is an RH-adaptive door heater controller: one module
        per physical GDF unit (cost + installation × number of units); its saving is a %
        reduction on the baseline load, scaled by total door count.
      </p>
      <ErrorBox error={error} />
      <form
        onSubmit={handleSave}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Baseline door & frame load (W/door)"
            value={baselineWattsPerDoor}
            onChange={setBaselineWattsPerDoor}
            type="number"
          />
          <Field label="Casem cost per unit (R)" value={costPerUnit} onChange={setCostPerUnit} type="number" />
          <Field
            label="Casem installation cost per unit (R)"
            value={installationCostPerUnit}
            onChange={setInstallationCostPerUnit}
            type="number"
          />
          <Field label="Casem savings (%)" value={savingsPercent} onChange={setSavingsPercent} type="number" />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            Save
          </button>
          {saved && <span className="text-sm text-emerald-600">Saved</span>}
        </div>
      </form>
    </Card>
  )
}

// --- Plant types ---

const emptyPlantForm = { name: '', cop: '' }

function PlantTypesSection() {
  const [items, setItems] = useState<PlantType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyPlantForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('plant_types')
      .select('*')
      .order('name', { ascending: true })
    if (error) setError(error.message)
    else setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function startEdit(item: PlantType) {
    setEditingId(item.id)
    setForm({ name: item.name, cop: item.cop.toString() })
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyPlantForm)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = { name: form.name, cop: Number(form.cop) || 0 }

    const { error } = editingId
      ? await supabase.from('plant_types').update(payload).eq('id', editingId)
      : await supabase.from('plant_types').insert(payload)

    if (error) setError(error.message)
    else {
      await logActivity(editingId ? `Plant type updated: ${form.name}` : `Plant type added: ${form.name}`)
      resetForm()
      await load()
    }
    setSaving(false)
  }

  async function handleDelete(id: string, deletedName: string) {
    if (!confirm('Delete this plant type?')) return
    const { error } = await supabase.from('plant_types').delete().eq('id', id)
    if (error) setError(error.message)
    else {
      await logActivity(`Plant type deleted: ${deletedName}`)
      await load()
    }
  }

  return (
    <Card title="Refrigeration plant types">
      <ErrorBox error={error} />
      <form
        onSubmit={handleSave}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {editingId ? 'Edit plant type' : 'Add new plant type'}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Field label="COP" value={form.cop} onChange={(v) => setForm({ ...form, cop: v })} type="number" required />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {editingId ? 'Save changes' : 'Add plant type'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-300 px-4 py-2 dark:border-slate-700"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="flex flex-col gap-2">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-slate-500">No plant types yet.</p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800"
          >
            <div className="font-medium text-slate-900 dark:text-slate-100">
              {item.name} — COP {item.cop}
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(item)} className="text-sm text-slate-500 hover:underline">
                Edit
              </button>
              <button onClick={() => handleDelete(item.id, item.name)} className="text-sm text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// --- Sales reps ---

const emptyRepForm = { name: '', region: '', passcode: '' }

function SalesRepsSection() {
  const [reps, setReps] = useState<SalesRep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyRepForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [surveysByRep, setSurveysByRep] = useState<Record<string, StoreVisit[]>>({})
  const [surveysLoading, setSurveysLoading] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('sales_reps').select('*').order('name')
    if (error) setError(error.message)
    else setReps(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function startEdit(rep: SalesRep) {
    setEditingId(rep.id)
    setForm({ name: rep.name, region: rep.region, passcode: rep.passcode })
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyRepForm)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = { name: form.name, region: form.region, passcode: form.passcode }

    const { error } = editingId
      ? await supabase.from('sales_reps').update(payload).eq('id', editingId)
      : await supabase.from('sales_reps').insert(payload)

    if (error) setError(error.message)
    else {
      await logActivity(editingId ? `Sales rep updated: ${form.name}` : `Sales rep added: ${form.name}`)
      resetForm()
      await load()
    }
    setSaving(false)
  }

  async function handleDelete(id: string, name: string) {
    if (
      !confirm(
        `Delete sales rep ${name}? Their past surveys will remain but won't be linked to an account.`,
      )
    )
      return
    const { error } = await supabase.from('sales_reps').delete().eq('id', id)
    if (error) setError(error.message)
    else {
      await logActivity(`Sales rep deleted: ${name}`)
      await load()
    }
  }

  async function toggleExpand(rep: SalesRep) {
    if (expandedId === rep.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(rep.id)
    if (!surveysByRep[rep.id]) {
      setSurveysLoading(rep.id)
      const { data, error } = await supabase
        .from('store_visits')
        .select('*')
        .eq('sales_rep_id', rep.id)
        .order('visit_date', { ascending: false })
      if (!error) setSurveysByRep((prev) => ({ ...prev, [rep.id]: data ?? [] }))
      setSurveysLoading(null)
    }
  }

  return (
    <Card title="Sales reps">
      <ErrorBox error={error} />
      <form
        onSubmit={handleSave}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      >
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {editingId ? 'Edit sales rep' : 'Add new sales rep'}
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Field
            label="Region"
            value={form.region}
            onChange={(v) => setForm({ ...form, region: v })}
            required
          />
          <Field
            label="Passcode"
            value={form.passcode}
            onChange={(v) => setForm({ ...form, passcode: v })}
            required
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {editingId ? 'Save changes' : 'Add sales rep'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-300 px-4 py-2 dark:border-slate-700"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="flex flex-col gap-2">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {!loading && reps.length === 0 && (
          <p className="text-sm text-slate-500">No sales reps yet.</p>
        )}
        {reps.map((rep) => {
          const surveys = surveysByRep[rep.id]
          const isExpanded = expandedId === rep.id
          return (
            <div key={rep.id} className="rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between p-3">
                <button
                  onClick={() => toggleExpand(rep)}
                  className="flex flex-1 items-center justify-between text-left"
                >
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{rep.name}</div>
                    <div className="text-xs text-slate-500">
                      {rep.region} · Passcode: {rep.passcode} · Last login:{' '}
                      {rep.last_login ? new Date(rep.last_login).toLocaleString() : 'Never'}
                      {surveys && ` · ${surveys.length} survey${surveys.length === 1 ? '' : 's'}`}
                    </div>
                  </div>
                  <span className="text-slate-400">{isExpanded ? '▲' : '▼'}</span>
                </button>
                <div className="flex gap-2 pl-3">
                  <button onClick={() => startEdit(rep)} className="text-sm text-slate-500 hover:underline">
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(rep.id, rep.name)}
                    className="text-sm text-red-500 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-slate-200 p-3 dark:border-slate-800">
                  {surveysLoading === rep.id && (
                    <p className="text-sm text-slate-500">Loading surveys…</p>
                  )}
                  {surveys && surveys.length === 0 && (
                    <p className="text-sm text-slate-500">No store surveys yet.</p>
                  )}
                  {surveys && surveys.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {surveys.map((s) => (
                        <div key={s.id} className="text-sm text-slate-600 dark:text-slate-400">
                          {s.store_name} — {s.visit_date}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

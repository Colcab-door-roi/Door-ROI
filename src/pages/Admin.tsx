import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { CaseType, PlantType } from '../types'

const PASSCODE = import.meta.env.VITE_ADMIN_PASSCODE as string | undefined
const SESSION_KEY = 'fridge-admin-unlocked'

export default function Admin() {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === 'true',
  )
  const [passcodeInput, setPasscodeInput] = useState('')
  const [passcodeError, setPasscodeError] = useState('')

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

      <CaseTypesSection />
      <PlantTypesSection />
    </div>
  )
}

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
      w_per_ft_without_doors: Number(form.w_per_ft_without_doors),
      savings_percent: Number(form.savings_percent),
      notes: form.notes || null,
    }

    const { error } = editingId
      ? await supabase.from('case_types').update(payload).eq('id', editingId)
      : await supabase.from('case_types').insert(payload)

    if (error) setError(error.message)
    else {
      resetForm()
      await load()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this case type?')) return
    const { error } = await supabase.from('case_types').delete().eq('id', id)
    if (error) setError(error.message)
    else await load()
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Case types</h2>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

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
            label="% Savings with doors"
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
                {item.w_per_ft_without_doors} W/ft, {item.savings_percent}% savings
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(item)} className="text-sm text-slate-500 hover:underline">
                Edit
              </button>
              <button onClick={() => handleDelete(item.id)} className="text-sm text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

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

    const payload = { name: form.name, cop: Number(form.cop) }

    const { error } = editingId
      ? await supabase.from('plant_types').update(payload).eq('id', editingId)
      : await supabase.from('plant_types').insert(payload)

    if (error) setError(error.message)
    else {
      resetForm()
      await load()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this plant type?')) return
    const { error } = await supabase.from('plant_types').delete().eq('id', id)
    if (error) setError(error.message)
    else await load()
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">
        Refrigeration plant types
      </h2>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

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
              <button onClick={() => handleDelete(item.id)} className="text-sm text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
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
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
    </label>
  )
}

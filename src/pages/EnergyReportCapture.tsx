import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { calculatePlugInEnergyConsumption, calculatePlugInLengthM, findMatchingEndProduct } from '../lib/calculate'
import type {
  AppSettings,
  Category,
  EnergyReport,
  EnergyReportItem,
  PlugInFreezerSettings,
  PlugInFreezerType,
  SalesRep,
} from '../types'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function EnergyReportProfileForm({
  rep,
  defaultRate,
  existingReport,
  onSaved,
  onCancel,
}: {
  rep: SalesRep
  defaultRate: number
  existingReport: EnergyReport | null
  onSaved: (report: EnergyReport) => void
  onCancel: () => void
}) {
  const [storeName, setStoreName] = useState(existingReport?.store_name ?? '')
  const [rate, setRate] = useState((existingReport?.electricity_rate ?? defaultRate).toString())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      store_name: storeName,
      electricity_rate: Number(rate) || 0,
    }

    const { data, error } = existingReport
      ? await supabase.from('energy_reports').update(payload).eq('id', existingReport.id).select().single()
      : await supabase
          .from('energy_reports')
          .insert({ ...payload, visit_date: todayISO(), sales_rep_id: rep.id })
          .select()
          .single()

    if (error) setError(error.message)
    else onSaved(data)
    setSaving(false)
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col gap-6 p-4 pb-16">
      <header className="flex items-center justify-between pt-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {existingReport ? 'Edit energy report details' : 'New energy report'}
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

      <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
        A clean spec-sheet showing predicted energy consumption and running cost for a proposed
        set of plug-in freezers — not a Door ROI comparison, no investment or payback figures.
      </p>

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

        {!existingReport && (
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
            Electricity rate (R/kWh)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(',', '.'))}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 p-3 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {existingReport ? 'Save changes' : 'Start adding products'}
        </button>
      </form>
    </div>
  )
}

const emptyItemForm = { categoryId: '', plugInFreezerTypeId: '', qty: '', addMatchingEndCases: false, notes: '' }

export function EnergyReportItemCapture({
  report,
  rep,
  items,
  setItems,
  categories,
  plugInFreezerTypes,
  plugInFreezerSettings,
  settings,
  onReportUpdated,
  onBackToList,
}: {
  report: EnergyReport
  rep: SalesRep
  items: EnergyReportItem[]
  setItems: React.Dispatch<React.SetStateAction<EnergyReportItem[]>>
  categories: Category[]
  plugInFreezerTypes: PlugInFreezerType[]
  plugInFreezerSettings: PlugInFreezerSettings | null
  settings: AppSettings | null
  onReportUpdated: (report: EnergyReport) => void
  onBackToList: () => void
}) {
  const [form, setForm] = useState(emptyItemForm)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [editingReportDetails, setEditingReportDetails] = useState(false)

  if (editingReportDetails) {
    return (
      <EnergyReportProfileForm
        rep={rep}
        defaultRate={settings?.default_electricity_rate ?? 0}
        existingReport={report}
        onSaved={(updated) => {
          onReportUpdated(updated)
          setEditingReportDetails(false)
        }}
        onCancel={() => setEditingReportDetails(false)}
      />
    )
  }

  function resetItemForm() {
    setEditingItemId(null)
    setForm(emptyItemForm)
  }

  function startEditItem(item: EnergyReportItem) {
    setEditingItemId(item.id)
    setForm({
      categoryId: item.category_id,
      plugInFreezerTypeId: item.plugin_freezer_type_id,
      qty: item.qty.toString(),
      addMatchingEndCases: false,
      notes: item.notes ?? '',
    })
  }

  async function handleSubmitItem(e: FormEvent) {
    e.preventDefault()
    if (!form.categoryId || !form.plugInFreezerTypeId || !form.qty) return
    setSaving(true)
    setError(null)

    const payload = {
      category_id: form.categoryId,
      plugin_freezer_type_id: form.plugInFreezerTypeId,
      qty: Number(form.qty) || 0,
      is_auto_end: false,
      notes: form.notes || null,
    }

    if (editingItemId) {
      const { data, error } = await supabase
        .from('energy_report_items')
        .update(payload)
        .eq('id', editingItemId)
        .select()
        .single()
      if (error) setError(error.message)
      else {
        setItems((prev) => prev.map((i) => (i.id === editingItemId ? data : i)))
        resetItemForm()
      }
      setSaving(false)
      return
    }

    // "Add matching end cases" is a one-shot shortcut for new items only:
    // insert the spine row, then a second row for 2x the matching end
    // product, so a rep doesn't have to look it up and add it separately.
    const spineType = plugInFreezerTypes.find((p) => p.id === form.plugInFreezerTypeId)
    const matchingEnd =
      form.addMatchingEndCases && spineType ? findMatchingEndProduct(spineType, plugInFreezerTypes) : null

    const rows = matchingEnd
      ? [payload, { ...payload, plugin_freezer_type_id: matchingEnd.id, qty: 2, is_auto_end: true, notes: null }]
      : [payload]

    const { data, error } = await supabase
      .from('energy_report_items')
      .insert(rows.map((row) => ({ ...row, energy_report_id: report.id })))
      .select()

    if (error) setError(error.message)
    else {
      setItems((prev) => [...prev, ...(data ?? [])])
      resetItemForm()
    }
    setSaving(false)
  }

  async function handleDeleteItem(id: string) {
    if (!confirm('Remove this product?')) return
    const { error } = await supabase.from('energy_report_items').delete().eq('id', id)
    if (error) setError(error.message)
    else {
      setItems((prev) => prev.filter((i) => i.id !== id))
      if (editingItemId === id) resetItemForm()
    }
  }

  async function handleFinish() {
    if (!settings || !plugInFreezerSettings) return
    setGenerating(true)
    try {
      const { generatePlugInEnergyReport, plugInEnergyReportFilename } = await import('../lib/pdf')
      const doc = await generatePlugInEnergyReport({
        report,
        items,
        categories,
        plugInFreezerTypes,
        plugInFreezerSettings,
        settings,
        rep,
      })
      const blob = doc.output('blob')
      const file = new File([blob], plugInEnergyReportFilename(report), { type: 'application/pdf' })
      const url = URL.createObjectURL(file)

      window.open(url, '_blank')

      const link = document.createElement('a')
      link.href = url
      link.download = plugInEnergyReportFilename(report)
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
            {report.store_name}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {rep.name} · {report.visit_date} · Energy report
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={onBackToList} className="text-sm text-slate-400 hover:underline">
            ← Your reports
          </button>
          <button
            onClick={() => setEditingReportDetails(true)}
            className="text-sm text-slate-400 hover:underline"
          >
            Edit report details
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
          {editingItemId ? 'Edit product' : 'Add a plug-in freezer product'}
        </h2>

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

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600 dark:text-slate-400">Product</span>
          <select
            required
            value={form.plugInFreezerTypeId}
            onChange={(e) => setForm({ ...form, plugInFreezerTypeId: e.target.value })}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">— select —</option>
            {plugInFreezerTypes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.shape}, {p.length_m}m)
              </option>
            ))}
          </select>
        </label>

        {!editingItemId &&
          (() => {
            const spineType = plugInFreezerTypes.find((p) => p.id === form.plugInFreezerTypeId)
            if (!spineType || spineType.shape !== 'spine') return null
            const matchingEnd = findMatchingEndProduct(spineType, plugInFreezerTypes)
            if (!matchingEnd) {
              return (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No matching end product in the catalog for {spineType.name} — add one in Admin
                  to use this shortcut.
                </p>
              )
            }
            return (
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.addMatchingEndCases}
                  onChange={(e) => setForm({ ...form, addMatchingEndCases: e.target.checked })}
                />
                Add 2x matching end cases ({matchingEnd.name})
              </label>
            )
          })()}

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600 dark:text-slate-400">Quantity</span>
          <input
            required
            type="text"
            inputMode="numeric"
            value={form.qty}
            onChange={(e) => setForm({ ...form, qty: e.target.value.replace(',', '.') })}
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600 dark:text-slate-400">Notes</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="Anything worth noting about this product"
            className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-slate-900 p-3 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {editingItemId ? 'Save changes' : 'Add to report'}
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
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Products in this report ({items.length})
          </h2>
          {items.length > 0 && plugInFreezerSettings && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Overall length{' '}
              {items
                .reduce((sum, item) => {
                  const plugInType = plugInFreezerTypes.find((p) => p.id === item.plugin_freezer_type_id)
                  if (!plugInType) return sum
                  return (
                    sum +
                    calculatePlugInLengthM(
                      plugInType,
                      item.qty,
                      item.is_auto_end,
                      plugInFreezerSettings.end_case_length_allowance_m,
                    )
                  )
                }, 0)
                .toFixed(2)}
              m
            </span>
          )}
        </div>
        {items.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">No products added yet.</p>
        )}
        {items.map((item) => {
          const category = categories.find((c) => c.id === item.category_id)
          const plugInType = plugInFreezerTypes.find((p) => p.id === item.plugin_freezer_type_id)
          const consumption =
            plugInType && report
              ? calculatePlugInEnergyConsumption(plugInType, item.qty, report.electricity_rate)
              : null
          const lengthM =
            plugInType && plugInFreezerSettings
              ? calculatePlugInLengthM(
                  plugInType,
                  item.qty,
                  item.is_auto_end,
                  plugInFreezerSettings.end_case_length_allowance_m,
                )
              : null
          return (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {category?.name} — {plugInType?.name}
                  {item.is_auto_end && (
                    <span className="ml-1 text-xs font-normal text-slate-400">(auto-added end)</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {item.qty}x
                  {consumption && ` · ${consumption.annualKwh.toFixed(0)} kWh/yr`}
                  {lengthM !== null && ` · ${lengthM.toFixed(2)}m`}
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

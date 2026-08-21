import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { calculateSavings } from '../lib/calculate'
import type { CaseType, PlantType } from '../types'

export default function Calculator() {
  const [caseTypes, setCaseTypes] = useState<CaseType[]>([])
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [caseTypeId, setCaseTypeId] = useState('')
  const [plantTypeId, setPlantTypeId] = useState('')
  const [qtyFt, setQtyFt] = useState(1)
  const [electricityRate, setElectricityRate] = useState(2.5)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [caseRes, plantRes] = await Promise.all([
        supabase.from('case_types').select('*').order('name', { ascending: true }),
        supabase.from('plant_types').select('*').order('name', { ascending: true }),
      ])

      if (cancelled) return

      if (caseRes.error) {
        setError(caseRes.error.message)
      } else if (plantRes.error) {
        setError(plantRes.error.message)
      } else {
        setCaseTypes(caseRes.data ?? [])
        setPlantTypes(plantRes.data ?? [])
        if (caseRes.data && caseRes.data.length > 0) setCaseTypeId(caseRes.data[0].id)
        const multiplex = plantRes.data?.find((p) => p.name.toLowerCase() === 'multiplex')
        if (multiplex) setPlantTypeId(multiplex.id)
        else if (plantRes.data && plantRes.data.length > 0) setPlantTypeId(plantRes.data[0].id)
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedCaseType = caseTypes.find((c) => c.id === caseTypeId) ?? null
  const selectedPlantType = plantTypes.find((p) => p.id === plantTypeId) ?? null

  const result = useMemo(() => {
    if (!selectedCaseType || !selectedPlantType || qtyFt <= 0) return null
    return calculateSavings(selectedCaseType, selectedPlantType, qtyFt, electricityRate)
  }, [selectedCaseType, selectedPlantType, qtyFt, electricityRate])

  const hasData = caseTypes.length > 0 && plantTypes.length > 0

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col gap-6 p-4 pb-16">
      <header className="flex items-center justify-between pt-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Fridge Door Savings
        </h1>
        <Link
          to="/admin"
          className="text-sm text-slate-400 underline-offset-2 hover:underline dark:text-slate-500"
        >
          Admin
        </Link>
      </header>

      {loading && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading data…</p>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Couldn't load data: {error}
        </p>
      )}

      {!loading && !error && !hasData && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          No case types or plant types yet. Add some from the Admin screen.
        </p>
      )}

      {!loading && hasData && (
        <>
          <section className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Case type
              </span>
              <select
                className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={caseTypeId}
                onChange={(e) => setCaseTypeId(e.target.value)}
              >
                {caseTypes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Refrigeration plant type
              </span>
              <select
                className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={plantTypeId}
                onChange={(e) => setPlantTypeId(e.target.value)}
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
                Case length (ft)
              </span>
              <input
                type="number"
                min={0.1}
                step="0.1"
                className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={qtyFt}
                onChange={(e) => setQtyFt(Number(e.target.value))}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Electricity rate (R/kWh)
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="rounded-lg border border-slate-300 bg-white p-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={electricityRate}
                onChange={(e) => setElectricityRate(Number(e.target.value))}
              />
            </label>
          </section>

          {result && selectedCaseType && (
            <section className="flex flex-col gap-3 rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950">
              <h2 className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                Estimated savings
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Daily energy" value={`${result.dailySavingsKwh.toFixed(1)} kWh`} />
                <Stat
                  label="Annual energy"
                  value={`${result.annualSavingsKwh.toFixed(0)} kWh`}
                />
                <Stat label="Daily cost" value={`R ${result.dailyCostSaving.toFixed(2)}`} />
                <Stat
                  label="Annual cost"
                  value={`R ${result.annualCostSaving.toFixed(0)}`}
                />
              </div>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                {selectedCaseType.savings_percent}% load reduction from doors, based on a
                24h/day continuous-run assumption
              </p>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/60 p-3 dark:bg-black/20">
      <div className="text-xs text-emerald-700 dark:text-emerald-400">{label}</div>
      <div className="text-lg font-semibold text-emerald-900 dark:text-emerald-200">
        {value}
      </div>
    </div>
  )
}

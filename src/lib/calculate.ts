import type { CalculationResult, CaseType, CasemSettings, DoorType, PlantType } from '../types'

const HOURS_PER_DAY = 24 // continuous-run assumption, matches source spreadsheet

const ZERO_RESULT: CalculationResult = {
  dailySavingsKwh: 0,
  annualSavingsKwh: 0,
  dailyCostSaving: 0,
  annualCostSaving: 0,
}

export function calculateSavings(
  caseType: CaseType,
  doorType: DoorType,
  plantType: PlantType,
  qtyFt: number,
  electricityRate: number,
  casemHeaterSavingsPercent = 0,
): CalculationResult {
  const wPerFtWithDoors =
    caseType.w_per_ft_without_doors * (1 - caseType.savings_percent / 100)

  const electricalWWithoutDoors = caseType.w_per_ft_without_doors / plantType.cop
  // Anti-condensation heaters on heated glass draw power directly, not
  // through the compressor — added straight to the with-doors electrical
  // load rather than divided by COP. Casem (when enabled for the survey)
  // reduces that heater draw by a % before it's added.
  const heaterWPerFt = doorType.heater_watts_per_ft * (1 - casemHeaterSavingsPercent / 100)
  const electricalWWithDoors = wPerFtWithDoors / plantType.cop + heaterWPerFt

  const dailyKwhWithout =
    (electricalWWithoutDoors * qtyFt * HOURS_PER_DAY) / 1000
  const dailyKwhWith = (electricalWWithDoors * qtyFt * HOURS_PER_DAY) / 1000

  const dailySavingsKwh = dailyKwhWithout - dailyKwhWith
  const annualSavingsKwh = dailySavingsKwh * 365

  return {
    dailySavingsKwh,
    annualSavingsKwh,
    dailyCostSaving: dailySavingsKwh * electricityRate,
    annualCostSaving: annualSavingsKwh * electricityRate,
  }
}

// GDF (Glass Door Freezer) doors are already fitted — there's no "with vs
// without doors" refrigeration comparison here. Admin sets a single global
// baseline door/frame electrical load (W/door, continuous, no Casem);
// Casem reduces that load by a % when selected, and only affects this
// direct heater draw, not the W/ft refrigeration model — so this is a
// separate calculation, not an extension of calculateSavings.
export function calculateGdfCasemSavings(
  qtyDoors: number,
  casemSettings: CasemSettings,
  casemSelected: boolean,
  electricityRate: number,
): CalculationResult {
  const baselineW = casemSettings.baseline_watts_per_door * qtyDoors
  const withCasemW = casemSelected ? baselineW * (1 - casemSettings.savings_percent / 100) : baselineW

  const dailyKwhWithout = (baselineW * HOURS_PER_DAY) / 1000
  const dailyKwhWith = (withCasemW * HOURS_PER_DAY) / 1000

  const dailySavingsKwh = dailyKwhWithout - dailyKwhWith
  const annualSavingsKwh = dailySavingsKwh * 365

  return {
    dailySavingsKwh,
    annualSavingsKwh,
    dailyCostSaving: dailySavingsKwh * electricityRate,
    annualCostSaving: annualSavingsKwh * electricityRate,
  }
}

export { ZERO_RESULT }

const MAX_PAYBACK_YEARS = 50

// Payback in years, accounting for electricity prices (and so the savings
// each year) rising by annualIncreasePercent every year. Returns null if it
// wouldn't pay back within MAX_PAYBACK_YEARS.
export function calculatePaybackYears(
  investment: number,
  firstYearSaving: number,
  annualIncreasePercent: number,
): number | null {
  if (investment <= 0) return 0
  if (firstYearSaving <= 0) return null

  const growth = 1 + annualIncreasePercent / 100
  let cumulative = 0
  let saving = firstYearSaving

  for (let year = 1; year <= MAX_PAYBACK_YEARS; year++) {
    const cumulativeBefore = cumulative
    cumulative += saving
    if (cumulative >= investment) {
      const fraction = (investment - cumulativeBefore) / saving
      return year - 1 + fraction
    }
    saving *= growth
  }

  return null
}

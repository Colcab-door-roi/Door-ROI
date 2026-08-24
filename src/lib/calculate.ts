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
): CalculationResult {
  const wPerFtWithDoors =
    caseType.w_per_ft_without_doors * (1 - caseType.savings_percent / 100)

  const electricalWWithoutDoors = caseType.w_per_ft_without_doors / plantType.cop
  // Anti-condensation heaters on heated glass draw power directly, not
  // through the compressor — added straight to the with-doors electrical
  // load rather than divided by COP.
  const electricalWWithDoors = wPerFtWithDoors / plantType.cop + doorType.heater_watts_per_ft

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
// without doors" refrigeration comparison here. Casem only reduces the
// doors' own anti-condensation heater draw (direct power, not through the
// compressor), so this is a separate calculation, not an extension of
// calculateSavings.
export function calculateGdfCasemSavings(
  qtyDoors: number,
  casemSettings: CasemSettings,
  electricityRate: number,
): CalculationResult {
  const dailySavingsKwh =
    (casemSettings.savings_watts_per_door * qtyDoors * HOURS_PER_DAY) / 1000
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

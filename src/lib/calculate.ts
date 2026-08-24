import type { CalculationResult, CaseType, DoorType, PlantType } from '../types'

const HOURS_PER_DAY = 24 // continuous-run assumption, matches source spreadsheet

export function calculateSavings(
  caseType: CaseType,
  doorType: DoorType,
  plantType: PlantType,
  qtyFt: number,
  electricityRate: number,
): CalculationResult {
  const wPerFtWithDoors =
    caseType.w_per_ft_without_doors * (1 - doorType.energy_saving_percent / 100)

  const electricalWWithoutDoors = caseType.w_per_ft_without_doors / plantType.cop
  const electricalWWithDoors = wPerFtWithDoors / plantType.cop

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

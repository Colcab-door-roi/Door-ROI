import type { CalculationResult, CaseType, PlantType } from '../types'

const HOURS_PER_DAY = 24 // continuous-run assumption, matches source spreadsheet

export function calculateSavings(
  caseType: CaseType,
  plantType: PlantType,
  qtyFt: number,
  electricityRate: number,
): CalculationResult {
  const wPerFtWithDoors =
    caseType.w_per_ft_without_doors * (1 - caseType.savings_percent / 100)

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

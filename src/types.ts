export interface CaseType {
  id: string
  name: string
  w_per_ft_without_doors: number
  savings_percent: number
  notes: string | null
}

export interface PlantType {
  id: string
  name: string
  cop: number
}

export interface CalculationResult {
  dailySavingsKwh: number
  annualSavingsKwh: number
  dailyCostSaving: number
  annualCostSaving: number
}

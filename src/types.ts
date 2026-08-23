export interface Category {
  id: string
  name: string
}

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

export interface AppSettings {
  default_electricity_rate: number
  legal_disclaimer: string
}

export type CostType = 'door' | 'reclad' | 'canopy_led' | 'undershelf_led'

export interface CostRate {
  cost_type: CostType
  label: string
  cost_4ft: number
  cost_5ft: number
  cost_7ft: number
}

export interface StoreVisit {
  id: string
  store_name: string
  sales_rep_name: string
  visit_date: string
  plant_type_id: string
  electricity_rate: number
}

export interface StoreItem {
  id: string
  store_visit_id: string
  category_id: string
  case_type_id: string
  qty_ft: number
  reclad: boolean
  canopy_led: boolean
  undershelf_led: boolean
}

export interface CalculationResult {
  dailySavingsKwh: number
  annualSavingsKwh: number
  dailyCostSaving: number
  annualCostSaving: number
}

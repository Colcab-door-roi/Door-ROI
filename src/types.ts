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
  is_gdf: boolean
  gdf_watts_per_door: number
}

export interface PlantType {
  id: string
  name: string
  cop: number
}

export interface DoorType {
  id: string
  name: string
  cost_4ft: number
  cost_5ft: number
  cost_7ft: number
  heater_watts_per_ft: number
}

export interface CasemSettings {
  cost_per_unit: number
  savings_percent: number
}

export interface AppSettings {
  default_electricity_rate: number
  annual_price_increase_percent: number
  legal_disclaimer: string
  header_image_url: string | null
  footer_image_url: string | null
  subassembly_transport_labour_cost_4ft: number
  outlying_labour_cost_4ft: number
  vat_percent: number
}

export type CostType = 'reclad' | 'canopy_led' | 'undershelf_led'

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
  door_type_id: string
  electricity_rate: number
  outlying: boolean
}

export interface StoreItem {
  id: string
  store_visit_id: string
  category_id: string
  case_type_id: string
  qty_ft: number | null
  qty_doors: number | null
  qty_gdf_units: number | null
  doors: boolean
  reclad: boolean
  canopy_led: boolean
  undershelf_led: boolean
  casem: boolean
  notes: string | null
}

export interface CalculationResult {
  dailySavingsKwh: number
  annualSavingsKwh: number
  dailyCostSaving: number
  annualCostSaving: number
}

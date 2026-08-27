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
  freezer_cop: number
}

export type FreezerShape = 'end' | 'spine'

// Fixed-size catalog products, not per-metre rates: plug-in units come in
// standard lengths (e.g. 1.8m end, 2.1m/2.5m spine), matched against
// standard remote freezer run lengths (e.g. 7ft end, 8ft/12ft spine).
export interface RemoteFreezerType {
  id: string
  name: string
  shape: FreezerShape
  length_m: number
  refrigeration_watts_per_m: number
  direct_energy_watts_per_m: number
}

export interface PlugInFreezerType {
  id: string
  name: string
  shape: FreezerShape
  length_m: number
  kwh_per_day: number
  cost_per_unit: number
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
  baseline_watts_per_door: number
  cost_per_unit: number
  installation_cost_per_unit: number
  savings_percent: number
  heater_door_savings_percent: number
}

export interface AppSettings {
  default_electricity_rate: number
  annual_price_increase_percent: number
  legal_disclaimer: string
  header_image_url: string | null
  footer_image_url: string | null
  subassembly_transport_labour_cost_4ft: number
  outlying_labour_cost_4ft: number
  vertical_led_cost_4ft: number
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

export interface SalesRep {
  id: string
  name: string
  region: string
  passcode: string
  last_login: string | null
  created_at: string
}

export interface AdminActivityLogEntry {
  id: string
  description: string
  created_at: string
}

export interface StoreVisit {
  id: string
  store_name: string
  sales_rep_name: string | null
  sales_rep_id: string | null
  visit_date: string
  plant_type_id: string
  door_type_id: string
  electricity_rate: number
  outlying: boolean
  casem: boolean
}

export interface StoreItem {
  id: string
  store_visit_id: string
  category_id: string
  case_type_id: string | null
  is_gdf: boolean
  qty_ft: number | null
  qty_doors: number | null
  qty_gdf_units: number | null
  doors: boolean
  reclad: boolean
  canopy_led: boolean
  undershelf_led: boolean
  vertical_led: boolean
  casem: boolean
  casem_units: number | null
  is_plugin_freezer: boolean
  remote_freezer_type_id: string | null
  remote_qty: number | null
  plugin_freezer_type_id: string | null
  notes: string | null
}

export interface CalculationResult {
  dailySavingsKwh: number
  annualSavingsKwh: number
  dailyCostSaving: number
  annualCostSaving: number
}

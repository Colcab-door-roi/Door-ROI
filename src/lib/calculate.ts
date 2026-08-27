import type {
  CalculationResult,
  CaseType,
  CasemSettings,
  DoorType,
  PlantType,
  PlugInFreezerType,
  RemoteFreezerType,
} from '../types'

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

export interface PlugInFreezerResult extends CalculationResult {
  requiredPlugInUnits: number
  investmentCost: number
}

// Compares an existing remote (plumbed-in) freezer run against a proposed
// plug-in replacement. Both are fixed-size catalog products, not per-metre
// rates, so the remote run's total length determines how many plug-in
// units are needed to fill the same space — always rounded up to a whole
// unit. "Spine" remote units merchandise from two sides; the plug-in units
// are narrow, so two must sit back-to-back to match that depth, doubling
// the count a same-length "end" swap would need.
export function calculatePlugInFreezerSavings(
  remoteType: RemoteFreezerType,
  remoteQty: number,
  plugInType: PlugInFreezerType,
  freezerCop: number,
  electricityRate: number,
): PlugInFreezerResult {
  const remoteRunLengthM = remoteType.length_m * remoteQty
  const depthMultiplier = remoteType.shape === 'spine' ? 2 : 1
  const requiredPlugInUnits = Math.ceil(remoteRunLengthM / plugInType.length_m) * depthMultiplier

  // Refrigeration load runs through the plant (divided by the freezer-
  // specific COP); direct energy is drawn straight, same as a door heater.
  const remoteWattsTotal =
    (remoteType.refrigeration_watts_per_m / freezerCop + remoteType.direct_energy_watts_per_m) *
    remoteRunLengthM
  const dailyKwhWithout = (remoteWattsTotal * HOURS_PER_DAY) / 1000
  const dailyKwhWith = requiredPlugInUnits * plugInType.kwh_per_day

  const dailySavingsKwh = dailyKwhWithout - dailyKwhWith
  const annualSavingsKwh = dailySavingsKwh * 365

  return {
    dailySavingsKwh,
    annualSavingsKwh,
    dailyCostSaving: dailySavingsKwh * electricityRate,
    annualCostSaving: annualSavingsKwh * electricityRate,
    requiredPlugInUnits,
    investmentCost: requiredPlugInUnits * plugInType.cost_per_unit,
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

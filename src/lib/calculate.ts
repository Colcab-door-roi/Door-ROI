import type {
  CalculationResult,
  CaseType,
  CasemSettings,
  DoorType,
  EnergyConsumption,
  PlantType,
  PlugInFreezerSettings,
  PlugInFreezerType,
  RemoteFreezerType,
  SpineConnectionMethod,
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
  runningLengthM: number
  requiredSpinePlugInUnits: number
  requiredEndPlugInUnits: number
  plugInUnitsCost: number
  transportCost: number
  jointKitCost: number
  centreSuperstructureCost: number
  investmentCost: number
}

// Compares an existing remote (plumbed-in) freezer lineup against a
// proposed plug-in replacement. Both catalogs are fixed-size products, not
// per-metre rates. A lineup is modelled as an optional Spine (double-depth,
// middle) run plus an optional End (single-depth, capping each side) count
// — most real lineups have both. The narrow plug-in units need two placed
// back-to-back to match a spine unit's depth, doubling the count a
// same-length end swap would need; end units already match depth 1-for-1.
//
// "Running length" of the lineup = the spine run's real length plus a flat
// per-end allowance (an end case's own footprint isn't what determines how
// much spine run needs filling) — used for transport cost. The spine run
// is joined either with back-to-back joint kits or a full centre
// superstructure, never both; whichever applies is costed at whichever of
// the two standard module rates (2.1m / 2.5m) is closer to the chosen
// spine plug-in product's own length.
export function calculatePlugInFreezerSavings(
  spineRemoteType: RemoteFreezerType | null,
  spineRemoteQty: number,
  spinePlugInType: PlugInFreezerType | null,
  spineConnectionMethod: SpineConnectionMethod | null,
  endRemoteType: RemoteFreezerType | null,
  endRemoteQty: number,
  endPlugInType: PlugInFreezerType | null,
  freezerCop: number,
  electricityRate: number,
  settings: PlugInFreezerSettings,
): PlugInFreezerResult {
  const spineRemoteLengthM = spineRemoteType ? spineRemoteType.length_m * spineRemoteQty : 0
  const requiredSpinePlugInUnits =
    spineRemoteType && spinePlugInType && spineRemoteLengthM > 0
      ? Math.ceil(spineRemoteLengthM / spinePlugInType.length_m) * 2
      : 0
  const requiredEndPlugInUnits = endRemoteType && endPlugInType ? endRemoteQty : 0

  const runningLengthM = spineRemoteLengthM + endRemoteQty * settings.end_case_length_allowance_m

  const endRemoteLengthM = endRemoteType ? endRemoteType.length_m * endRemoteQty : 0
  const spineWattsTotal = spineRemoteType
    ? (spineRemoteType.refrigeration_watts_per_m / freezerCop + spineRemoteType.direct_energy_watts_per_m) *
      spineRemoteLengthM
    : 0
  const endWattsTotal = endRemoteType
    ? (endRemoteType.refrigeration_watts_per_m / freezerCop + endRemoteType.direct_energy_watts_per_m) *
      endRemoteLengthM
    : 0

  const dailyKwhWithout = ((spineWattsTotal + endWattsTotal) * HOURS_PER_DAY) / 1000
  const dailyKwhWith =
    requiredSpinePlugInUnits * (spinePlugInType?.kwh_per_day ?? 0) +
    requiredEndPlugInUnits * (endPlugInType?.kwh_per_day ?? 0)

  const dailySavingsKwh = dailyKwhWithout - dailyKwhWith
  const annualSavingsKwh = dailySavingsKwh * 365

  const plugInUnitsCost =
    requiredSpinePlugInUnits * (spinePlugInType?.cost_per_unit ?? 0) +
    requiredEndPlugInUnits * (endPlugInType?.cost_per_unit ?? 0)
  const transportCost = runningLengthM * settings.transport_cost_per_m

  // Whichever of the two standard spine module sizes (2.1m / 2.5m) the
  // chosen spine plug-in product is closer to determines both rates below.
  const is2_1m = spinePlugInType
    ? Math.abs(spinePlugInType.length_m - 2.1) <= Math.abs(spinePlugInType.length_m - 2.5)
    : true

  const jointKitCost =
    requiredSpinePlugInUnits > 0 && spineConnectionMethod === 'joint_kit'
      ? Math.ceil(requiredSpinePlugInUnits / 2) *
        (is2_1m ? settings.back_to_back_joint_kit_cost_2_1m : settings.back_to_back_joint_kit_cost_2_5m)
      : 0
  const centreSuperstructureCost =
    requiredSpinePlugInUnits > 0 && spineConnectionMethod === 'superstructure'
      ? spineRemoteLengthM *
        (is2_1m ? settings.centre_superstructure_2_1m_cost_per_m : settings.centre_superstructure_2_5m_cost_per_m)
      : 0

  const investmentCost = plugInUnitsCost + transportCost + jointKitCost + centreSuperstructureCost

  return {
    dailySavingsKwh,
    annualSavingsKwh,
    dailyCostSaving: dailySavingsKwh * electricityRate,
    annualCostSaving: annualSavingsKwh * electricityRate,
    runningLengthM,
    requiredSpinePlugInUnits,
    requiredEndPlugInUnits,
    plugInUnitsCost,
    transportCost,
    jointKitCost,
    centreSuperstructureCost,
    investmentCost,
  }
}

// Plug-in freezer energy report: pure predicted consumption and running
// cost for a proposed product, independent of any remote/ROI comparison.
// Monthly is annual ÷ 12 (not daily × 30) so the three figures always
// reconcile with each other exactly.
export function calculatePlugInEnergyConsumption(
  plugInType: PlugInFreezerType,
  qty: number,
  electricityRate: number,
): EnergyConsumption {
  const dailyKwh = plugInType.kwh_per_day * qty
  const annualKwh = dailyKwh * 365
  const monthlyKwh = annualKwh / 12

  return {
    dailyKwh,
    monthlyKwh,
    annualKwh,
    dailyCost: dailyKwh * electricityRate,
    monthlyCost: monthlyKwh * electricityRate,
    annualCost: annualKwh * electricityRate,
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

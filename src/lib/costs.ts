import type { CostRate } from '../types'

// ~90% of jobs price in fixed 4ft/5ft/7ft segments. A length matching one of
// those exactly uses its fixed cost; any other length is priced proportionally
// off the 4ft rate.
export function resolveCost(rate: CostRate, lengthFt: number): number {
  if (lengthFt === 4) return rate.cost_4ft
  if (lengthFt === 5) return rate.cost_5ft
  if (lengthFt === 7) return rate.cost_7ft
  return (lengthFt / 4) * rate.cost_4ft
}

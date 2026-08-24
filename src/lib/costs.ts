interface SegmentPricing {
  cost_4ft: number
  cost_5ft: number
  cost_7ft: number
}

// ~90% of jobs price in fixed 4ft/5ft/7ft segments. A length matching one of
// those exactly uses its fixed cost; any other length is priced proportionally
// off the 4ft rate.
export function resolveCost(rate: SegmentPricing, lengthFt: number): number {
  if (lengthFt === 4) return rate.cost_4ft
  if (lengthFt === 5) return rate.cost_5ft
  if (lengthFt === 7) return rate.cost_7ft
  return (lengthFt / 4) * rate.cost_4ft
}

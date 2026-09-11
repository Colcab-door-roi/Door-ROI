// South African Rand convention: space as thousands separator, comma as
// decimal separator (e.g. "R 90 790,00"). toLocaleString('en-ZA') produces
// this but with a non-breaking space (U+00A0) — normalize to a regular
// space so it renders identically everywhere (including jsPDF's standard
// fonts).
function normalizeSpaces(s: string) {
  return s.replace(/ /g, ' ')
}

export function formatRand(value: number): string {
  return `R ${normalizeSpaces(value.toLocaleString('en-ZA', { maximumFractionDigits: 0 }))}`
}

// Electricity rate is a per-kWh price (typically a few Rand), so unlike
// every other Rand figure on a report it needs its cents to stay
// meaningful — rounding R3,31 to R3 changes it by 10%.
export function formatRandRate(value: number): string {
  return `R ${normalizeSpaces(
    value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  )}`
}

export function formatKwh(value: number): string {
  return `${normalizeSpaces(value.toLocaleString('en-ZA', { maximumFractionDigits: 0 }))} kWh`
}

export function formatNumber(value: number): string {
  return normalizeSpaces(value.toLocaleString('en-ZA', { maximumFractionDigits: 0 }))
}

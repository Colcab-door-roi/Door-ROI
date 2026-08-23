import { jsPDF } from 'jspdf'
import { calculateSavings } from './calculate'
import { resolveCost } from './costs'
import type { AppSettings, CaseType, Category, CostRate, PlantType, StoreItem, StoreVisit } from '../types'

interface ReportContext {
  store: StoreVisit
  items: StoreItem[]
  caseTypes: CaseType[]
  categories: Category[]
  plantType: PlantType
  settings: AppSettings
  costRates: CostRate[]
}

export function generateStoreReport(ctx: ReportContext) {
  const { store, items, caseTypes, categories, plantType, settings, costRates } = ctx
  const doorRate = costRates.find((r) => r.cost_type === 'door')
  const recladRate = costRates.find((r) => r.cost_type === 'reclad')
  const canopyRate = costRates.find((r) => r.cost_type === 'canopy_led')
  const undershelfRate = costRates.find((r) => r.cost_type === 'undershelf_led')
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  doc.setFontSize(18)
  doc.text('Door ROI — Store energy savings report', 14, y)
  y += 10

  doc.setFontSize(11)
  doc.text(`Store: ${store.store_name}`, 14, y)
  y += 6
  doc.text(`Sales rep: ${store.sales_rep_name}`, 14, y)
  y += 6
  doc.text(`Date: ${store.visit_date}`, 14, y)
  y += 6
  doc.text(`Refrigeration plant: ${plantType.name} (COP ${plantType.cop})`, 14, y)
  y += 6
  doc.text(`Electricity rate: R ${store.electricity_rate.toFixed(2)} / kWh`, 14, y)
  y += 10

  const headers = ['Category', 'Case type', 'Length (ft)', 'Options', 'Annual kWh saved', 'Annual R saved', 'Upgrade cost']
  const colX = [14, 44, 90, 112, 145, 172, 195]

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  headers.forEach((h, i) => doc.text(h, colX[i], y))
  doc.setFont('helvetica', 'normal')
  y += 2
  doc.line(14, y, pageWidth - 14, y)
  y += 5

  let totalAnnualKwh = 0
  let totalAnnualCost = 0
  let totalUpgradeCost = 0

  for (const item of items) {
    const caseType = caseTypes.find((c) => c.id === item.case_type_id)
    const category = categories.find((c) => c.id === item.category_id)
    if (!caseType) continue

    const result = calculateSavings(caseType, plantType, item.qty_ft, store.electricity_rate)
    const upgradeCost =
      (doorRate ? resolveCost(doorRate, item.qty_ft) : 0) +
      (item.reclad && recladRate ? resolveCost(recladRate, item.qty_ft) : 0) +
      (item.canopy_led && canopyRate ? resolveCost(canopyRate, item.qty_ft) : 0) +
      (item.undershelf_led && undershelfRate ? resolveCost(undershelfRate, item.qty_ft) : 0)

    totalAnnualKwh += result.annualSavingsKwh
    totalAnnualCost += result.annualCostSaving
    totalUpgradeCost += upgradeCost

    const options = [
      item.reclad ? 'Reclad' : '',
      item.canopy_led ? 'Canopy LED' : '',
      item.undershelf_led ? 'Undershelf LED' : '',
    ]
      .filter(Boolean)
      .join(', ')

    if (y > 270) {
      doc.addPage()
      y = 20
    }

    doc.text(category?.name ?? '—', colX[0], y)
    doc.text(caseType.name, colX[1], y, { maxWidth: 44 })
    doc.text(item.qty_ft.toString(), colX[2], y)
    doc.text(options || '—', colX[3], y, { maxWidth: 30 })
    doc.text(result.annualSavingsKwh.toFixed(0), colX[4], y)
    doc.text(result.annualCostSaving.toFixed(0), colX[5], y)
    doc.text(upgradeCost.toFixed(0), colX[6], y)
    y += 7
  }

  y += 3
  doc.line(14, y, pageWidth - 14, y)
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.text(`Total annual energy saved: ${totalAnnualKwh.toFixed(0)} kWh`, 14, y)
  y += 6
  doc.text(`Total annual cost saved: R ${totalAnnualCost.toFixed(0)}`, 14, y)
  y += 6
  doc.text(`Total upgrade investment: R ${totalUpgradeCost.toFixed(0)}`, 14, y)
  y += 6
  if (totalAnnualCost > 0) {
    const paybackYears = totalUpgradeCost / totalAnnualCost
    doc.text(`Estimated payback period: ${paybackYears.toFixed(1)} years`, 14, y)
    y += 6
  }
  doc.setFont('helvetica', 'normal')

  if (settings.legal_disclaimer) {
    y += 8
    doc.setFontSize(8)
    doc.setTextColor(120)
    const lines = doc.splitTextToSize(settings.legal_disclaimer, pageWidth - 28)
    doc.text(lines, 14, y)
  }

  return doc
}

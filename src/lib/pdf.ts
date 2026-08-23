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

const MARGIN = 14
const LINE_HEIGHT = 4.2

// x-position, width (mm) for each column — cumulative widths sum to 168mm,
// comfortably inside A4's 182mm usable width (210mm page - 14mm margins
// each side), leaving margin to spare so nothing gets cut off.
const COLUMNS = [
  { label: 'Category', x: 14, width: 22, align: 'left' as const },
  { label: 'Case type', x: 36, width: 32, align: 'left' as const },
  { label: 'Length (ft)', x: 68, width: 16, align: 'left' as const },
  { label: 'Options', x: 84, width: 32, align: 'left' as const },
  { label: 'kWh saved/yr', x: 116, width: 22, align: 'right' as const },
  { label: 'R saved/yr', x: 138, width: 22, align: 'right' as const },
  { label: 'Cost (R)', x: 160, width: 22, align: 'right' as const },
]

function sanitizeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim()
}

export function reportFilename(store: StoreVisit) {
  return `${sanitizeFilename(store.store_name)} ${store.visit_date}.pdf`
}

export function generateStoreReport(ctx: ReportContext) {
  const { store, items, caseTypes, categories, plantType, settings, costRates } = ctx
  const doorRate = costRates.find((r) => r.cost_type === 'door')
  const recladRate = costRates.find((r) => r.cost_type === 'reclad')
  const canopyRate = costRates.find((r) => r.cost_type === 'canopy_led')
  const undershelfRate = costRates.find((r) => r.cost_type === 'undershelf_led')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setProperties({ title: reportFilename(store).replace(/\.pdf$/, '') })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  let y = 20

  doc.setFontSize(18)
  doc.text('Door ROI — Store energy savings report', MARGIN, y)
  y += 10

  doc.setFontSize(11)
  doc.text(`Store: ${store.store_name}`, MARGIN, y)
  y += 6
  doc.text(`Sales rep: ${store.sales_rep_name}`, MARGIN, y)
  y += 6
  doc.text(`Date: ${store.visit_date}`, MARGIN, y)
  y += 6
  doc.text(`Refrigeration plant: ${plantType.name} (COP ${plantType.cop})`, MARGIN, y)
  y += 6
  doc.text(`Electricity rate: R ${store.electricity_rate.toFixed(2)} / kWh`, MARGIN, y)
  y += 10

  function drawTableHeader() {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    for (const col of COLUMNS) {
      const lines = doc.splitTextToSize(col.label, col.width)
      doc.text(lines, col.align === 'right' ? col.x + col.width : col.x, y, {
        align: col.align,
      })
    }
    doc.setFont('helvetica', 'normal')
    y += 6
    doc.line(MARGIN, y, pageWidth - MARGIN, y)
    y += 5
  }

  drawTableHeader()

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

    const cellValues = [
      category?.name ?? '—',
      caseType.name,
      item.qty_ft.toString(),
      options || '—',
      result.annualSavingsKwh.toFixed(0),
      result.annualCostSaving.toFixed(0),
      upgradeCost.toFixed(0),
    ]

    const wrappedCells = cellValues.map((value, i) => doc.splitTextToSize(value, COLUMNS[i].width))
    const rowLines = Math.max(...wrappedCells.map((w) => w.length))
    const rowHeight = rowLines * LINE_HEIGHT + 3

    if (y + rowHeight > pageHeight - 20) {
      doc.addPage()
      y = 20
      drawTableHeader()
    }

    doc.setFontSize(9)
    wrappedCells.forEach((lines, i) => {
      const col = COLUMNS[i]
      doc.text(lines, col.align === 'right' ? col.x + col.width : col.x, y, {
        align: col.align,
      })
    })
    y += rowHeight
  }

  y += 2
  doc.line(MARGIN, y, pageWidth - MARGIN, y)
  y += 8

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total annual energy saved: ${totalAnnualKwh.toFixed(0)} kWh`, MARGIN, y)
  y += 6
  doc.text(`Total annual cost saved: R ${totalAnnualCost.toFixed(0)}`, MARGIN, y)
  y += 6
  doc.text(`Total upgrade investment: R ${totalUpgradeCost.toFixed(0)}`, MARGIN, y)
  y += 6
  if (totalAnnualCost > 0) {
    const paybackYears = totalUpgradeCost / totalAnnualCost
    doc.text(`Estimated payback period: ${paybackYears.toFixed(1)} years`, MARGIN, y)
    y += 6
  }
  doc.setFont('helvetica', 'normal')

  if (settings.legal_disclaimer) {
    y += 8
    doc.setFontSize(8)
    doc.setTextColor(120)
    const lines = doc.splitTextToSize(settings.legal_disclaimer, pageWidth - MARGIN * 2)
    doc.text(lines, MARGIN, y)
  }

  return doc
}

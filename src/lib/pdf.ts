import { jsPDF } from 'jspdf'
import { calculatePaybackYears, calculateSavings } from './calculate'
import { resolveCost } from './costs'
import { formatKwh, formatNumber, formatRand } from './format'
import type {
  AppSettings,
  CaseType,
  Category,
  CostRate,
  DoorType,
  PlantType,
  StoreItem,
  StoreVisit,
} from '../types'

interface ReportContext {
  store: StoreVisit
  items: StoreItem[]
  caseTypes: CaseType[]
  categories: Category[]
  plantType: PlantType
  doorType: DoorType
  settings: AppSettings
  costRates: CostRate[]
}

const MARGIN = 14
const LINE_HEIGHT = 4.2
// Header/footer images render as a slim banner strip, not a large block —
// keeps most of the page for the actual report content.
const HEADER_MAX_HEIGHT = 12
const FOOTER_MAX_HEIGHT = 8
const IMAGE_PADDING = 4

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

interface LoadedImage {
  dataUrl: string
  width: number
  height: number
}

function loadImage(url: string): Promise<LoadedImage | null> {
  return fetch(url)
    .then((res) => res.blob())
    .then(
      (blob) =>
        new Promise<LoadedImage>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = reader.result as string
            const img = new Image()
            img.onload = () => resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight })
            img.onerror = reject
            img.src = dataUrl
          }
          reader.onerror = reject
          reader.readAsDataURL(blob)
        }),
    )
    .catch(() => null)
}

function fitDimensions(img: LoadedImage, maxWidth: number, maxHeight: number) {
  const aspect = img.width / img.height
  let w = maxWidth
  let h = w / aspect
  if (h > maxHeight) {
    h = maxHeight
    w = h * aspect
  }
  return { w, h }
}

export async function generateStoreReport(ctx: ReportContext) {
  const { store, items, caseTypes, categories, plantType, doorType, settings, costRates } = ctx
  const recladRate = costRates.find((r) => r.cost_type === 'reclad')
  const canopyRate = costRates.find((r) => r.cost_type === 'canopy_led')
  const undershelfRate = costRates.find((r) => r.cost_type === 'undershelf_led')

  const [headerImg, footerImg] = await Promise.all([
    settings.header_image_url ? loadImage(settings.header_image_url) : Promise.resolve(null),
    settings.footer_image_url ? loadImage(settings.footer_image_url) : Promise.resolve(null),
  ])

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setProperties({ title: reportFilename(store).replace(/\.pdf$/, '') })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - MARGIN * 2

  const headerDims = headerImg ? fitDimensions(headerImg, contentWidth, HEADER_MAX_HEIGHT) : null
  const footerDims = footerImg ? fitDimensions(footerImg, contentWidth, FOOTER_MAX_HEIGHT) : null
  const contentStartY = headerDims ? IMAGE_PADDING + headerDims.h + IMAGE_PADDING : 20
  const footerReserve = footerDims ? footerDims.h + IMAGE_PADDING * 2 : 12

  function drawHeaderImage() {
    if (headerImg && headerDims) {
      doc.addImage(
        headerImg.dataUrl,
        'JPEG',
        MARGIN + (contentWidth - headerDims.w) / 2,
        IMAGE_PADDING,
        headerDims.w,
        headerDims.h,
      )
    }
  }

  let y = contentStartY
  drawHeaderImage()

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
  doc.text(`Door type: ${doorType.name} (${doorType.energy_saving_percent}% saving)`, MARGIN, y)
  y += 6
  doc.text(`Electricity rate: ${formatRand(store.electricity_rate)} / kWh`, MARGIN, y)
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

    const result = calculateSavings(caseType, doorType, plantType, item.qty_ft, store.electricity_rate)
    const upgradeCost =
      resolveCost(doorType, item.qty_ft) +
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
      formatNumber(result.annualSavingsKwh),
      formatNumber(result.annualCostSaving),
      formatNumber(upgradeCost),
    ]

    const wrappedCells = cellValues.map((value, i) => doc.splitTextToSize(value, COLUMNS[i].width))
    const noteLines = item.notes ? doc.splitTextToSize(`Note: ${item.notes}`, contentWidth) : []
    const rowLines = Math.max(...wrappedCells.map((w) => w.length))
    const rowHeight = rowLines * LINE_HEIGHT + noteLines.length * LINE_HEIGHT + 3

    if (y + rowHeight > pageHeight - footerReserve) {
      doc.addPage()
      y = contentStartY
      drawHeaderImage()
      drawTableHeader()
    }

    doc.setFontSize(9)
    wrappedCells.forEach((lines, i) => {
      const col = COLUMNS[i]
      doc.text(lines, col.align === 'right' ? col.x + col.width : col.x, y, {
        align: col.align,
      })
    })
    y += rowLines * LINE_HEIGHT

    if (noteLines.length > 0) {
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(120)
      doc.text(noteLines, MARGIN, y)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(0)
      y += noteLines.length * LINE_HEIGHT
    }
    y += 3
  }

  if (y + 40 > pageHeight - footerReserve) {
    doc.addPage()
    y = contentStartY
    drawHeaderImage()
  }

  y += 2
  doc.line(MARGIN, y, pageWidth - MARGIN, y)
  y += 8

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total annual energy saved: ${formatKwh(totalAnnualKwh)}`, MARGIN, y)
  y += 6
  doc.text(`Total annual cost saved: ${formatRand(totalAnnualCost)}`, MARGIN, y)
  y += 6
  doc.text(`Total upgrade investment: ${formatRand(totalUpgradeCost)}`, MARGIN, y)
  y += 6

  const paybackYears = calculatePaybackYears(
    totalUpgradeCost,
    totalAnnualCost,
    settings.annual_price_increase_percent,
  )
  if (paybackYears !== null) {
    const escalationNote =
      settings.annual_price_increase_percent > 0
        ? ` (assuming ${settings.annual_price_increase_percent}%/yr electricity price increase)`
        : ''
    doc.text(`Estimated payback period: ${paybackYears.toFixed(1)} years${escalationNote}`, MARGIN, y)
    y += 6
  }
  doc.setFont('helvetica', 'normal')

  if (settings.legal_disclaimer) {
    y += 8
    doc.setFontSize(8)
    doc.setTextColor(120)
    const lines = doc.splitTextToSize(settings.legal_disclaimer, contentWidth)
    doc.text(lines, MARGIN, y)
    doc.setTextColor(0)
  }

  if (footerImg && footerDims) {
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.addImage(
        footerImg.dataUrl,
        'JPEG',
        MARGIN + (contentWidth - footerDims.w) / 2,
        pageHeight - footerDims.h - IMAGE_PADDING,
        footerDims.w,
        footerDims.h,
      )
    }
  }

  return doc
}

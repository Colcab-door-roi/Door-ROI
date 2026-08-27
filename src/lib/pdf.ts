import { jsPDF } from 'jspdf'
import {
  calculateGdfCasemSavings,
  calculatePaybackYears,
  calculatePlugInFreezerSavings,
  calculateSavings,
  ZERO_RESULT,
} from './calculate'
import { resolveCost } from './costs'
import { formatKwh, formatNumber, formatRand } from './format'
import type {
  AppSettings,
  CasemSettings,
  CaseType,
  Category,
  CostRate,
  DoorType,
  PlantType,
  PlugInFreezerType,
  RemoteFreezerType,
  SalesRep,
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
  casemSettings: CasemSettings
  remoteFreezerTypes: RemoteFreezerType[]
  plugInFreezerTypes: PlugInFreezerType[]
  rep: SalesRep | null
}

const MARGIN = 14
const LINE_HEIGHT = 4.2
const IMAGE_PADDING = 4

// x-position, width (mm) for each column — cumulative widths sum to 168mm,
// comfortably inside A4's 182mm usable width (210mm page - 14mm margins
// each side), leaving margin to spare so nothing gets cut off.
const COLUMNS = [
  { label: 'Category', x: 14, width: 22, align: 'left' as const },
  { label: 'Case type', x: 36, width: 32, align: 'left' as const },
  { label: 'Qty', x: 68, width: 16, align: 'left' as const },
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

// Header/footer banners always span the full content width (page width
// minus the narrow page margin) — height simply follows from the image's
// own aspect ratio at that width.
function fitToWidth(img: LoadedImage, width: number) {
  return { w: width, h: width / (img.width / img.height) }
}

export async function generateStoreReport(ctx: ReportContext) {
  const {
    store,
    items,
    caseTypes,
    categories,
    plantType,
    doorType,
    settings,
    costRates,
    casemSettings,
    remoteFreezerTypes,
    plugInFreezerTypes,
    rep,
  } = ctx
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

  const headerDims = headerImg ? fitToWidth(headerImg, contentWidth) : null
  const footerDims = footerImg ? fitToWidth(footerImg, contentWidth) : null
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
  doc.text(`Sales rep: ${rep?.name ?? store.sales_rep_name ?? 'Unknown'}`, MARGIN, y)
  y += 6
  if (rep) {
    doc.text(`Region: ${rep.region}`, MARGIN, y)
    y += 6
  }
  doc.text(`Date: ${store.visit_date}`, MARGIN, y)
  y += 6
  doc.text(`Refrigeration plant: ${plantType.name} (COP ${plantType.cop})`, MARGIN, y)
  y += 6
  const heaterNote =
    doorType.heater_watts_per_ft > 0 ? ` (heated, ${doorType.heater_watts_per_ft} W/ft)` : ''
  const casemNote = store.casem ? ' with Casem' : ''
  doc.text(`Door type: ${doorType.name}${heaterNote}${casemNote}`, MARGIN, y)
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
  let totalFt = 0
  let hasPlugInFreezerItems = false

  for (const item of items) {
    const category = categories.find((c) => c.id === item.category_id)

    let result = ZERO_RESULT
    let upgradeCost = 0
    let qtyDisplay = ''
    let options = ''
    let caseTypeName = ''

    if (item.is_plugin_freezer) {
      const remoteType = remoteFreezerTypes.find((r) => r.id === item.remote_freezer_type_id)
      const plugInType = plugInFreezerTypes.find((p) => p.id === item.plugin_freezer_type_id)
      if (!remoteType || !plugInType) continue
      hasPlugInFreezerItems = true
      const remoteQty = item.remote_qty ?? 0
      const plugInResult = calculatePlugInFreezerSavings(
        remoteType,
        remoteQty,
        plugInType,
        plantType.freezer_cop,
        store.electricity_rate,
      )
      result = plugInResult
      upgradeCost = plugInResult.investmentCost
      qtyDisplay = `${remoteQty}x ${remoteType.length_m}m`
      caseTypeName = remoteType.name
      options = `-> ${plugInResult.requiredPlugInUnits}x ${plugInType.name}`
    } else if (item.is_gdf) {
      const qtyDoors = item.qty_doors ?? 0
      const qtyUnits = item.qty_gdf_units ?? 0
      result = calculateGdfCasemSavings(qtyDoors, casemSettings, item.casem, store.electricity_rate)
      upgradeCost = item.casem
        ? (casemSettings.cost_per_unit + casemSettings.installation_cost_per_unit) * qtyUnits
        : 0
      qtyDisplay = `${qtyDoors} dr / ${qtyUnits}u`
      options = item.casem ? 'Casem' : '—'
      caseTypeName = 'GDF'
    } else {
      const caseType = caseTypes.find((c) => c.id === item.case_type_id)
      if (!caseType) continue
      const qtyFt = item.qty_ft ?? 0
      const casemActive = store.casem && item.doors && !!item.casem_units
      result = item.doors
        ? calculateSavings(
            caseType,
            doorType,
            plantType,
            qtyFt,
            store.electricity_rate,
            store.casem ? casemSettings.heater_door_savings_percent : 0,
          )
        : ZERO_RESULT
      upgradeCost =
        (item.doors ? resolveCost(doorType, qtyFt) : 0) +
        (item.reclad && recladRate ? resolveCost(recladRate, qtyFt) : 0) +
        (item.canopy_led && canopyRate ? resolveCost(canopyRate, qtyFt) : 0) +
        (item.undershelf_led && undershelfRate ? resolveCost(undershelfRate, qtyFt) : 0) +
        (item.vertical_led ? (qtyFt / 4) * settings.vertical_led_cost_4ft : 0) +
        (casemActive
          ? (casemSettings.cost_per_unit + casemSettings.installation_cost_per_unit) * (item.casem_units ?? 0)
          : 0)
      qtyDisplay = `${qtyFt} ft`
      totalFt += qtyFt
      caseTypeName = caseType.name
      options =
        [
          item.doors ? '' : 'No Doors',
          item.reclad ? 'Reclad' : '',
          item.canopy_led ? 'Canopy LED' : '',
          item.undershelf_led ? 'Undershelf LED' : '',
          item.vertical_led ? 'Vertical LED' : '',
          casemActive ? `Casem x${item.casem_units}` : '',
        ]
          .filter(Boolean)
          .join(', ') || '—'
    }

    totalAnnualKwh += result.annualSavingsKwh
    totalAnnualCost += result.annualCostSaving
    totalUpgradeCost += upgradeCost

    const cellValues = [
      category?.name ?? '—',
      caseTypeName,
      qtyDisplay,
      options,
      formatNumber(result.annualSavingsKwh),
      formatRand(result.annualCostSaving),
      formatRand(upgradeCost),
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

  // Store-wide costs (not per-item): always-on subassembly/transport/labour,
  // plus outlying labour if this survey is flagged outlying. Both price per
  // 4ft section, applied to the survey's total ft-based footage (GDF doors
  // aren't measured in feet, so they don't contribute to this total).
  const subassemblyCost = (totalFt / 4) * settings.subassembly_transport_labour_cost_4ft
  const outlyingCost = store.outlying ? (totalFt / 4) * settings.outlying_labour_cost_4ft : 0
  totalUpgradeCost += subassemblyCost + outlyingCost

  const vatAmount = totalUpgradeCost * (settings.vat_percent / 100)
  const totalInclVat = totalUpgradeCost + vatAmount

  if (y + 70 > pageHeight - footerReserve) {
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
  doc.text(`Subassembly, transport & labour: ${formatRand(subassemblyCost)}`, MARGIN, y)
  y += 6
  if (store.outlying) {
    doc.text(`Outlying labour: ${formatRand(outlyingCost)}`, MARGIN, y)
    y += 6
  }
  doc.text(`Total upgrade investment (Excl. VAT): ${formatRand(totalUpgradeCost)}`, MARGIN, y)
  y += 6
  doc.text(`VAT (${settings.vat_percent}%): ${formatRand(vatAmount)}`, MARGIN, y)
  y += 6
  doc.text(`Total upgrade investment (Incl. VAT): ${formatRand(totalInclVat)}`, MARGIN, y)
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
    doc.text(
      `Estimated payback period: ${paybackYears.toFixed(1)} years (excl. VAT)${escalationNote}`,
      MARGIN,
      y,
    )
    y += 6
  }
  doc.setFont('helvetica', 'normal')

  if (hasPlugInFreezerItems) {
    y += 6
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text('Plug-in freezer cost excludes transport.', MARGIN, y)
    doc.setTextColor(0)
  }

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

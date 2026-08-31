import { jsPDF } from 'jspdf'
import {
  calculateGdfCasemSavings,
  calculatePaybackYears,
  calculatePlugInEnergyConsumption,
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
  EnergyReport,
  EnergyReportItem,
  PlantType,
  PlugInFreezerSettings,
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
  plugInFreezerSettings: PlugInFreezerSettings
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

export function plugInEnergyReportFilename(report: EnergyReport) {
  return `${sanitizeFilename(report.store_name)} Energy Report ${report.visit_date}.pdf`
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
    plugInFreezerSettings,
    rep,
  } = ctx
  const hasPlugInFreezerItems = items.some((i) => i.is_plugin_freezer)
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
  if (hasPlugInFreezerItems) {
    doc.text(`Freezer COP: ${plantType.freezer_cop}`, MARGIN, y)
    y += 6
  }
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
  let totalPlugInTransportCost = 0

  for (const item of items) {
    const category = categories.find((c) => c.id === item.category_id)

    let result = ZERO_RESULT
    let upgradeCost = 0
    let qtyDisplay = ''
    let options = ''
    let caseTypeName = ''
    let costBreakdown = ''

    if (item.is_plugin_freezer) {
      const spineRemoteType = remoteFreezerTypes.find((r) => r.id === item.spine_remote_freezer_type_id) ?? null
      const spinePlugInType = plugInFreezerTypes.find((p) => p.id === item.spine_plugin_freezer_type_id) ?? null
      const endRemoteType = remoteFreezerTypes.find((r) => r.id === item.end_remote_freezer_type_id) ?? null
      const endPlugInType = plugInFreezerTypes.find((p) => p.id === item.end_plugin_freezer_type_id) ?? null
      if (!spineRemoteType && !endRemoteType) continue
      const spineQty = item.spine_remote_qty ?? 0
      const endQty = item.end_remote_qty ?? 0
      const plugInResult = calculatePlugInFreezerSavings(
        spineRemoteType,
        spineQty,
        spinePlugInType,
        item.spine_connection_method,
        endRemoteType,
        endQty,
        endPlugInType,
        plantType.freezer_cop,
        store.electricity_rate,
        plugInFreezerSettings,
      )
      result = plugInResult
      // Transport moves into the survey-wide "Subassembly, transport &
      // labour" line below, same as every other transport/labour cost —
      // this row's own cost is just the plug-in units and whichever
      // connection method applies.
      upgradeCost = plugInResult.plugInUnitsCost + plugInResult.jointKitCost + plugInResult.centreSuperstructureCost
      totalPlugInTransportCost += plugInResult.transportCost
      qtyDisplay =
        [
          spineRemoteType ? `${spineQty}x ${spineRemoteType.length_m}m spine` : '',
          endRemoteType ? `${endQty}x end` : '',
        ]
          .filter(Boolean)
          .join(', ') || '—'
      caseTypeName = [spineRemoteType?.name, endRemoteType?.name].filter(Boolean).join(' + ')
      options =
        '-> ' +
        ([
          plugInResult.requiredSpinePlugInUnits > 0 && spinePlugInType
            ? `${plugInResult.requiredSpinePlugInUnits}x ${spinePlugInType.name}`
            : '',
          plugInResult.requiredEndPlugInUnits > 0 && endPlugInType
            ? `${plugInResult.requiredEndPlugInUnits}x ${endPlugInType.name}`
            : '',
        ]
          .filter(Boolean)
          .join(' + ') || '—')
      const connectionCost =
        item.spine_connection_method === 'superstructure'
          ? `Superstructure ${formatRand(plugInResult.centreSuperstructureCost)}`
          : item.spine_connection_method === 'joint_kit'
            ? `Joint kit ${formatRand(plugInResult.jointKitCost)}`
            : ''
      costBreakdown = [`Units ${formatRand(plugInResult.plugInUnitsCost)}`, connectionCost]
        .filter(Boolean)
        .join(' + ')
    } else if (item.is_gdf) {
      const qtyDoors = item.qty_doors ?? 0
      const qtyUnits = item.qty_gdf_units ?? 0
      result = calculateGdfCasemSavings(qtyDoors, casemSettings, item.casem, store.electricity_rate)
      upgradeCost = item.casem
        ? (casemSettings.cost_per_unit + casemSettings.installation_cost_per_unit) * qtyUnits
        : 0
      qtyDisplay = `${qtyDoors} dr / ${qtyUnits}u`
      options = item.casem ? 'Casem' : '—'
      caseTypeName = 'Casem'
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
    const noteParts = [costBreakdown, item.notes ? `Note: ${item.notes}` : ''].filter(Boolean)
    const noteLines = noteParts.length ? doc.splitTextToSize(noteParts.join('  —  '), contentWidth) : []
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

  // Store-wide costs (not per-item): always-on subassembly/transport/labour
  // (plus any plug-in freezer transport, rolled into the same line since
  // it's the same kind of cost), plus outlying labour if this survey is
  // flagged outlying. The ft-based portion prices per 4ft section, applied
  // to the survey's total ft-based footage (GDF doors aren't measured in
  // feet, so they don't contribute to this total).
  const subassemblyCost =
    (totalFt / 4) * settings.subassembly_transport_labour_cost_4ft + totalPlugInTransportCost
  const outlyingCost = store.outlying ? (totalFt / 4) * settings.outlying_labour_cost_4ft : 0
  totalUpgradeCost += subassemblyCost + outlyingCost

  const vatAmount = totalUpgradeCost * (settings.vat_percent / 100)
  const totalInclVat = totalUpgradeCost + vatAmount

  if (y + 20 > pageHeight - footerReserve) {
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
  doc.setFont('helvetica', 'normal')

  // Everything else reads as a quote/accounting summary: right-aligned,
  // near the bottom of whichever page it lands on, with rules above the
  // subtotal and the grand total.
  const paybackYears = calculatePaybackYears(
    totalUpgradeCost,
    totalAnnualCost,
    settings.annual_price_increase_percent,
  )
  const escalationNote =
    paybackYears !== null && settings.annual_price_increase_percent > 0
      ? ` (assuming ${settings.annual_price_increase_percent}%/yr electricity price increase)`
      : ''
  const paybackText =
    paybackYears !== null
      ? `Estimated payback period: ${paybackYears.toFixed(1)} years (excl. VAT)${escalationNote}`
      : null

  interface SummaryRow {
    label: string
    value: string
    bold?: boolean
    ruleAbove?: boolean
  }
  const summaryRows: SummaryRow[] = [
    { label: 'Subassembly, transport & labour', value: formatRand(subassemblyCost) },
  ]
  if (store.outlying) {
    summaryRows.push({ label: 'Outlying labour', value: formatRand(outlyingCost) })
  }
  summaryRows.push(
    { label: 'Subtotal (Excl. VAT)', value: formatRand(totalUpgradeCost), ruleAbove: true },
    { label: `VAT (${settings.vat_percent}%)`, value: formatRand(vatAmount) },
    { label: 'TOTAL (Incl. VAT)', value: formatRand(totalInclVat), bold: true, ruleAbove: true },
  )

  doc.setFontSize(9)
  const maxLabelW = Math.max(
    ...summaryRows.map((r) => {
      doc.setFont('helvetica', r.bold ? 'bold' : 'normal')
      return doc.getTextWidth(r.label)
    }),
  )
  const maxValueW = Math.max(
    ...summaryRows.map((r) => {
      doc.setFont('helvetica', r.bold ? 'bold' : 'normal')
      return doc.getTextWidth(r.value)
    }),
  )
  doc.setFont('helvetica', 'normal')
  const SUMMARY_GAP = 8
  const summaryWidth = maxLabelW + maxValueW + SUMMARY_GAP
  const summaryX = pageWidth - MARGIN - summaryWidth

  const ROW_H = 5.5
  const RULE_GAP = 2.5
  const summaryHeight = summaryRows.reduce((h, r) => h + ROW_H + (r.ruleAbove ? RULE_GAP : 0), 0)
  const paybackHeight = paybackText ? 8.5 : 0

  // The disclaimer follows directly after this block, so its height has to
  // be reserved up front too — otherwise anchoring the block to the bottom
  // of the page leaves no room for it and it gets pushed off the visible
  // page entirely.
  doc.setFontSize(8)
  const disclaimerLines = settings.legal_disclaimer
    ? doc.splitTextToSize(settings.legal_disclaimer, contentWidth)
    : []
  const disclaimerHeight = disclaimerLines.length ? 8 + disclaimerLines.length * LINE_HEIGHT : 0
  doc.setFontSize(9)

  const blockHeight = summaryHeight + paybackHeight + disclaimerHeight

  if (y + blockHeight > pageHeight - footerReserve) {
    doc.addPage()
    y = contentStartY
    drawHeaderImage()
  }

  let summaryY = Math.max(y, pageHeight - footerReserve - blockHeight)

  for (const row of summaryRows) {
    if (row.ruleAbove) {
      summaryY += RULE_GAP
      doc.line(summaryX, summaryY - 3.5, summaryX + summaryWidth, summaryY - 3.5)
    }
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
    doc.text(row.label, summaryX, summaryY)
    doc.text(row.value, summaryX + summaryWidth, summaryY, { align: 'right' })
    summaryY += ROW_H
  }
  doc.setFont('helvetica', 'normal')

  if (paybackText) {
    summaryY += 2.5
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(paybackText, pageWidth - MARGIN, summaryY, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    summaryY += 6
  }

  y = summaryY

  if (disclaimerLines.length) {
    y += 8
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(disclaimerLines, MARGIN, y)
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

// x-position, width (mm) for each column of the energy report table.
// Category/Product/Qty are plain columns; the six numeric columns sit
// under two grouped headers (Energy / Cost), each with its own
// Daily/Monthly/Annual sub-label drawn as a second header row.
const ENERGY_COLUMNS = [
  { label: 'Category', x: 14, width: 20, align: 'left' as const },
  { label: 'Product', x: 34, width: 38, align: 'left' as const },
  { label: 'Qty', x: 72, width: 10, align: 'right' as const },
  { label: 'Daily', x: 82, width: 16, align: 'right' as const },
  { label: 'Monthly', x: 98, width: 18, align: 'right' as const },
  { label: 'Annual', x: 116, width: 20, align: 'right' as const },
  { label: 'Daily', x: 136, width: 16, align: 'right' as const },
  { label: 'Monthly', x: 152, width: 18, align: 'right' as const },
  { label: 'Annual', x: 170, width: 20, align: 'right' as const },
]

// Plain rectangles — jsPDF has no charting library, and a single flat
// grey keeps the chart consistent with the rest of the report's
// monochrome, formal-document look rather than introducing a one-off
// brand color.
function drawAnnualKwhChart(
  doc: jsPDF,
  bars: { label: string; value: number }[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const maxValue = Math.max(...bars.map((b) => b.value), 1)
  const gap = 6
  const barWidth = Math.min(16, (width - gap * (bars.length - 1)) / bars.length)
  const totalWidth = barWidth * bars.length + gap * (bars.length - 1)
  let bx = x + (width - totalWidth) / 2

  doc.setFontSize(7.5)
  for (const bar of bars) {
    const barHeight = maxValue > 0 ? (bar.value / maxValue) * height : 0
    const barY = y + height - barHeight
    doc.setFillColor(90, 90, 90)
    doc.rect(bx, barY, barWidth, barHeight, 'F')
    doc.text(formatNumber(bar.value), bx + barWidth / 2, barY - 1.5, { align: 'center' })
    const labelLines = doc.splitTextToSize(bar.label, barWidth + gap - 1)
    doc.text(labelLines, bx + barWidth / 2, y + height + 4, { align: 'center' })
    bx += barWidth + gap
  }
  doc.setDrawColor(0)
  doc.line(x, y + height, x + width, y + height)
}

interface PlugInEnergyReportContext {
  report: EnergyReport
  items: EnergyReportItem[]
  categories: Category[]
  plugInFreezerTypes: PlugInFreezerType[]
  settings: AppSettings
  rep: SalesRep | null
}

export async function generatePlugInEnergyReport(ctx: PlugInEnergyReportContext) {
  const { report, items, categories, plugInFreezerTypes, settings, rep } = ctx

  const [headerImg, footerImg] = await Promise.all([
    settings.header_image_url ? loadImage(settings.header_image_url) : Promise.resolve(null),
    settings.footer_image_url ? loadImage(settings.footer_image_url) : Promise.resolve(null),
  ])

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setProperties({ title: plugInEnergyReportFilename(report).replace(/\.pdf$/, '') })

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
  doc.text('Plug-in Freezer — Energy Consumption Report', MARGIN, y)
  y += 7

  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text('Prepared for product selection purposes — not a replacement or investment proposal.', MARGIN, y)
  doc.setTextColor(0)
  y += 8

  doc.setFontSize(11)
  doc.text(`Store: ${report.store_name}`, MARGIN, y)
  y += 6
  doc.text(`Sales rep: ${rep?.name ?? 'Unknown'}`, MARGIN, y)
  y += 6
  if (rep) {
    doc.text(`Region: ${rep.region}`, MARGIN, y)
    y += 6
  }
  doc.text(`Date: ${report.visit_date}`, MARGIN, y)
  y += 6
  doc.text(`Electricity rate: ${formatRand(report.electricity_rate)} / kWh`, MARGIN, y)
  y += 10

  function drawEnergyTableHeader() {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Category', ENERGY_COLUMNS[0].x, y)
    doc.text('Product', ENERGY_COLUMNS[1].x, y)
    doc.text('Qty', ENERGY_COLUMNS[2].x + ENERGY_COLUMNS[2].width, y, { align: 'right' })
    const energyStart = ENERGY_COLUMNS[3].x
    const energyEnd = ENERGY_COLUMNS[5].x + ENERGY_COLUMNS[5].width
    doc.text('Energy (kWh)', (energyStart + energyEnd) / 2, y, { align: 'center' })
    const costStart = ENERGY_COLUMNS[6].x
    const costEnd = ENERGY_COLUMNS[8].x + ENERGY_COLUMNS[8].width
    doc.text('Cost (R excl. VAT)', (costStart + costEnd) / 2, y, { align: 'center' })
    y += 4.5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100)
    for (let i = 3; i < ENERGY_COLUMNS.length; i++) {
      const col = ENERGY_COLUMNS[i]
      doc.text(col.label, col.x + col.width, y, { align: 'right' })
    }
    doc.setTextColor(0)
    y += 5
    doc.line(MARGIN, y, pageWidth - MARGIN, y)
    y += 5
    doc.setFontSize(9)
  }

  drawEnergyTableHeader()

  let totalDailyKwh = 0
  let totalMonthlyKwh = 0
  let totalAnnualKwh = 0
  let totalDailyCost = 0
  let totalMonthlyCost = 0
  let totalAnnualCost = 0
  let itemCount = 0

  for (const item of items) {
    const category = categories.find((c) => c.id === item.category_id)
    const plugInType = plugInFreezerTypes.find((p) => p.id === item.plugin_freezer_type_id)
    if (!plugInType) continue
    itemCount++

    const consumption = calculatePlugInEnergyConsumption(plugInType, item.qty, report.electricity_rate)
    totalDailyKwh += consumption.dailyKwh
    totalMonthlyKwh += consumption.monthlyKwh
    totalAnnualKwh += consumption.annualKwh
    totalDailyCost += consumption.dailyCost
    totalMonthlyCost += consumption.monthlyCost
    totalAnnualCost += consumption.annualCost

    const cellValues = [
      category?.name ?? '—',
      plugInType.name,
      item.qty.toString(),
      formatNumber(consumption.dailyKwh),
      formatNumber(consumption.monthlyKwh),
      formatNumber(consumption.annualKwh),
      formatRand(consumption.dailyCost),
      formatRand(consumption.monthlyCost),
      formatRand(consumption.annualCost),
    ]

    const wrappedCells = cellValues.map((value, i) => doc.splitTextToSize(value, ENERGY_COLUMNS[i].width))
    const noteLines = item.notes ? doc.splitTextToSize(`Note: ${item.notes}`, contentWidth) : []
    const rowLines = Math.max(...wrappedCells.map((w) => w.length))
    const rowHeight = rowLines * LINE_HEIGHT + noteLines.length * LINE_HEIGHT + 3

    if (y + rowHeight > pageHeight - footerReserve) {
      doc.addPage()
      y = contentStartY
      drawHeaderImage()
      drawEnergyTableHeader()
    }

    doc.setFontSize(9)
    wrappedCells.forEach((lines, i) => {
      const col = ENERGY_COLUMNS[i]
      doc.text(lines, col.align === 'right' ? col.x + col.width : col.x, y, { align: col.align })
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

  if (y + 12 > pageHeight - footerReserve) {
    doc.addPage()
    y = contentStartY
    drawHeaderImage()
  }

  y += 1
  doc.line(MARGIN, y, pageWidth - MARGIN, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('Total', ENERGY_COLUMNS[0].x, y)
  const totalValues = [
    formatNumber(totalDailyKwh),
    formatNumber(totalMonthlyKwh),
    formatNumber(totalAnnualKwh),
    formatRand(totalDailyCost),
    formatRand(totalMonthlyCost),
    formatRand(totalAnnualCost),
  ]
  totalValues.forEach((value, i) => {
    const col = ENERGY_COLUMNS[i + 3]
    doc.text(value, col.x + col.width, y, { align: 'right' })
  })
  doc.setFont('helvetica', 'normal')
  y += 10

  if (itemCount > 0) {
    // Three columns for the whole proposed lineup (every product line
    // combined, spine and end units alike): Daily, Monthly, Annual — the
    // table above already gives the per-product detail, so this is a
    // single at-a-glance progression rather than a per-product breakdown.
    const chartHeight = 40
    const chartBlockHeight = 16 + chartHeight + 10
    if (y + chartBlockHeight > pageHeight - footerReserve) {
      doc.addPage()
      y = contentStartY
      drawHeaderImage()
    }
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('Total energy consumption (kWh)', MARGIN, y)
    doc.setFont('helvetica', 'normal')
    y += 8
    drawAnnualKwhChart(
      doc,
      [
        { label: 'Daily', value: totalDailyKwh },
        { label: 'Monthly', value: totalMonthlyKwh },
        { label: 'Annual', value: totalAnnualKwh },
      ],
      MARGIN,
      y,
      contentWidth,
      chartHeight,
    )
    y += chartHeight + 10
  }

  doc.setFontSize(8)
  doc.setTextColor(120)
  const caveatLines = doc.splitTextToSize(
    'Figures are manufacturer-rated energy draw at the electricity rate above and do not account for door-opening frequency, ambient conditions, or load. Provided for comparison purposes only.',
    contentWidth,
  )
  if (y + caveatLines.length * LINE_HEIGHT > pageHeight - footerReserve) {
    doc.addPage()
    y = contentStartY
    drawHeaderImage()
  }
  doc.text(caveatLines, MARGIN, y)
  doc.setTextColor(0)
  y += caveatLines.length * LINE_HEIGHT

  if (settings.legal_disclaimer) {
    doc.setFontSize(8)
    const lines = doc.splitTextToSize(settings.legal_disclaimer, contentWidth)
    if (y + 8 + lines.length * LINE_HEIGHT > pageHeight - footerReserve) {
      doc.addPage()
      y = contentStartY
      drawHeaderImage()
    }
    y += 8
    doc.setTextColor(120)
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

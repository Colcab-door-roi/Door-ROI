import { jsPDF } from 'jspdf'
import {
  calculateGdfCasemSavings,
  calculatePaybackYears,
  calculatePlugInEnergyConsumption,
  calculatePlugInFreezerSavings,
  calculatePlugInLengthM,
  calculateSavings,
  ZERO_RESULT,
} from './calculate'
import { resolveCost } from './costs'
import { formatKwh, formatNumber, formatRand, formatRandRate } from './format'
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

// Gutter reserved on the side of each cell nearest the column's divider
// line, so wrapped text never touches it — text still sits flush against
// its own column's outer (left/right-margin) edge.
const COLUMN_PADDING = 1.5
const DIVIDER_COLOR = 210

// x-position, width (mm) for each column of the Door ROI quote table —
// matches Colcab's Syspro-generated quote layout (CODE/QTY/FT/DESCRIPTION/
// TOTAL FT/UNIT PRICE/LINE DISCOUNT/AMOUNT). Cumulative widths sum to
// 182mm, spanning the full usable width of A4.
const QUOTE_COLUMNS = [
  { label: 'CODE', x: 14, width: 20, align: 'left' as const },
  { label: 'QTY', x: 34, width: 12, align: 'right' as const },
  { label: 'FT', x: 46, width: 12, align: 'right' as const },
  { label: 'DESCRIPTION', x: 58, width: 56, align: 'left' as const },
  { label: 'TOTAL FT', x: 114, width: 16, align: 'right' as const },
  { label: 'UNIT PRICE', x: 130, width: 22, align: 'right' as const },
  { label: 'LINE DISCOUNT', x: 152, width: 20, align: 'right' as const },
  { label: 'AMOUNT', x: 172, width: 24, align: 'right' as const },
]

// Colcab's fixed company/legal details — printed on every page of the quote,
// same as the Syspro letterhead. Not admin-configurable: it's a legal
// identity, not survey data.
const COLCAB_LETTERHEAD = {
  regNo: 'Company Registration No. 1996/004084/07',
  vatNo: 'VAT Registration No. 4220273652',
  addressLines: ['P O Box 123', 'Blackheath, 7581', 'Buttskop Road'],
  tel: '(021) 907 2800',
  email: 'info.cpt@colcabct.co.za',
}

function sanitizeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim()
}

// A light grid between columns so dense rows of numbers read as separate
// fields rather than running together — drawn once per page for the span
// of rows actually printed on it (top/bottom passed in by the caller).
function drawColumnDividers(
  doc: jsPDF,
  columns: { x: number }[],
  top: number,
  bottom: number,
) {
  if (bottom <= top) return
  doc.setDrawColor(DIVIDER_COLOR)
  doc.setLineWidth(0.1)
  for (let i = 1; i < columns.length; i++) {
    doc.line(columns[i].x, top, columns[i].x, bottom)
  }
  doc.setDrawColor(0)
  doc.setLineWidth(0.2)
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

// A single priced row on the Syspro-style quote table — one per cost
// component (a case's doors, its reclad, its Casem, ...) rather than one
// per captured survey item, so a case with doors+reclad+canopy becomes
// three lines, each under its own category bar.
interface QuoteLine {
  category: string
  code: string
  qty: number
  ft: number | null
  description: string
  totalFt: number | null
  unitPrice: number
  discount: number
  amount: number
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

  const footerDims = footerImg ? fitToWidth(footerImg, contentWidth) : null
  const footerReserve = footerDims ? footerDims.h + IMAGE_PADDING * 2 : 12

  const LOGO_W = 40
  const logoH = headerImg ? LOGO_W / (headerImg.width / headerImg.height) : 0

  let y = MARGIN

  function ensureRoom(height: number) {
    if (y + height > pageHeight - footerReserve) {
      doc.addPage()
      drawLetterhead()
    }
  }

  // Colcab's own letterhead (fixed legal details + logo + Tel/E-mail) plus
  // the customer's own contact block (Attention/Tel/Email, captured on the
  // survey profile) — repeats on every page, same as the Syspro original.
  function drawLetterhead() {
    y = MARGIN
    let leftY = y + 3
    let rightY = y + 3

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Colcab (Pty) Ltd', MARGIN, leftY)
    leftY += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    for (const line of [
      COLCAB_LETTERHEAD.regNo,
      COLCAB_LETTERHEAD.vatNo,
      ...COLCAB_LETTERHEAD.addressLines,
    ]) {
      doc.text(line, MARGIN, leftY)
      leftY += 3.5
    }

    doc.setFontSize(8)
    doc.text('Tel:', pageWidth - MARGIN - 45, rightY)
    doc.text(COLCAB_LETTERHEAD.tel, pageWidth - MARGIN, rightY, { align: 'right' })
    rightY += 4
    doc.text('E-mail:', pageWidth - MARGIN - 45, rightY)
    doc.text(COLCAB_LETTERHEAD.email, pageWidth - MARGIN, rightY, { align: 'right' })
    rightY += 4

    if (headerImg) {
      doc.addImage(headerImg.dataUrl, 'JPEG', (pageWidth - LOGO_W) / 2, y, LOGO_W, logoH)
    }

    y = Math.max(leftY, rightY, y + logoH + 3) + 3
    doc.setDrawColor(180)
    doc.line(MARGIN, y, pageWidth - MARGIN, y)
    doc.setDrawColor(0)
    y += 5

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(store.store_name || 'Store', MARGIN, y)
    doc.setFont('helvetica', 'normal')

    doc.setFontSize(8)
    let attnY = y
    doc.text('Attention:', pageWidth - MARGIN - 60, attnY)
    doc.text(store.attention_name ?? '', pageWidth - MARGIN, attnY, { align: 'right' })
    attnY += 4
    doc.text('Tel No:', pageWidth - MARGIN - 60, attnY)
    doc.text(store.customer_tel ?? '', pageWidth - MARGIN, attnY, { align: 'right' })
    attnY += 4
    doc.text('Email:', pageWidth - MARGIN - 60, attnY)
    doc.text(store.customer_email ?? '', pageWidth - MARGIN, attnY, { align: 'right' })
    attnY += 4

    y = Math.max(y + 4, attnY) + 3
  }

  drawLetterhead()

  // Page-1-only: Sales Rep / Customer PO / Store Name / Warranty / Store
  // Location on the left, "QUOTATION" heading + Quotation No / Customer
  // Code / dates on the right — Quotation No, Customer Code, Warranty and
  // Expiry date are printed blank (no numbering scheme configured yet).
  const rightColX = MARGIN + contentWidth / 2 + 4
  let leftY = y
  let rightY = y

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('QUOTATION', rightColX, rightY)
  rightY += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  const leftInfoRows: [string, string][] = [
    ['Sales Rep', rep?.name ?? store.sales_rep_name ?? ''],
    ['Customer Purchase Order No:', ''],
    ['Store Name', store.store_name],
    ['Warranty:', ''],
    ['Store Location:', store.store_location ?? ''],
  ]
  for (const [label, value] of leftInfoRows) {
    doc.text(label, MARGIN, leftY)
    doc.text(value, MARGIN + 55, leftY)
    leftY += 5
  }

  const rightInfoRows: [string, string][] = [
    ['Quotation No:', ''],
    ['Customer Code:', ''],
    ['Quotation date:', store.visit_date],
    ['Expiry date:', ''],
  ]
  for (const [label, value] of rightInfoRows) {
    doc.text(label, rightColX, rightY)
    doc.text(value, rightColX + 35, rightY)
    rightY += 5
  }

  y = Math.max(leftY, rightY) + 4
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.text('We thank you for your valued enquiry and have pleasure in quoting the following', MARGIN, y)
  doc.setFont('helvetica', 'normal')
  y += 8

  function drawTableHeader() {
    ensureRoom(11)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    for (const col of QUOTE_COLUMNS) {
      const lines = doc.splitTextToSize(col.label, col.width - COLUMN_PADDING)
      doc.text(lines, col.align === 'right' ? col.x + col.width : col.x, y, { align: col.align })
    }
    doc.setFont('helvetica', 'normal')
    y += 5
    doc.line(MARGIN, y, pageWidth - MARGIN, y)
    y += 5
  }

  drawTableHeader()

  function drawCategoryBar(label: string) {
    const barHeight = 6
    ensureRoom(barHeight + 2)
    doc.setFillColor(90, 90, 90)
    doc.rect(MARGIN, y - 4, contentWidth, barHeight, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(label, MARGIN + 2, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0)
    y += barHeight + 1
  }

  function drawLineRow(line: QuoteLine) {
    const cellValues = [
      line.code,
      line.qty.toString(),
      line.ft !== null ? line.ft.toString() : '-',
      line.description,
      line.totalFt !== null ? line.totalFt.toString() : '-',
      formatRand(line.unitPrice),
      line.discount > 0 ? formatRand(line.discount) : '',
      formatRand(line.amount),
    ]
    const wrappedCells = cellValues.map((value, i) =>
      doc.splitTextToSize(value, QUOTE_COLUMNS[i].width - COLUMN_PADDING),
    )
    const rowLines = Math.max(...wrappedCells.map((w) => w.length))
    ensureRoom(rowLines * LINE_HEIGHT + 1)

    doc.setFontSize(8)
    wrappedCells.forEach((lines, i) => {
      const col = QUOTE_COLUMNS[i]
      doc.text(lines, col.align === 'right' ? col.x + col.width : col.x, y, { align: col.align })
    })
    drawColumnDividers(doc, QUOTE_COLUMNS, y - LINE_HEIGHT + 1, y + (rowLines - 1) * LINE_HEIGHT + 1)
    y += rowLines * LINE_HEIGHT + 1
  }

  let totalAnnualKwh = 0
  let totalAnnualCost = 0
  let totalFt = 0
  let totalPlugInTransportCost = 0
  const quoteLines: QuoteLine[] = []
  const transportLines: QuoteLine[] = []

  for (const item of items) {
    const category = categories.find((c) => c.id === item.category_id)
    let result = ZERO_RESULT
    const itemLines: QuoteLine[] = []

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
      totalPlugInTransportCost += plugInResult.transportCost

      if (plugInResult.requiredSpinePlugInUnits > 0 && spinePlugInType) {
        itemLines.push({
          category: 'PLUG-IN FREEZER',
          code: spinePlugInType.code ?? '',
          qty: plugInResult.requiredSpinePlugInUnits,
          ft: null,
          description: spinePlugInType.name,
          totalFt: null,
          unitPrice: spinePlugInType.cost_per_unit,
          discount: 0,
          amount: plugInResult.requiredSpinePlugInUnits * spinePlugInType.cost_per_unit,
        })
      }
      if (plugInResult.requiredEndPlugInUnits > 0 && endPlugInType) {
        itemLines.push({
          category: 'PLUG-IN FREEZER',
          code: endPlugInType.code ?? '',
          qty: plugInResult.requiredEndPlugInUnits,
          ft: null,
          description: endPlugInType.name,
          totalFt: null,
          unitPrice: endPlugInType.cost_per_unit,
          discount: 0,
          amount: plugInResult.requiredEndPlugInUnits * endPlugInType.cost_per_unit,
        })
      }
      if (item.spine_connection_method === 'joint_kit' && plugInResult.jointKitCost > 0) {
        transportLines.push({
          category: 'TRANSPORT & LINE-UP',
          code: '',
          qty: 1,
          ft: null,
          description: 'Back-to-back joint kit',
          totalFt: null,
          unitPrice: plugInResult.jointKitCost,
          discount: 0,
          amount: plugInResult.jointKitCost,
        })
      } else if (item.spine_connection_method === 'superstructure' && plugInResult.centreSuperstructureCost > 0) {
        transportLines.push({
          category: 'TRANSPORT & LINE-UP',
          code: '',
          qty: 1,
          ft: null,
          description: 'Centre superstructure',
          totalFt: null,
          unitPrice: plugInResult.centreSuperstructureCost,
          discount: 0,
          amount: plugInResult.centreSuperstructureCost,
        })
      }
    } else if (item.is_gdf) {
      const qtyDoors = item.qty_doors ?? 0
      const qtyUnits = item.qty_gdf_units ?? 0
      result = calculateGdfCasemSavings(qtyDoors, casemSettings, item.casem, store.electricity_rate)
      if (item.casem && qtyUnits > 0) {
        const unitPrice = casemSettings.cost_per_unit + casemSettings.installation_cost_per_unit
        itemLines.push({
          category: 'CASEM',
          code: casemSettings.code ?? '',
          qty: qtyUnits,
          ft: null,
          description: category?.name ?? 'GDF',
          totalFt: null,
          unitPrice,
          discount: 0,
          amount: qtyUnits * unitPrice,
        })
      }
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
      totalFt += qtyFt
      const description = category?.name ? `${category.name} — ${caseType.name}` : caseType.name

      if (item.doors) {
        const amount = resolveCost(doorType, qtyFt)
        itemLines.push({
          category: 'DOORS',
          code: doorType.code ?? '',
          qty: 1,
          ft: qtyFt,
          description,
          totalFt: qtyFt,
          unitPrice: amount,
          discount: 0,
          amount,
        })
      }
      if (item.reclad && recladRate) {
        const amount = resolveCost(recladRate, qtyFt)
        itemLines.push({
          category: 'RECLAD',
          code: recladRate.code ?? '',
          qty: 1,
          ft: qtyFt,
          description,
          totalFt: qtyFt,
          unitPrice: amount,
          discount: 0,
          amount,
        })
      }
      if (item.canopy_led && canopyRate) {
        const amount = resolveCost(canopyRate, qtyFt)
        itemLines.push({
          category: 'CANOPY LED',
          code: canopyRate.code ?? '',
          qty: 1,
          ft: qtyFt,
          description,
          totalFt: qtyFt,
          unitPrice: amount,
          discount: 0,
          amount,
        })
      }
      if (item.undershelf_led && undershelfRate) {
        const amount = resolveCost(undershelfRate, qtyFt)
        itemLines.push({
          category: 'UNDERSHELF LED',
          code: undershelfRate.code ?? '',
          qty: 1,
          ft: qtyFt,
          description,
          totalFt: qtyFt,
          unitPrice: amount,
          discount: 0,
          amount,
        })
      }
      if (item.vertical_led) {
        const amount = (qtyFt / 4) * settings.vertical_led_cost_4ft
        itemLines.push({
          category: 'VERTICAL LED',
          code: settings.vertical_led_code ?? '',
          qty: 1,
          ft: qtyFt,
          description,
          totalFt: qtyFt,
          unitPrice: amount,
          discount: 0,
          amount,
        })
      }
      if (casemActive) {
        const qty = item.casem_units ?? 0
        const unitPrice = casemSettings.cost_per_unit + casemSettings.installation_cost_per_unit
        itemLines.push({
          category: 'CASEM',
          code: casemSettings.code ?? '',
          qty,
          ft: null,
          description,
          totalFt: null,
          unitPrice,
          discount: 0,
          amount: qty * unitPrice,
        })
      }
    }

    // A store item carries a single discount, but can produce several
    // quote lines — the whole discount lands on the first line generated
    // for it, keeping the total reduction correct without inventing a
    // per-component split the rep never specified.
    if (itemLines.length > 0 && item.discount_amount > 0) {
      itemLines[0].discount = item.discount_amount
      itemLines[0].amount = Math.max(0, itemLines[0].amount - item.discount_amount)
    }

    quoteLines.push(...itemLines)
    totalAnnualKwh += result.annualSavingsKwh
    totalAnnualCost += result.annualCostSaving
  }

  // Store-wide costs (not per-item): always-on subassembly/transport/labour
  // (plus any plug-in freezer transport, rolled into the same line since
  // it's the same kind of cost), plus outlying labour if this survey is
  // flagged outlying. The ft-based portion prices per 4ft section, applied
  // to the survey's total ft-based footage (GDF doors aren't measured in
  // feet, so they don't contribute to this total).
  const subassemblyCost =
    (totalFt / 4) * settings.subassembly_transport_labour_cost_4ft + totalPlugInTransportCost
  if (subassemblyCost > 0) {
    transportLines.push({
      category: 'TRANSPORT & LINE-UP',
      code: settings.subassembly_code ?? '',
      qty: 1,
      ft: null,
      description: 'Subassembly, transport & labour',
      totalFt: null,
      unitPrice: subassemblyCost,
      discount: 0,
      amount: subassemblyCost,
    })
  }
  const outlyingCost = store.outlying ? (totalFt / 4) * settings.outlying_labour_cost_4ft : 0
  if (outlyingCost > 0) {
    transportLines.push({
      category: 'TRANSPORT & LINE-UP',
      code: settings.outlying_code ?? '',
      qty: 1,
      ft: null,
      description: 'Outlying labour',
      totalFt: null,
      unitPrice: outlyingCost,
      discount: 0,
      amount: outlyingCost,
    })
  }

  // Group lines by category, numbered in the order each category first
  // appears — "TRANSPORT & LINE-UP" always renders last, same as the
  // Syspro sample, regardless of when its costs were computed.
  const categoryOrder: string[] = []
  const linesByCategory = new Map<string, QuoteLine[]>()
  for (const line of quoteLines) {
    if (!linesByCategory.has(line.category)) {
      categoryOrder.push(line.category)
      linesByCategory.set(line.category, [])
    }
    linesByCategory.get(line.category)!.push(line)
  }

  let categoryNum = 0
  for (const category of categoryOrder) {
    categoryNum += 1
    drawCategoryBar(`${String(categoryNum).padStart(2, '0')} - ${category}`)
    for (const line of linesByCategory.get(category)!) drawLineRow(line)
  }
  if (transportLines.length > 0) {
    categoryNum += 1
    drawCategoryBar(`${String(categoryNum).padStart(2, '0')} - TRANSPORT & LINE-UP`)
    for (const line of transportLines) drawLineRow(line)
  }

  const totalBeforeTax = [...quoteLines, ...transportLines].reduce((sum, l) => sum + l.amount, 0)
  const vatAmount = totalBeforeTax * (settings.vat_percent / 100)
  const totalInclVat = totalBeforeTax + vatAmount

  ensureRoom(70)
  y += 2
  doc.line(MARGIN, y, pageWidth - MARGIN, y)
  y += 8

  const bottomStartY = y
  const leftColX = MARGIN
  const leftColWidth = contentWidth / 2 - 4
  const bottomRightX = MARGIN + contentWidth / 2 + 4
  const bottomRightWidth = contentWidth / 2 - 4

  // Right column: Total Before Tax / VAT / Total, then — moved down here,
  // beside the grey disclaimer box in the left column — the ROI figures.
  rightY = bottomStartY
  doc.setFontSize(9)
  const totalRows: { label: string; value: string; bold?: boolean; ruleAbove?: boolean }[] = [
    { label: 'Total Before Tax', value: formatRand(totalBeforeTax) },
    { label: 'Total V.A.T.', value: formatRand(vatAmount) },
    { label: 'Total', value: formatRand(totalInclVat), bold: true, ruleAbove: true },
  ]
  for (const row of totalRows) {
    if (row.ruleAbove) {
      rightY += 2
      doc.line(bottomRightX, rightY - 2.5, bottomRightX + bottomRightWidth, rightY - 2.5)
    }
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
    doc.text(row.label, bottomRightX, rightY)
    doc.text(row.value, bottomRightX + bottomRightWidth, rightY, { align: 'right' })
    rightY += 5.5
  }
  doc.setFont('helvetica', 'normal')

  rightY += 5
  const paybackYears = calculatePaybackYears(totalBeforeTax, totalAnnualCost, settings.annual_price_increase_percent)
  const escalationNote =
    paybackYears !== null && settings.annual_price_increase_percent > 0
      ? ` (assuming ${settings.annual_price_increase_percent}%/yr electricity price increase)`
      : ''
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('ROI summary', bottomRightX, rightY)
  rightY += 5.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Total annual energy saved: ${formatKwh(totalAnnualKwh)}`, bottomRightX, rightY)
  rightY += 5
  doc.text(`Total annual cost saved: ${formatRand(totalAnnualCost)}`, bottomRightX, rightY)
  rightY += 5
  if (paybackYears !== null) {
    const paybackLines = doc.splitTextToSize(
      `Estimated payback period: ${paybackYears.toFixed(1)} years (excl. VAT)${escalationNote}`,
      bottomRightWidth,
    )
    doc.text(paybackLines, bottomRightX, rightY)
    rightY += paybackLines.length * LINE_HEIGHT
  }

  // Left column: Acceptance/signature, then the grey disclaimer box.
  leftY = bottomStartY
  doc.setFontSize(9)
  doc.text('Acceptance of Quotation:', leftColX, leftY)
  leftY += 14
  doc.line(leftColX, leftY, leftColX + leftColWidth, leftY)
  leftY += 4
  doc.setFontSize(8)
  doc.text('Signature', leftColX, leftY)
  leftY += 7

  doc.setFontSize(8)
  const disclaimerLines = settings.legal_disclaimer
    ? doc.splitTextToSize(settings.legal_disclaimer, leftColWidth - 6)
    : []
  if (disclaimerLines.length) {
    const boxHeight = disclaimerLines.length * LINE_HEIGHT + 6
    doc.setFillColor(235, 235, 235)
    doc.rect(leftColX, leftY, leftColWidth, boxHeight, 'F')
    doc.setTextColor(80, 80, 80)
    doc.text(disclaimerLines, leftColX + 3, leftY + 5)
    doc.setTextColor(0)
    leftY += boxHeight
  }

  y = Math.max(leftY, rightY) + 4

  addTermsPages(doc, {
    pageHeight,
    contentWidth,
    footerReserve,
    rep,
    drawLetterhead: () => {
      doc.addPage()
      drawLetterhead()
    },
    getY: () => y,
    setY: (v) => {
      y = v
    },
  })

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

// The static Ts&Cs / payment / banking / POPI text and credit-application
// form Colcab's Syspro quotes always carry, reproduced as fixed content —
// same on every quote, not tied to survey data. Always starts on a fresh
// page after the pricing content.
function addTermsPages(
  doc: jsPDF,
  opts: {
    pageHeight: number
    contentWidth: number
    footerReserve: number
    rep: SalesRep | null
    drawLetterhead: () => void
    getY: () => number
    setY: (v: number) => void
  },
) {
  const { pageHeight, contentWidth, footerReserve, rep, drawLetterhead, setY } = opts
  drawLetterhead()
  let y = opts.getY()

  function ensureRoom(height: number) {
    if (y + height > pageHeight - footerReserve) {
      drawLetterhead()
      y = opts.getY()
    }
  }

  function heading(text: string) {
    ensureRoom(7)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(text, MARGIN, y)
    y += 5
    doc.setFont('helvetica', 'normal')
  }

  function paragraph(text: string, opts2: { italic?: boolean; gap?: number } = {}) {
    doc.setFontSize(8.5)
    doc.setFont('helvetica', opts2.italic ? 'italic' : 'normal')
    const lines = doc.splitTextToSize(text, contentWidth)
    ensureRoom(lines.length * LINE_HEIGHT)
    doc.text(lines, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    y += lines.length * LINE_HEIGHT + (opts2.gap ?? 3)
  }

  heading('E & O E')

  heading('DELIVERY:')
  paragraph('1. Prices quoted do not include transport unless otherwise stated above.')
  paragraph('2. Production lead times are subject to variation and are merely an estimate.', { gap: 5 })

  heading('EXCLUSIONS:')
  paragraph(
    "Our price does not make provision for any refrigeration units (except in the case of self-contained units), fittings, installations, plumbing, builders' works and all other items not mentioned specifically in the quotation above.",
    { gap: 5 },
  )

  heading('PAYMENT TERMS:')
  paragraph('Conditions of payment are strictly:')
  paragraph(
    '1. Non-account Holders — 50% deposit upfront. (Production of manufactured items will only commence on receipt of payment.) Depending on a credit check/rating the following terms apply to Non or New Account Holders.',
  )
  paragraph('2. Approved Account Holders — Full amount within 30 days of date of invoice.', { gap: 5 })

  heading('BANK DETAILS:')
  paragraph('FNB — Corporate')
  paragraph('Branch No. 255005')
  paragraph('Account no. 6251 8444 782', { gap: 5 })

  heading('SUPPLY OF GOODS:')
  paragraph('Production will not begin until:')
  paragraph(
    '1. The quotation has been accepted, signed by a duly authorized signatory and an order has been filled in. The quotation is then to be emailed back to us on saleshub@colcabct.co.za and payment received in full (for non-account holders).',
  )
  paragraph('Please note:')
  paragraph(
    '2. Any changes to the accepted quote must be confirmed in writing. If no such confirmation is in place, Colcab accepts no responsibility for requested changes not being made.',
  )
  paragraph(
    '3. Any lead time given is from the placing of the order in writing and providing that all specifications have been finalised. Delays in providing complete specs may result in a delay in the completion of the order.',
  )
  paragraph(
    '4. The Supplier reserves the right to amend, withdraw or cancel this quotation without liability, should geopolitical events materially and adversely affect exchange rates, commodity prices or the cost of supply otherwise.',
  )
  paragraph('Please note that goods supplied by Colcab remain the property of Colcab (Pty) Ltd until paid for in full.')
  paragraph('Returns will be charged a 10% handling fee based on the invoice value.')
  paragraph(
    'A binding agreement of sale of goods between Colcab and yourself shall come into existence as soon as you counter-sign this document.',
    { gap: 5 },
  )

  heading('Terms and Conditions:')
  paragraph(
    "1. Your contractual relationship and the supply of goods by the Company to you is governed by the Company's Standard Terms and Conditions, the current version of which may be accessed on the Company's website.",
  )
  paragraph(
    '2. The Standard Terms and Conditions are incorporated into this document by reference. By your signature to this document, you acknowledge that you are aware of the Standard Terms and Conditions, have noted the contents thereof and accept that your continued interactions with the Company are governed by and subject to the Standard Terms and Conditions.',
    { gap: 5 },
  )

  heading('POPI Act:')
  paragraph(
    "1. In the process of your interactions with Colcab (Pty) Ltd, the Company may be collecting certain of your 'personal information' as such term is defined in the Protection of Personal Information Act, 4 of 2013.",
  )
  paragraph(
    '2. The manner in which the Company deals with your personal information is governed by our Privacy Policy, the current version of which may be accessed on our website.',
  )
  paragraph(
    '3. The Privacy Policy is incorporated into this document by reference. By continuing to interact with the Company, you acknowledge that you are aware of the Privacy Policy, have noted the contents thereof and accept that your continued interactions with Colcab (Pty) Ltd, in so far as they involve or are related to your personal information and the right to privacy, are governed by the Privacy Policy.',
    { gap: 5 },
  )

  paragraph(
    'Should you require any further information please do not hesitate to contact us. We assure you of our best intentions at all times.',
  )
  paragraph('Yours sincerely')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  ensureRoom(6)
  doc.text(rep?.name ?? '', MARGIN, y)
  doc.setFont('helvetica', 'normal')
  y += 10

  // Closing signature block, on behalf of Colcab — the one spot the sales
  // rep's own phone/email (captured under Admin) populate; the top
  // letterhead's Tel/Email stays the customer's own contact.
  heading('Internal Sales Administrator')
  paragraph('For and on behalf of Colcab (Pty) Ltd Sales department.', { gap: 1 })
  doc.setFontSize(8.5)
  ensureRoom(9)
  doc.text('Telephone number:', MARGIN, y)
  doc.text(rep?.phone ?? '', MARGIN + 35, y)
  y += 4.5
  doc.text('email:', MARGIN, y)
  doc.text(rep?.email ?? '', MARGIN + 35, y)
  y += 10

  // Credit application form — a fixed intake form, unrelated to survey
  // data, reproduced with simplified (not pixel-identical) table styling.
  drawLetterhead()
  y = opts.getY()
  setY(y)

  function formRow(cells: string[], widths: number[], height = 7) {
    if (y + height > pageHeight - footerReserve) {
      drawLetterhead()
      y = opts.getY()
    }
    let cx = MARGIN
    doc.setDrawColor(150)
    doc.setFontSize(7.5)
    for (let i = 0; i < cells.length; i++) {
      doc.rect(cx, y, widths[i], height)
      const lines = doc.splitTextToSize(cells[i], widths[i] - 3)
      doc.text(lines[0] ?? '', cx + 2, y + height / 2 + 1.2)
      cx += widths[i]
    }
    doc.setDrawColor(0)
    y += height
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  ensureRoom(6)
  doc.text('Entity Information (Applicant)', MARGIN, y)
  y += 5
  doc.setFont('helvetica', 'normal')

  const fullW = contentWidth
  formRow(['Entity Name (full legal name)', ''], [60, fullW - 60])
  formRow(['Registration Number', ''], [60, fullW - 60])
  formRow(['VAT Number', ''], [60, fullW - 60])
  formRow(['Registered Address', ''], [60, fullW - 60])
  formRow(['Principal place of business', ''], [60, fullW - 60])
  formRow(['Telephone Number (incl area code)', ''], [60, fullW - 60])
  formRow(['Contact Person', ''], [60, fullW - 60])
  formRow(['E-Mail Address (general office)', ''], [60, fullW - 60])
  formRow(
    ['Does the Credit Applicant trade under any other name/s?', 'Yes', 'No'],
    [fullW - 60, 30, 30],
  )
  formRow(['Trading Name', 'Address', 'Nature of Business'], [fullW / 3, fullW / 3, fullW / 3])
  formRow(['', '', ''], [fullW / 3, fullW / 3, fullW / 3])

  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  ensureRoom(6)
  doc.text('Accounts / Finance Information', MARGIN, y)
  y += 5
  doc.setFont('helvetica', 'normal')

  const accW = [fullW * 0.4, fullW * 0.2, fullW * 0.2, fullW * 0.2]
  formRow(['Contact Person', 'Position', 'Telephone', 'Email Address'], accW)
  formRow(['', '', '', ''], accW)
  formRow(['', '', '', ''], accW)
  formRow(['', '', '', ''], accW)
  formRow(['General Finance Email Address', ''], [60, fullW - 60])

  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  ensureRoom(6)
  doc.text('Financial Information', MARGIN, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  paragraph('Please attach a certified copy of the following documents:', { gap: 1 })
  paragraph('1. Certificate of Incorporation', { gap: 1 })
  paragraph('2. Tax Clearance Certificate, VAT Certificate', { gap: 4 })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  ensureRoom(6)
  doc.text('Internal Use Only', MARGIN, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  const internalW = fullW / 3
  formRow(['Account Number:', 'Payment Terms:', 'Date:'], [internalW, internalW, internalW])
  formRow(['Credit Check:', 'Credit Limit:', 'Credit Controller:'], [internalW, internalW, internalW])

  setY(y)
}

// x-position, width (mm) for each column of the energy report table —
// cumulative widths sum to 182mm, spanning the full usable width of A4
// (210mm page - 14mm margins each side). Category/Product/Qty are plain
// columns; the four numeric columns sit under two grouped headers (Energy /
// Cost), each with its own Monthly/Annual sub-label drawn as a second
// header row.
const ENERGY_COLUMNS = [
  { label: 'Category', x: 14, width: 22, align: 'left' as const },
  { label: 'Product', x: 36, width: 38, align: 'left' as const },
  { label: 'Qty', x: 74, width: 14, align: 'right' as const },
  { label: 'Monthly', x: 88, width: 25, align: 'right' as const },
  { label: 'Annual', x: 113, width: 25, align: 'right' as const },
  { label: 'Monthly', x: 138, width: 27, align: 'right' as const },
  { label: 'Annual', x: 165, width: 31, align: 'right' as const },
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
  plugInFreezerSettings: PlugInFreezerSettings
  settings: AppSettings
  rep: SalesRep | null
}

export async function generatePlugInEnergyReport(ctx: PlugInEnergyReportContext) {
  const { report, items, categories, plugInFreezerTypes, plugInFreezerSettings, settings, rep } = ctx

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
  doc.text(`Electricity rate: ${formatRandRate(report.electricity_rate)} / kWh`, MARGIN, y)
  y += 10

  function drawEnergyTableHeader() {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Category', ENERGY_COLUMNS[0].x, y)
    doc.text('Product', ENERGY_COLUMNS[1].x, y)
    doc.text('Qty', ENERGY_COLUMNS[2].x + ENERGY_COLUMNS[2].width, y, { align: 'right' })
    const energyStart = ENERGY_COLUMNS[3].x
    const energyEnd = ENERGY_COLUMNS[4].x + ENERGY_COLUMNS[4].width
    doc.text('Energy (kWh)', (energyStart + energyEnd) / 2, y, { align: 'center' })
    const costStart = ENERGY_COLUMNS[5].x
    const costEnd = ENERGY_COLUMNS[6].x + ENERGY_COLUMNS[6].width
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

  let totalMonthlyKwh = 0
  let totalAnnualKwh = 0
  let totalMonthlyCost = 0
  let totalAnnualCost = 0
  let totalLengthM = 0
  let itemCount = 0

  for (const item of items) {
    const category = categories.find((c) => c.id === item.category_id)
    const plugInType = plugInFreezerTypes.find((p) => p.id === item.plugin_freezer_type_id)
    if (!plugInType) continue
    itemCount++

    const consumption = calculatePlugInEnergyConsumption(plugInType, item.qty, report.electricity_rate)
    totalMonthlyKwh += consumption.monthlyKwh
    totalAnnualKwh += consumption.annualKwh
    totalMonthlyCost += consumption.monthlyCost
    totalAnnualCost += consumption.annualCost
    const lengthM = calculatePlugInLengthM(
      plugInType,
      item.qty,
      item.is_auto_end,
      plugInFreezerSettings.end_case_length_allowance_m,
    )
    totalLengthM += lengthM

    const cellValues = [
      category?.name ?? '—',
      plugInType.name + (item.is_auto_end ? ' (auto end)' : ''),
      item.qty.toString(),
      formatNumber(consumption.monthlyKwh),
      formatNumber(consumption.annualKwh),
      formatRand(consumption.monthlyCost),
      formatRand(consumption.annualCost),
    ]

    const wrappedCells = cellValues.map((value, i) =>
      doc.splitTextToSize(value, ENERGY_COLUMNS[i].width - COLUMN_PADDING),
    )
    const noteParts = [`Length ${lengthM.toFixed(2)}m`, item.notes ? `Note: ${item.notes}` : '']
      .filter(Boolean)
      .join('  —  ')
    const noteLines = doc.splitTextToSize(noteParts, contentWidth)
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
    drawColumnDividers(doc, ENERGY_COLUMNS, y - LINE_HEIGHT + 1, y + (rowLines - 1) * LINE_HEIGHT + 1)
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
    formatNumber(totalMonthlyKwh),
    formatNumber(totalAnnualKwh),
    formatRand(totalMonthlyCost),
    formatRand(totalAnnualCost),
  ]
  totalValues.forEach((value, i) => {
    const col = ENERGY_COLUMNS[i + 3]
    doc.text(value, col.x + col.width, y, { align: 'right' })
  })
  doc.setFont('helvetica', 'normal')
  y += 6
  doc.setFontSize(8)
  doc.setTextColor(100)
  doc.text(`Overall length: ${totalLengthM.toFixed(2)}m`, ENERGY_COLUMNS[0].x, y)
  doc.setTextColor(0)
  y += 8

  if (itemCount > 0) {
    // Two columns for the whole proposed lineup (every product line
    // combined, spine and end units alike): Monthly, Annual — the table
    // above already gives the per-product detail, so this is a single
    // at-a-glance progression rather than a per-product breakdown.
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

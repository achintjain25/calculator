import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Bill, BillItem } from '../api/types'

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number }
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function inr(n: number): string {
  if (isNaN(n) || n == null) return '₹0.00'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

function safe(v: unknown): number {
  const n = parseFloat(String(v ?? 0))
  return isNaN(n) ? 0 : n
}

function numFmt(v: unknown, dec = 3): string {
  const n = safe(v)
  if (n === 0) return '—'
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  }).format(n)
}

function dateDisplay(d: string): string {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric',
    })
  } catch {
    return d
  }
}

function safeText(v: unknown): string {
  if (v == null || v === undefined) return ''
  return String(v)
}

// ── color setters (explicit args — avoids spread issues in jsPDF v2) ──────────

function setFill(doc: jsPDF, r: number, g: number, b: number) {
  doc.setFillColor(r, g, b)
}
function setDraw(doc: jsPDF, r: number, g: number, b: number) {
  doc.setDrawColor(r, g, b)
}
function setTxt(doc: jsPDF, r: number, g: number, b: number) {
  doc.setTextColor(r, g, b)
}

// ── colour constants ──────────────────────────────────────────────────────────
const G_R = 212, G_G = 175, G_B = 55   // gold
const D_R = 30,  D_G = 30,  D_B = 30   // dark
const X_R = 100, X_G = 100, X_B = 100  // gray
const L_R = 248, L_G = 246, L_B = 240  // light cream

// ── main export ───────────────────────────────────────────────────────────────

export function generateBillPDF(bill: Bill & { items: BillItem[] }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const W   = doc.internal.pageSize.width
  const H   = doc.internal.pageSize.height

  const items = Array.isArray(bill.items) ? bill.items : []

  // ── Gold header ─────────────────────────────────────────────────────────────
  setFill(doc, G_R, G_G, G_B)
  doc.rect(0, 0, W, 28, 'F')

  // Logo circle
  setFill(doc, D_R, D_G, D_B)
  doc.circle(20, 14, 10, 'F')
  setTxt(doc, G_R, G_G, G_B)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('RJ', 20, 15.5, { align: 'center' })

  // Shop name
  setTxt(doc, 0, 0, 0)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('RJ Jewellers', 35, 12)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Gold & Silver Jewellery', 35, 18)
  doc.text('Fine Jewellery Since Inception', 35, 23)

  // Right: PURCHASE RECEIPT + bill number + date
  setTxt(doc, D_R, D_G, D_B)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('PURCHASE RECEIPT', W - 14, 12, { align: 'right' })
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(safeText(bill.bill_number), W - 14, 19, { align: 'right' })
  doc.text('Date: ' + dateDisplay(safeText(bill.bill_date)), W - 14, 25, { align: 'right' })

  // ── Customer section ────────────────────────────────────────────────────────
  let y = 36

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  setTxt(doc, X_R, X_G, X_B)
  doc.text('BILL TO', 14, y)
  y += 5

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  setTxt(doc, D_R, D_G, D_B)
  doc.text(safeText(bill.customer_name) || 'Customer', 14, y)
  y += 5

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  setTxt(doc, X_R, X_G, X_B)

  if (bill.customer_phone) {
    doc.text('Phone: ' + safeText(bill.customer_phone), 14, y)
    y += 4.5
  }
  if (bill.customer_address) {
    const lines = doc.splitTextToSize(safeText(bill.customer_address), 85) as string[]
    lines.forEach((line: string) => { doc.text(line, 14, y); y += 4.5 })
  }

  // ── Bill info box (right side) ──────────────────────────────────────────────
  setFill(doc, L_R, L_G, L_B)
  doc.roundedRect(W - 78, 33, 63, 30, 2, 2, 'F')
  setDraw(doc, G_R, G_G, G_B)
  doc.setLineWidth(0.4)
  doc.roundedRect(W - 78, 33, 63, 30, 2, 2, 'S')

  const infoRows: [string, string][] = [
    ['Bill No.',  safeText(bill.bill_number)],
    ['Date',      dateDisplay(safeText(bill.bill_date))],
    ['Payment',   safeText(bill.payment_method) || 'Cash'],
    ['Status',    (safeText(bill.status) || 'paid').toUpperCase()],
  ]
  let iy = 40
  infoRows.forEach(([label, val]) => {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    setTxt(doc, X_R, X_G, X_B)
    doc.text(label, W - 75, iy)
    doc.setFont('helvetica', 'normal')
    setTxt(doc, D_R, D_G, D_B)
    doc.text(val, W - 17, iy, { align: 'right' })
    iy += 5.5
  })

  // ── Divider ─────────────────────────────────────────────────────────────────
  y = Math.max(y, 68)
  setDraw(doc, G_R, G_G, G_B)
  doc.setLineWidth(0.5)
  doc.line(14, y, W - 14, y)
  y += 5

  // ── Items table ─────────────────────────────────────────────────────────────
  const tableRows = items.map((item, i) => {
    const w  = safe(item.weight_grams)
    const p  = safe(item.purity_percent)
    const r  = safe(item.rate_per_gram)
    const mc = safe(item.making_charges)
    const lt = safe(item.line_total)
    return [
      String(i + 1),
      safeText(item.description) || '—',
      safeText(item.metal_type)  || 'Gold',
      w  > 0 ? numFmt(w, 3) + 'g' : '—',
      p  > 0 ? numFmt(p, 2) + '%' : '—',
      r  > 0 ? inr(r)             : '—',
      mc > 0 ? inr(mc)            : '—',
      inr(lt),
    ]
  })

  autoTable(doc, {
    startY: y,
    head:   [['#', 'Description', 'Metal', 'Weight', 'Purity', 'Rate/g', 'Making', 'Amount']],
    body:   tableRows,
    headStyles: {
      fillColor: [G_R, G_G, G_B],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize:  8,
      halign:    'center',
    },
    bodyStyles:         { fontSize: 8.5, textColor: [D_R, D_G, D_B] },
    alternateRowStyles: { fillColor: [L_R, L_G, L_B] },
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center' },
      1: { cellWidth: 50 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 16, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  })

  let fy = doc.lastAutoTable.finalY + 8

  // ── Totals ──────────────────────────────────────────────────────────────────
  const subtotal = safe(bill.subtotal)
  const discount = safe(bill.discount)
  const total    = safe(bill.total_amount)
  const paid     = safe(bill.amount_paid)
  const balance  = safe(bill.balance_due)

  const tX = W - 72   // label x
  const vX = W - 14   // value x (right-align)

  function addRow(label: string, value: string, bold = false, highlight = false) {
    if (highlight) {
      setFill(doc, G_R, G_G, G_B)
      doc.rect(tX - 4, fy - 4.5, W - tX + 4 - 12, 8, 'F')
      setTxt(doc, 0, 0, 0)
    } else {
      setTxt(doc, X_R, X_G, X_B)
    }
    doc.setFontSize(bold ? 9.5 : 8.5)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, tX, fy)
    setTxt(doc, highlight ? 0 : D_R, highlight ? 0 : D_G, highlight ? 0 : D_B)
    doc.setFont('helvetica', 'bold')
    doc.text(value, vX, fy, { align: 'right' })
    fy += 7
  }

  addRow('Subtotal',     inr(subtotal))
  if (discount > 0)
    addRow('Discount',   '- ' + inr(discount))
  addRow('Total Amount', inr(total), true, true)
  fy += 2
  addRow('Amount Paid',  inr(paid))
  if (balance > 0)
    addRow('Balance Due', inr(balance), true)

  // ── Notes ───────────────────────────────────────────────────────────────────
  if (bill.notes && safeText(bill.notes).trim()) {
    fy += 5
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    setTxt(doc, X_R, X_G, X_B)
    doc.text('NOTES', 14, fy)
    fy += 4
    doc.setFont('helvetica', 'normal')
    setTxt(doc, D_R, D_G, D_B)
    const noteLines = doc.splitTextToSize(safeText(bill.notes), W - 28) as string[]
    noteLines.forEach((l: string) => { doc.text(l, 14, fy); fy += 4.5 })
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  setFill(doc, G_R, G_G, G_B)
  doc.rect(0, H - 14, W, 14, 'F')
  setTxt(doc, 0, 0, 0)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Thank you for your purchase!', W / 2, H - 7.5, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text(
    safeText(bill.bill_number) + '  ·  Generated: ' +
    new Date().toLocaleString('en-IN') + '  ·  RJ Jewellers',
    W / 2, H - 3, { align: 'center' }
  )

  doc.save('Bill_' + safeText(bill.bill_number) + '.pdf')
}

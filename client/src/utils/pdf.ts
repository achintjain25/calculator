import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatINR, formatNumber } from './format'

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number }
  }
}

interface GoldReceiptData {
  shopName:       string
  metalType:      string
  rate:           number
  weight:         number
  purity:         number
  estimatedValue: number
  date:           string
}

interface InterestReceiptData {
  shopName:     string
  principal:    number
  rate:         number
  startDate:    string
  endDate:      string
  totalDays:    number
  totalMonths:  number
  interest:     number
  totalPayable: number
  date:         string
}

function addHeader(doc: jsPDF, shopName: string, title: string) {
  doc.setFillColor(212, 175, 55)
  doc.rect(0, 0, 210, 12, 'F')
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(shopName, 105, 8, { align: 'center' })

  doc.setFillColor(30, 30, 30)
  doc.rect(0, 12, 210, 10, 'F')
  doc.setTextColor(212, 175, 55)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Gold & Silver Jewellery Loan Calculator', 105, 19, { align: 'center' })

  doc.setTextColor(30, 30, 30)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 105, 34, { align: 'center' })

  doc.setDrawColor(212, 175, 55)
  doc.setLineWidth(0.8)
  doc.line(14, 37, 196, 37)
}

function addFooter(doc: jsPDF, dateStr: string) {
  const pageHeight = doc.internal.pageSize.height
  doc.setFillColor(212, 175, 55)
  doc.rect(0, pageHeight - 10, 210, 10, 'F')
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `Generated on: ${dateStr}  |  This is a computer-generated receipt.`,
    105, pageHeight - 3.5, { align: 'center' }
  )
}

export function generateGoldPDF(data: GoldReceiptData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  addHeader(doc, data.shopName, 'Gold / Silver Valuation Receipt')

  autoTable(doc, {
    startY: 42,
    head:   [['Parameter', 'Value']],
    body:   [
      ['Metal Type',   data.metalType],
      ['Current Rate', `${formatINR(data.rate)} per gram`],
      ['Weight',       `${formatNumber(data.weight, 3)} grams`],
      ['Purity',       `${formatNumber(data.purity, 2)}%`],
    ],
    headStyles:         { fillColor: [212, 175, 55], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 10 },
    bodyStyles:         { fontSize: 10, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [248, 246, 240] },
    columnStyles:       { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { cellWidth: 'auto' } },
    margin:             { left: 14, right: 14 },
  })

  const finalY = doc.lastAutoTable.finalY + 6
  doc.setFillColor(212, 175, 55)
  doc.roundedRect(14, finalY, 182, 20, 3, 3, 'F')
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Estimated Value:', 20, finalY + 8)
  doc.setFontSize(15)
  doc.text(formatINR(data.estimatedValue), 196, finalY + 8, { align: 'right' })
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(60, 60, 60)
  doc.text(
    `Formula: ${formatINR(data.rate)} × ${data.weight}g × (${data.purity}% ÷ 100)`,
    14, finalY + 16
  )

  addFooter(doc, data.date)
  doc.save('Gold_Silver_Valuation_Receipt.pdf')
}

export function generateInterestPDF(data: InterestReceiptData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  addHeader(doc, data.shopName, 'Jewellery Loan Interest Receipt')

  autoTable(doc, {
    startY: 42,
    head:   [['Parameter', 'Value']],
    body:   [
      ['Principal Amount',            formatINR(data.principal)],
      ['Interest Rate',               `₹${data.rate} per ₹100 per month`],
      ['Loan Start Date',             data.startDate],
      ['Loan End Date',               data.endDate],
      ['Total Days',                  `${data.totalDays} days`],
      ['Total Months (30-day basis)', `${formatNumber(data.totalMonths, 4)} months`],
    ],
    headStyles:         { fillColor: [212, 175, 55], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 10 },
    bodyStyles:         { fontSize: 10, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [248, 246, 240] },
    columnStyles:       { 0: { fontStyle: 'bold', cellWidth: 90 }, 1: { cellWidth: 'auto' } },
    margin:             { left: 14, right: 14 },
  })

  const finalY = doc.lastAutoTable.finalY + 6

  autoTable(doc, {
    startY: finalY,
    head:   [['Summary', 'Amount']],
    body:   [
      ['Principal',     formatINR(data.principal)],
      ['Interest',      formatINR(data.interest)],
      ['Total Payable', formatINR(data.totalPayable)],
    ],
    headStyles:   { fillColor: [30, 30, 30], textColor: [212, 175, 55], fontStyle: 'bold', fontSize: 10 },
    bodyStyles:   { fontSize: 11, textColor: [30, 30, 30] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 1: { fontStyle: 'bold', cellWidth: 'auto' } },
    didParseCell: (hookData) => {
      if (hookData.row.index === 2) {
        hookData.cell.styles.fillColor  = [212, 175, 55]
        hookData.cell.styles.textColor  = [0, 0, 0]
        hookData.cell.styles.fontStyle  = 'bold'
        hookData.cell.styles.fontSize   = 13
      }
    },
    margin: { left: 14, right: 14 },
  })

  addFooter(doc, data.date)
  doc.save('Jewellery_Loan_Interest_Receipt.pdf')
}

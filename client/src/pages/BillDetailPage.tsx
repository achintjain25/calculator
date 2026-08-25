import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { billsApi } from '../api/bills'
import type { Bill, BillItem } from '../api/types'
import { formatINR, formatDateDisplay } from '../utils/format'
import { generateBillPDF } from '../utils/billPdf'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid:    'bg-emerald-900/40 text-emerald-400 border-emerald-500/30',
    partial: 'bg-yellow-900/40  text-yellow-400  border-yellow-500/30',
    unpaid:  'bg-red-900/40     text-red-400     border-red-500/30',
  }
  return (
    <span className={`px-3 py-1 rounded-full text-sm border font-medium ${map[status] ?? map.unpaid}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export default function BillDetailPage() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const [bill,     setBill]     = useState<(Bill & { items: BillItem[] }) | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    billsApi.getById(id)
      .then(b  => setBill(b))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gold-400 animate-pulse text-sm">
      Loading bill…
    </div>
  )
  if (error || !bill) return (
    <div className="m-6 p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
      {error || 'Bill not found'}
    </div>
  )

  const subtotal = parseFloat(bill.subtotal)
  const discount = parseFloat(bill.discount)
  const total    = parseFloat(bill.total_amount)
  const paid     = parseFloat(bill.amount_paid)
  const balance  = parseFloat(bill.balance_due)

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigate('/bills')} className="hover:text-gold-400 transition-colors">
          Bills
        </button>
        <span>/</span>
        <span className="text-white font-mono">{bill.bill_number}</span>
      </div>

      {/* Header actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white font-mono">{bill.bill_number}</h2>
          <StatusBadge status={bill.status}/>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => generateBillPDF(bill)}
            className="btn-gold text-sm py-2 px-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            Download PDF
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete bill ${bill.bill_number}?`))
                billsApi.delete(bill.id, true).then(() => navigate('/bills'))
            }}
            className="btn-ghost text-sm py-2 px-4 hover:border-red-500 hover:text-red-400"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Bill card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {/* Gold header */}
        <div className="h-2 bg-gradient-to-r from-gold-600 via-gold-400 to-gold-600"/>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Customer */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-widest">Bill To</p>
            <p className="text-white font-bold text-lg">{bill.customer_name}</p>
            {bill.customer_phone   && <p className="text-gray-400 text-sm">{bill.customer_phone}</p>}
            {bill.customer_address && <p className="text-gray-400 text-sm">{bill.customer_address}</p>}
          </div>
          {/* Bill meta */}
          <div className="space-y-2 sm:text-right">
            <p className="text-xs text-gray-500 uppercase tracking-widest">Bill Details</p>
            <div className="space-y-1 text-sm">
              <div className="flex sm:justify-end gap-8">
                <span className="text-gray-500">Date</span>
                <span className="text-white">{formatDateDisplay(bill.bill_date)}</span>
              </div>
              <div className="flex sm:justify-end gap-8">
                <span className="text-gray-500">Payment</span>
                <span className="text-white">{bill.payment_method}</span>
              </div>
              <div className="flex sm:justify-end gap-8">
                <span className="text-gray-500">Created</span>
                <span className="text-gray-400 text-xs">{formatDateDisplay(bill.created_at)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="border-t border-gray-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase bg-gray-800/40">
                <th className="text-left px-5 py-3">#</th>
                <th className="text-left px-4 py-3">Description</th>
                <th className="text-center px-4 py-3 hidden sm:table-cell">Metal</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">Weight</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">Purity</th>
                <th className="text-right px-4 py-3 hidden lg:table-cell">Rate/g</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Making</th>
                <th className="text-right px-5 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {bill.items.map((item, i) => (
                <tr key={item.id || i} className="border-t border-gray-800/40 hover:bg-gray-800/20">
                  <td className="px-5 py-3 text-gray-500 text-xs">{i + 1}</td>
                  <td className="px-4 py-3 text-white font-medium">{item.description}</td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                      {item.metal_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums hidden md:table-cell">
                    {item.weight_grams ? `${item.weight_grams}g` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums hidden md:table-cell">
                    {item.purity_percent ? `${item.purity_percent}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums hidden lg:table-cell">
                    {item.rate_per_gram ? formatINR(item.rate_per_gram) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums hidden sm:table-cell">
                    {item.making_charges ? formatINR(item.making_charges) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right text-gold-400 font-bold tabular-nums">
                    {formatINR(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals footer */}
        <div className="border-t border-gray-800 p-6">
          <div className="ml-auto max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Subtotal</span>
              <span className="text-white tabular-nums">{formatINR(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Discount</span>
                <span className="text-red-400 tabular-nums">− {formatINR(discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base bg-gold-500/10 border border-gold-500/30 rounded-lg px-3 py-2">
              <span className="text-gold-300">Total</span>
              <span className="text-gold-300 tabular-nums">{formatINR(total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Amount Paid</span>
              <span className="text-emerald-400 tabular-nums">{formatINR(paid)}</span>
            </div>
            {balance > 0 && (
              <div className="flex justify-between font-semibold">
                <span className="text-red-400">Balance Due</span>
                <span className="text-red-400 tabular-nums">{formatINR(balance)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {bill.notes && (
          <div className="border-t border-gray-800 px-6 py-4">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Notes</p>
            <p className="text-gray-300 text-sm">{bill.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

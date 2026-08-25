import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { billsApi } from '../api/bills'
import type { Bill } from '../api/types'
import { formatINR, formatDateDisplay } from '../utils/format'
import { generateBillPDF } from '../utils/billPdf'

function statusBadge(status: string) {
  const map: Record<string, string> = {
    paid:    'bg-emerald-900/40 text-emerald-400 border-emerald-500/30',
    partial: 'bg-yellow-900/40  text-yellow-400  border-yellow-500/30',
    unpaid:  'bg-red-900/40     text-red-400     border-red-500/30',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border font-medium ${map[status] ?? map.unpaid}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export default function BillsListPage() {
  const navigate   = useNavigate()
  const [bills,    setBills]    = useState<Bill[]>([])
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [reprinting, setReprinting] = useState<string | null>(null)

  // Debounced copy of `search`, so typing does not fire a request per keystroke
  // and a slow earlier response cannot overwrite a newer one.
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const load = useCallback(() => {
    setLoading(true)
    setError('')

    let cancelled = false

    billsApi.getAll(debouncedSearch || undefined)
      .then(r => { if (!cancelled) setBills(r.data) })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [debouncedSearch])

  useEffect(() => load(), [load])

  const handleDelete = async (id: string, billNo: string) => {
    if (!confirm(`Delete bill ${billNo}? This cannot be undone.`)) return
    setDeleting(id)
    try {
      await billsApi.delete(id, true)
      setBills(prev => prev.filter(b => b.id !== id))
    } catch (e: unknown) {
      alert((e as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  const handleReprint = async (id: string) => {
    setReprinting(id)
    try {
      const bill = await billsApi.getById(id)
      generateBillPDF(bill)
    } catch (e: unknown) {
      alert((e as Error).message)
    } finally {
      setReprinting(null)
    }
  }

  const totalRevenue = bills.reduce((s, b) => s + parseFloat(b.amount_paid || '0'), 0)
  const totalPending = bills.reduce((s, b) => s + parseFloat(b.balance_due || '0'), 0)

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white"
              style={{ fontFamily: "'Playfair Display', serif" }}>
            Bills
          </h2>
          <p className="text-gray-400 text-sm mt-0.5">
            Purchase receipts for customers
          </p>
        </div>
        <button
          onClick={() => navigate('/bills/new')}
          className="btn-gold text-sm py-2 px-4 self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Create Bill
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-widest">Total Bills</p>
          <p className="text-2xl font-bold text-white mt-1">{bills.length}</p>
        </div>
        <div className="bg-gray-900 border border-gold-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-widest">Revenue Collected</p>
          <p className="text-lg font-bold text-emerald-400 mt-1 tabular-nums">{formatINR(totalRevenue)}</p>
        </div>
        <div className="bg-gray-900 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-widest">Pending Balance</p>
          <p className="text-lg font-bold text-red-400 mt-1 tabular-nums">{formatINR(totalPending)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-widest">Paid Bills</p>
          <p className="text-2xl font-bold text-white mt-1">
            {bills.filter(b => b.status === 'paid').length}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input
          type="text"
          className="input-field pl-10"
          placeholder="Search by bill number, customer name or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b border-gray-800 bg-gray-900/80">
                <th className="text-left px-5 py-3">Bill No.</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Date</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">Items</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Total</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">Paid</th>
                <th className="text-right px-4 py-3 hidden lg:table-cell">Balance</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Status</th>
                <th className="px-4 py-3"/>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-500 animate-pulse text-sm">
                    Loading bills…
                  </td>
                </tr>
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12">
                    <p className="text-gray-400 text-sm">No bills found</p>
                    <button
                      onClick={() => navigate('/bills/new')}
                      className="mt-3 btn-gold text-sm py-2 px-4 inline-flex"
                    >
                      Create First Bill
                    </button>
                  </td>
                </tr>
              ) : bills.map(bill => (
                <tr key={bill.id}
                  className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3">
                    <button
                      onClick={() => navigate(`/bills/${bill.id}`)}
                      className="text-gold-400 font-semibold hover:text-gold-300 transition-colors font-mono text-xs"
                    >
                      {bill.bill_number}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">
                    {formatDateDisplay(bill.bill_date)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{bill.customer_name}</p>
                    {bill.customer_phone &&
                      <p className="text-gray-500 text-xs">{bill.customer_phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 hidden md:table-cell">
                    {bill.item_count ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gold-400 font-medium tabular-nums hidden sm:table-cell">
                    {formatINR(parseFloat(bill.total_amount))}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-400 tabular-nums hidden md:table-cell">
                    {formatINR(parseFloat(bill.amount_paid))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
                    <span className={parseFloat(bill.balance_due) > 0 ? 'text-red-400' : 'text-gray-600'}>
                      {formatINR(parseFloat(bill.balance_due))}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">{statusBadge(bill.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {/* View */}
                      <button
                        onClick={() => navigate(`/bills/${bill.id}`)}
                        title="View bill"
                        className="p-1.5 text-gray-500 hover:text-gold-400 transition-colors rounded-lg hover:bg-gray-800"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                      </button>
                      {/* Reprint */}
                      <button
                        onClick={() => handleReprint(bill.id)}
                        disabled={reprinting === bill.id}
                        title="Download PDF"
                        className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors rounded-lg hover:bg-gray-800 disabled:opacity-40"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(bill.id, bill.bill_number)}
                        disabled={deleting === bill.id}
                        title="Delete bill"
                        className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded-lg hover:bg-gray-800 disabled:opacity-40"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

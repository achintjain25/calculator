import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardApi } from '../api/dashboard'
import { paymentsApi  } from '../api/payments'
import type { TopDue, Payment } from '../api/types'
import { formatINR, formatDateDisplay } from '../utils/format'

export default function PaymentsPage() {
  const navigate  = useNavigate()
  const [dues,    setDues]    = useState<TopDue[]>([])
  const [recent,  setRecent]  = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      dashboardApi.getTopDues(),
      paymentsApi.getRecent(50),
    ])
      .then(([d, p]) => { setDues(d); setRecent(p) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gold-400 animate-pulse text-sm">
      Loading payments…
    </div>
  )

  if (error) return (
    <div className="m-6 p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
      {error}
    </div>
  )

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-white"
            style={{ fontFamily: "'Playfair Display', serif" }}>
          Payments &amp; Dues
        </h2>
        <p className="text-gray-400 text-sm mt-0.5">
          Outstanding balances and full payment history
        </p>
      </div>

      {/* Outstanding dues */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Outstanding Dues</h3>
          <p className="text-xs text-gray-500 mt-0.5">All active loans with calculated interest to today</p>
        </div>
        <div className="overflow-x-auto">
          {dues.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-10">No outstanding dues</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
                  <th className="text-left px-5 py-3">Customer</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">Principal</th>
                  <th className="text-right px-4 py-3 hidden md:table-cell">Days</th>
                  <th className="text-right px-4 py-3 hidden md:table-cell">Interest</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">Paid</th>
                  <th className="text-right px-4 py-3">Outstanding</th>
                  <th className="px-4 py-3"/>
                </tr>
              </thead>
              <tbody>
                {dues.map(d => (
                  <tr
                    key={d.loan_id}
                    className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <button
                        onClick={() => navigate(`/customers/${d.id}`)}
                        className="text-white font-medium hover:text-gold-400 transition-colors text-left"
                      >
                        {d.name}
                      </button>
                      <p className="text-gray-500 text-xs">{d.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-gold-400 tabular-nums hidden sm:table-cell">
                      {formatINR(parseFloat(d.principal))}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 tabular-nums hidden md:table-cell">
                      {d.days_elapsed}
                    </td>
                    <td className="px-4 py-3 text-right text-yellow-400 tabular-nums hidden md:table-cell">
                      {formatINR(parseFloat(d.interest_accrued))}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-400 tabular-nums hidden sm:table-cell">
                      {formatINR(parseFloat(d.total_paid))}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-400 tabular-nums">
                      {formatINR(parseFloat(d.outstanding))}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/customers/${d.id}`)}
                        className="text-xs text-gold-400 hover:text-gold-300 whitespace-nowrap"
                      >
                        Pay →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Payment history */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Payment History</h3>
          <p className="text-xs text-gray-500 mt-0.5">Last 50 payments across all customers</p>
        </div>
        <div className="overflow-x-auto">
          {recent.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-10">No payments recorded yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
                  <th className="text-left px-5 py-3">Customer</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Date</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Method</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Notes</th>
                  <th className="text-right px-5 py-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(p => (
                  <tr
                    key={p.id}
                    className="border-b border-gray-800/40 hover:bg-gray-800/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/customers/${p.customer_id}`)}
                  >
                    <td className="px-5 py-3">
                      <p className="text-white font-medium">{p.customer_name}</p>
                      <p className="text-gray-500 text-xs">{p.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">
                      {formatDateDisplay(p.payment_date)}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-300 border border-gray-700">
                        {p.payment_method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                      {p.notes || '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-emerald-400 font-semibold tabular-nums">
                      {formatINR(parseFloat(p.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

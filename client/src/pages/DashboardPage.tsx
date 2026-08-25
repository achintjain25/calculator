import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardApi } from '../api/dashboard'
import { paymentsApi  } from '../api/payments'
import type { DashboardStats, TopDue, Payment } from '../api/types'
import { formatINR, formatDateDisplay } from '../utils/format'

function StatCard({
  label, value, sub, color = 'gold', icon,
}: {
  label: string
  value: string
  sub?: string
  color?: 'gold' | 'green' | 'red' | 'blue'
  icon: React.ReactNode
}) {
  const border = {
    gold:  'border-gold-500/30',
    green: 'border-emerald-500/30',
    red:   'border-red-500/30',
    blue:  'border-blue-500/30',
  }[color]
  const text = {
    gold:  'text-gold-400',
    green: 'text-emerald-400',
    red:   'text-red-400',
    blue:  'text-blue-400',
  }[color]

  return (
    <div className={`bg-gray-900 border ${border} rounded-2xl p-5 flex items-start gap-4`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${text} bg-gray-800`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest">{label}</p>
        <p className={`text-xl font-bold mt-0.5 tabular-nums ${text}`}>{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [stats,    setStats]    = useState<DashboardStats | null>(null)
  const [topDues,  setTopDues]  = useState<TopDue[]>([])
  const [recent,   setRecent]   = useState<Payment[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      dashboardApi.getStats(),
      dashboardApi.getTopDues(),
      paymentsApi.getRecent(8),
    ])
      .then(([s, d, p]) => { setStats(s); setTopDues(d); setRecent(p) })
      .catch(e  => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gold-400 animate-pulse text-sm">
      Loading dashboard…
    </div>
  )

  if (error) return (
    <div className="m-6 p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
      {error} — Is the server running?
    </div>
  )

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white"
              style={{ fontFamily: "'Playfair Display', serif" }}>
            Dashboard
          </h2>
          <p className="text-gray-400 text-sm mt-0.5">Overview of your jewellery loan business</p>
        </div>
        <button
          onClick={() => navigate('/customers/new')}
          className="btn-gold text-sm py-2 px-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Add Customer
        </button>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard
            label="Customers" value={stats.total_customers} color="blue"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
          />
          <StatCard
            label="Active Loans" value={stats.active_loans} color="gold"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}
          />
          <StatCard
            label="Principal Outstanding"
            value={formatINR(parseFloat(stats.total_principal || '0'))}
            color="gold"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
          />
          <StatCard
            label="Total Collected"
            value={formatINR(parseFloat(stats.total_paid || '0'))}
            color="green"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
          />
          <StatCard
            label="Outstanding"
            value={formatINR(Math.max(0, parseFloat(stats.total_outstanding || '0')))}
            color="red"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
          />
          <StatCard
            label="Overdue"
            value={stats.overdue_count}
            color="red"
            sub="no payment in 90+ days"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
          />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Top Dues table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Top Outstanding Dues</h3>
            <button
              onClick={() => navigate('/payments')}
              className="text-xs text-gold-400 hover:text-gold-300"
            >
              View all →
            </button>
          </div>
          <div className="overflow-x-auto">
            {topDues.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">No active loans</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
                    <th className="text-left px-5 py-2.5">Customer</th>
                    <th className="text-right px-4 py-2.5">Outstanding</th>
                    <th className="text-right px-4 py-2.5 hidden sm:table-cell">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {topDues.map((d) => (
                    <tr
                      key={d.loan_id}
                      className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/customers/${d.id}`)}
                    >
                      <td className="px-5 py-3">
                        <p className="text-white font-medium">{d.name}</p>
                        <p className="text-gray-500 text-xs">{d.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-red-400 font-semibold tabular-nums">
                        {formatINR(parseFloat(d.outstanding))}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell tabular-nums">
                        {d.days_elapsed}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recent payments */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Recent Payments</h3>
            <button
              onClick={() => navigate('/payments')}
              className="text-xs text-gold-400 hover:text-gold-300"
            >
              View all →
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No payments recorded yet</p>
          ) : (
            <ul className="divide-y divide-gray-800/50">
              {recent.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-800/30 cursor-pointer"
                  onClick={() => navigate(`/customers/${p.customer_id}`)}
                >
                  <div>
                    <p className="text-white text-sm font-medium">{p.customer_name}</p>
                    <p className="text-gray-500 text-xs">
                      {formatDateDisplay(p.payment_date)} · {p.payment_method}
                    </p>
                  </div>
                  <p className="text-emerald-400 font-semibold tabular-nums text-sm">
                    {formatINR(parseFloat(p.amount))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { customersApi } from '../api/customers'
import type { CustomerSummary } from '../api/types'
import { formatINR, formatDateDisplay, todayISO, daysBetween } from '../utils/format'

function statusBadge(c: CustomerSummary) {
  if (!c.loan_start_date || !c.latest_principal) {
    return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-400">No Loan</span>
  }
  const days = daysBetween(c.loan_start_date, todayISO())
  if (days > 90) {
    return <span className="px-2 py-0.5 rounded-full text-xs bg-red-900/40 text-red-400 border border-red-500/30">Overdue</span>
  }
  return <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-500/30">Active</span>
}

export default function CustomersPage() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [search,    setSearch]    = useState('')
  const [sort,      setSort]      = useState('created_at')
  const [order,     setOrder]     = useState<'asc' | 'desc'>('desc')
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [deleting,  setDeleting]  = useState<string | null>(null)

  // Debounced copy of `search`. Without this every keystroke fired its own
  // request, and slow responses could land out of order and overwrite newer
  // results with older ones.
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const load = useCallback(() => {
    setLoading(true)
    setError('')

    // Guards against a stale response resolving after a newer one.
    let cancelled = false

    customersApi.getAll({ search: debouncedSearch, sort, order })
      .then(r => { if (!cancelled) setCustomers(r.data) })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [debouncedSearch, sort, order])

  useEffect(() => load(), [load])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete customer "${name}" and all their loan records? This cannot be undone.`)) return
    setDeleting(id)
    try {
      await customersApi.delete(id, true)
      setCustomers(prev => prev.filter(c => c.customer_id !== id))
    } catch (e: unknown) {
      alert((e as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  const toggleSort = (col: string) => {
    if (sort === col) setOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setSort(col); setOrder('desc') }
  }

  const SortIcon = ({ col }: { col: string }) =>
    sort === col ? (
      <svg className="w-3 h-3 ml-1 inline text-gold-400" fill="currentColor" viewBox="0 0 24 24">
        <path d={order === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}/>
      </svg>
    ) : null

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white"
              style={{ fontFamily: "'Playfair Display', serif" }}>
            Customers
          </h2>
          <p className="text-gray-400 text-sm mt-0.5">
            {customers.length} customer{customers.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <button
          onClick={() => navigate('/customers/new')}
          className="btn-gold text-sm py-2 px-4 self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Add Customer
        </button>
      </div>

      {/* Search bar */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input
          type="text"
          className="input-field pl-10"
          placeholder="Search by name or phone number…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
          >
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
                <th className="text-left px-5 py-3 cursor-pointer hover:text-gray-300"
                    onClick={() => toggleSort('name')}>
                  Name <SortIcon col="name" />
                </th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-right px-4 py-3 cursor-pointer hover:text-gray-300 hidden md:table-cell"
                    onClick={() => toggleSort('principal')}>
                  Principal <SortIcon col="principal" />
                </th>
                <th className="text-right px-4 py-3 hidden lg:table-cell cursor-pointer hover:text-gray-300"
                    onClick={() => toggleSort('total_paid')}>
                  Total Paid <SortIcon col="total_paid" />
                </th>
                <th className="text-left px-4 py-3 hidden md:table-cell cursor-pointer hover:text-gray-300"
                    onClick={() => toggleSort('last_payment')}>
                  Last Payment <SortIcon col="last_payment" />
                </th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500 text-sm animate-pulse">
                    Loading customers…
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <p className="text-gray-400 text-sm">No customers found</p>
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="mt-2 text-gold-400 text-xs hover:underline"
                      >
                        Clear search
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                customers.map(c => (
                  <tr
                    key={c.customer_id}
                    className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <button
                        onClick={() => navigate(`/customers/${c.customer_id}`)}
                        className="text-white font-medium hover:text-gold-400 transition-colors text-left"
                      >
                        {c.name}
                      </button>
                      {c.address && (
                        <p className="text-gray-500 text-xs mt-0.5 truncate max-w-[160px]">{c.address}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300 tabular-nums">{c.phone}</td>
                    <td className="px-4 py-3 text-right text-gold-400 font-medium tabular-nums hidden md:table-cell">
                      {c.latest_principal ? formatINR(parseFloat(c.latest_principal)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-400 tabular-nums hidden lg:table-cell">
                      {formatINR(parseFloat(c.total_paid || '0'))}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                      {c.last_payment_date ? formatDateDisplay(c.last_payment_date) : '—'}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">{statusBadge(c)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => navigate(`/customers/${c.customer_id}`)}
                          className="p-1.5 text-gray-500 hover:text-gold-400 transition-colors rounded-lg hover:bg-gray-800"
                          title="View profile"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(c.customer_id, c.name)}
                          disabled={deleting === c.customer_id}
                          className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded-lg hover:bg-gray-800 disabled:opacity-40"
                          title="Delete customer"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

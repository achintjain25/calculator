import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { customersApi } from '../api/customers'
import { loansApi      } from '../api/loans'
import { paymentsApi   } from '../api/payments'
import type { CustomerSummary, LoanRecord, Payment, InterestBreakdown } from '../api/types'
import { formatINR, formatDateDisplay, parseMoney } from '../utils/format'
import AddPaymentModal from '../components/AddPaymentModal'

// ── small sub-components ─────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-gray-800/60">
      <span className="text-gray-400 text-sm flex-shrink-0 w-40">{label}</span>
      <span className="text-white text-sm font-medium text-right">{value}</span>
    </div>
  )
}

function SummaryCard({ label, value, color = 'gold' }: { label: string; value: string; color?: string }) {
  const cls = {
    gold:  'text-gold-400  bg-gold-500/10  border-gold-500/20',
    green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    red:   'text-red-400   bg-red-500/10   border-red-500/20',
    white: 'text-white     bg-gray-800     border-gray-700',
  }[color] ?? 'text-gold-400 bg-gold-500/10 border-gold-500/20'

  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CustomerProfilePage() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()

  const [customer,    setCustomer]    = useState<CustomerSummary | null>(null)
  const [loans,       setLoans]       = useState<LoanRecord[]>([])
  const [payments,    setPayments]    = useState<Payment[]>([])
  const [breakdowns,  setBreakdowns]  = useState<Record<string, InterestBreakdown>>({})
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [payModal,    setPayModal]    = useState<{ loan: LoanRecord; outstanding: number } | null>(null)
  const [editMode,    setEditMode]    = useState(false)
  const [editForm,    setEditForm]    = useState({ name: '', phone: '', address: '', notes: '' })
  const [saving,      setSaving]      = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const [cust, lns, pmts] = await Promise.all([
        customersApi.getById(id),
        loansApi.getByCustomer(id),
        paymentsApi.getByCustomer(id),
      ])
      setCustomer(cust)
      setLoans(lns)
      setPayments(pmts)
      setEditForm({
        name:    cust.name,
        phone:   cust.phone,
        address: cust.address || '',
        notes:   '',
      })

      // Fetch interest-to-date for each active loan
      const bds: Record<string, InterestBreakdown> = {}
      await Promise.all(
        lns.filter(l => l.is_active).map(async l => {
          try {
            bds[l.id] = await loansApi.getInterestToDate(l.id)
          } catch { /* ignore */ }
        })
      )
      setBreakdowns(bds)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const handleSaveEdit = async () => {
    if (!id) return
    setSaving(true)
    try {
      await customersApi.update(id, {
        name:    editForm.name.trim(),
        phone:   editForm.phone.trim(),
        address: editForm.address.trim() || undefined,
      })
      await load()
      setEditMode(false)
    } catch (e: unknown) {
      alert((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !customer) return
    if (!confirm(`Permanently delete "${customer.name}" and all their records?`)) return
    await customersApi.delete(id, true)
    navigate('/customers')
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gold-400 animate-pulse text-sm">
      Loading customer…
    </div>
  )

  if (error || !customer) return (
    <div className="m-6 p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
      {error || 'Customer not found'}
    </div>
  )

  const activeLoan       = loans.find(l => l.is_active) || loans[0] || null
  const activeBreakdown  = activeLoan ? breakdowns[activeLoan.id] : null
  const totalOutstanding = Object.values(breakdowns).reduce((s, b) => s + b.remaining, 0)
  const totalPaid        = parseMoney(customer.total_paid)

  /**
   * Interest/principal splits recomputed by the server's current engine,
   * keyed by loan + payment date + amount.
   *
   * The `interest_paid` / `principal_paid` / `balance_after` columns stored on
   * each payment row are snapshots taken when that payment was recorded, so
   * rows written before the engine was fixed still hold the old numbers — and
   * rows predating the reducing-balance migration hold nothing at all. Reading
   * the live segments instead keeps this ledger consistent with the summary
   * cards above it, which are always recomputed.
   */
  const recomputedSplits = new Map<string, {
    interest_paid: number; principal_paid: number; balance_after: number
  }>()

  for (const [loanId, breakdown] of Object.entries(breakdowns)) {
    for (const segment of breakdown.segments) {
      if (!segment.payment) continue
      const key = `${loanId}|${segment.payment.payment_date}|${segment.payment.amount}`
      recomputedSplits.set(key, {
        interest_paid:  segment.payment.interest_paid,
        principal_paid: segment.payment.principal_paid,
        balance_after:  segment.payment.balance_after,
      })
    }
  }

  /** Prefer the recomputed split; fall back to the stored snapshot. */
  const splitFor = (p: Payment) => {
    const key = `${p.loan_id}|${String(p.payment_date).slice(0, 10)}|${parseMoney(p.amount)}`
    const live = recomputedSplits.get(key)
    if (live) return { ...live, recomputed: true }
    return {
      interest_paid:  parseMoney(p.interest_paid),
      principal_paid: parseMoney(p.principal_paid),
      balance_after:  p.balance_after != null ? parseMoney(p.balance_after) : null,
      recomputed:     false,
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigate('/customers')} className="hover:text-gold-400 transition-colors">
          Customers
        </button>
        <span>/</span>
        <span className="text-white">{customer.name}</span>
      </div>

      {/* ── Customer info card ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="calc-header flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold-500/20 border border-gold-500/40
                            flex items-center justify-center text-gold-400 font-bold text-lg
                            flex-shrink-0">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              {editMode ? (
                <input
                  className="input-field py-1 text-base font-bold"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                />
              ) : (
                <h2 className="text-lg font-bold text-white"
                    style={{ fontFamily: "'Playfair Display', serif" }}>
                  {customer.name}
                </h2>
              )}
              <p className="text-xs text-gray-400">{customer.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="btn-gold text-xs py-1.5 px-3 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditMode(false)} className="btn-ghost text-xs py-1.5 px-3">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditMode(true)}
                  className="btn-ghost text-xs py-1.5 px-3"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                  </svg>
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="btn-ghost text-xs py-1.5 px-3 hover:border-red-500 hover:text-red-400"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-10">
          <div>
            <InfoRow label="Phone"      value={
              editMode
                ? <input className="input-field py-1 text-sm w-full" value={editForm.phone}
                    onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}/>
                : customer.phone
            }/>
            <InfoRow label="Address"    value={
              editMode
                ? <textarea className="input-field py-1 text-sm resize-none w-full" rows={2}
                    value={editForm.address}
                    onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}/>
                : customer.address || '—'
            }/>
            <InfoRow label="Customer since" value={formatDateDisplay(customer.created_at)}/>
          </div>
          <div>
            <InfoRow label="Active Loans"  value={String(customer.active_loans || 0)}/>
            <InfoRow label="Total Paid"    value={<span className="text-emerald-400">{formatINR(totalPaid)}</span>}/>
            <InfoRow label="Last Payment"  value={customer.last_payment_date ? formatDateDisplay(customer.last_payment_date) : '—'}/>
          </div>
        </div>
      </div>

      {/* ── Financial summary cards ── */}
      {activeBreakdown && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Original Principal"   value={formatINR(activeBreakdown.original_principal ?? activeBreakdown.principal)} color="white"/>
            <SummaryCard label="Current Principal"    value={formatINR(activeBreakdown.current_principal)} color="white"/>
            <SummaryCard label="Interest Due (today)" value={formatINR(activeBreakdown.interest)} color="gold"/>
            <SummaryCard label="Total Outstanding"    value={formatINR(totalOutstanding)} color={totalOutstanding > 0 ? 'red' : 'green'}/>
          </div>
          {/* Reducing balance explanation */}
          <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            <p className="text-xs text-gray-400 leading-relaxed">
              <span className="text-blue-400 font-medium">Reducing Balance:</span>{' '}
              Each payment first clears the accrued interest
              (<span className="text-yellow-400">yellow</span>), then the remainder reduces the principal
              (<span className="text-blue-400">blue</span>).
              Future interest is calculated on the <span className="text-white font-medium">reduced principal</span> only.
            </p>
          </div>
        </>
      )}

      {/* ── Loans ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Loan Records</h3>
          <button
            onClick={() => navigate(`/calculator`)}
            className="text-xs text-gold-400 hover:text-gold-300"
          >
            + New Calculation
          </button>
        </div>

        {loans.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No loan records yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
                  <th className="text-left px-5 py-3">Start Date</th>
                  <th className="text-right px-4 py-3">Principal</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">Rate</th>
                  <th className="text-right px-4 py-3 hidden md:table-cell">Interest (today)</th>
                  <th className="text-right px-4 py-3 hidden md:table-cell">Paid</th>
                  <th className="text-right px-4 py-3">Outstanding</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Status</th>
                  <th className="px-4 py-3"/>
                </tr>
              </thead>
              <tbody>
                {loans.map(loan => {
                  const bd   = breakdowns[loan.id]
                  const paid = parseFloat(loan.total_paid || '0')
                  const outstanding = bd ? bd.remaining : 0

                  return (
                    <tr key={loan.id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                      <td className="px-5 py-3 text-gray-300">{formatDateDisplay(loan.start_date)}</td>
                      <td className="px-4 py-3 text-right text-gold-400 font-medium tabular-nums">
                        {formatINR(parseFloat(loan.principal))}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell tabular-nums">
                        ₹{loan.interest_rate}/₹100
                      </td>
                      <td className="px-4 py-3 text-right text-yellow-400 hidden md:table-cell tabular-nums">
                        {bd ? formatINR(bd.interest) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400 hidden md:table-cell tabular-nums">
                        {formatINR(paid)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">
                        <span className={outstanding > 0 ? 'text-red-400' : 'text-emerald-400'}>
                          {formatINR(outstanding)}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {loan.is_active
                          ? <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-500/30">Active</span>
                          : <span className="px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-400">Closed</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {loan.is_active && bd && bd.remaining > 0 && (
                          <button
                            onClick={() => setPayModal({ loan, outstanding: bd.remaining })}
                            className="text-xs text-gold-400 hover:text-gold-300 whitespace-nowrap"
                          >
                            Record Payment
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Transaction history ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Transaction History</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Reducing balance — each payment clears interest first, then reduces principal
          </p>
        </div>
        {payments.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No payments recorded</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase border-b border-gray-800 bg-gray-900/80">
                  <th className="text-left  px-5 py-3">Date</th>
                  <th className="text-right px-4 py-3">Paid</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">Interest Cleared</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">Principal Reduced</th>
                  <th className="text-right px-4 py-3 hidden md:table-cell">Balance After</th>
                  <th className="text-left  px-4 py-3 hidden lg:table-cell">Method</th>
                  <th className="text-left  px-4 py-3 hidden lg:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody>
                {/* Sort oldest first for the ledger view */}
                {[...payments].sort((a, b) =>
                  a.payment_date.localeCompare(b.payment_date)
                ).map((p) => {
                  const split         = splitFor(p)
                  const interestPaid  = split.interest_paid
                  const principalPaid = split.principal_paid
                  const balanceAfter  = split.balance_after

                  return (
                    <tr key={p.id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                      <td className="px-5 py-3 text-gray-300 whitespace-nowrap">
                        {formatDateDisplay(p.payment_date)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-semibold tabular-nums">
                        {formatINR(parseFloat(p.amount))}
                      </td>
                      {/* Interest cleared portion */}
                      <td className="px-4 py-3 text-right hidden sm:table-cell tabular-nums">
                        {interestPaid > 0 ? (
                          <span className="text-yellow-400">{formatINR(interestPaid)}</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      {/* Principal reduced portion */}
                      <td className="px-4 py-3 text-right hidden sm:table-cell tabular-nums">
                        {principalPaid > 0 ? (
                          <span className="text-blue-400">{formatINR(principalPaid)}</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      {/* Remaining principal after payment */}
                      <td className="px-4 py-3 text-right hidden md:table-cell tabular-nums">
                        {balanceAfter != null ? (
                          <span className={balanceAfter === 0 ? 'text-emerald-400 font-semibold' : 'text-white'}>
                            {balanceAfter === 0 ? '✓ Cleared' : formatINR(balanceAfter)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-300 border border-gray-700">
                          {p.payment_method}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                        {p.notes || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Totals footer */}
              <tfoot>
                <tr className="border-t border-gold-500/30 bg-gray-800/40 text-sm font-semibold">
                  <td className="px-5 py-3 text-gray-400">Total</td>
                  <td className="px-4 py-3 text-right text-emerald-400 tabular-nums">
                    {formatINR(payments.reduce((s, p) => s + parseMoney(p.amount), 0))}
                  </td>
                  {/* Totalled from the same recomputed splits as the rows above,
                      so the footer always adds up to what is displayed. */}
                  <td className="px-4 py-3 text-right text-yellow-400 tabular-nums hidden sm:table-cell">
                    {formatINR(payments.reduce((s, p) => s + splitFor(p).interest_paid, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-blue-400 tabular-nums hidden sm:table-cell">
                    {formatINR(payments.reduce((s, p) => s + splitFor(p).principal_paid, 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Payment modal */}
      {payModal && (
        <AddPaymentModal
          loan={payModal.loan}
          customerId={customer.customer_id}
          outstanding={payModal.outstanding}
          onClose={() => setPayModal(null)}
          onSuccess={() => { setPayModal(null); load() }}
        />
      )}
    </div>
  )
}

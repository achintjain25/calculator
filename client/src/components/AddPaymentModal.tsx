import { useState } from 'react'
import { paymentsApi } from '../api/payments'
import type { LoanRecord } from '../api/types'
import { formatINR, todayISO } from '../utils/format'

interface Props {
  loan:       LoanRecord
  customerId: string
  outstanding: number
  onSuccess:  () => void
  onClose:    () => void
}

const METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'] as const

export default function AddPaymentModal({ loan, customerId, outstanding, onSuccess, onClose }: Props) {
  const [amount,  setAmount]  = useState('')
  const [method,  setMethod]  = useState('Cash')
  const [date,    setDate]    = useState(todayISO())
  const [notes,   setNotes]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) {
      setError('Enter a valid amount greater than 0')
      return
    }
    setSaving(true)
    setError('')
    try {
      await paymentsApi.create({
        loan_id:        loan.id,
        customer_id:    customerId,
        payment_date:   date,
        amount:         amt,
        payment_method: method,
        notes:          notes.trim() || undefined,
      })
      onSuccess()
    } catch (e: unknown) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl animate-slide-up">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h3 className="text-base font-bold text-white"
                style={{ fontFamily: "'Playfair Display', serif" }}>
              Record Payment
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Outstanding: <span className="text-red-400 font-semibold">{formatINR(outstanding)}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Loan summary strip */}
        <div className="px-6 py-3 bg-gray-800/40 border-b border-gray-800 text-xs text-gray-400 grid grid-cols-3 gap-4">
          <div>
            <p className="text-gray-500 uppercase tracking-wide text-[10px]">Principal</p>
            <p className="text-gold-400 font-medium">{formatINR(parseFloat(loan.principal))}</p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wide text-[10px]">Rate</p>
            <p className="text-white font-medium">₹{loan.interest_rate}/₹100</p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wide text-[10px]">Start Date</p>
            <p className="text-white font-medium">{loan.start_date}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Amount */}
          <div>
            <label className="input-label">
              Payment Amount <span className="text-gold-500">(₹)</span>
              <span className="text-red-400 ml-1">*</span>
            </label>
            <input
              type="number"
              className="input-field text-lg font-semibold"
              placeholder="0.00"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError('') }}
              min="0.01"
              step="0.01"
              autoFocus
            />
            {outstanding > 0 && (
              <button
                type="button"
                onClick={() => setAmount(outstanding.toFixed(2))}
                className="text-xs text-gold-400 hover:text-gold-300 mt-1 hover:underline"
              >
                Pay full outstanding: {formatINR(outstanding)}
              </button>
            )}
          </div>

          {/* Method + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Payment Method</label>
              <div className="relative">
                <select
                  className="select-field pr-8"
                  value={method}
                  onChange={e => setMethod(e.target.value)}
                >
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                  <svg className="w-3.5 h-3.5 text-gold-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                  </svg>
                </div>
              </div>
            </div>
            <div>
              <label className="input-label">Payment Date</label>
              <input
                type="date"
                className="input-field"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="input-label">Notes <span className="text-gray-500">(optional)</span></label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Partial payment, interest only…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="btn-gold flex-1 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Saving…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                  </svg>
                  Record Payment
                </>
              )}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

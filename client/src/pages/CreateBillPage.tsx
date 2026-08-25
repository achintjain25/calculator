import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { billsApi     } from '../api/bills'
import { customersApi } from '../api/customers'
import type { BillItem, CustomerSummary } from '../api/types'
import { formatINR, parseNum, todayISO } from '../utils/format'
import { generateBillPDF } from '../utils/billPdf'

// ── empty item factory ────────────────────────────────────────────────────────
const emptyItem = (): BillItem => ({
  description:    '',
  metal_type:     'Gold',
  weight_grams:   null,
  purity_percent: null,
  rate_per_gram:  null,
  making_charges: 0,
  line_total:     0,
})

// ── compute line total ────────────────────────────────────────────────────────
function computeLineTotal(item: BillItem): number {
  const w = item.weight_grams   ?? 0
  const p = item.purity_percent ?? 100
  const r = item.rate_per_gram  ?? 0
  const m = item.making_charges ?? 0
  // metal value = rate × weight × (purity / 100) + making charges
  const metalValue = r * w * (p / 100)
  return parseFloat((metalValue + m).toFixed(2))
}

export default function CreateBillPage() {
  const navigate   = useNavigate()

  // Bill meta
  const [billDate,     setBillDate]     = useState(todayISO())
  const [billNumber,   setBillNumber]   = useState('…')
  const [discount,     setDiscount]     = useState('')
  const [amountPaid,   setAmountPaid]   = useState('')
  const [payMethod,    setPayMethod]    = useState('Cash')
  const [notes,        setNotes]        = useState('')

  // Customer
  const [phoneInput,   setPhoneInput]   = useState('')
  const [custSearch,   setCustSearch]   = useState(false)
  const [customer,     setCustomer]     = useState<CustomerSummary | null>(null)
  const [custName,     setCustName]     = useState('')
  const [custPhone,    setCustPhone]    = useState('')
  const [custAddress,  setCustAddress]  = useState('')

  // Items
  const [items,        setItems]        = useState<BillItem[]>([emptyItem()])

  // UI state
  const [saving,       setSaving]       = useState(false)
  const [errors,       setErrors]       = useState<Record<string, string>>({})
  const [apiError,     setApiError]     = useState('')

  // Load next bill number on mount
  useEffect(() => {
    billsApi.getNextNumber()
      .then(n => setBillNumber(n))
      .catch(() => setBillNumber('RJ-AUTO'))
  }, [])

  // Customer phone lookup
  const lookupCustomer = async () => {
    if (!phoneInput.trim()) return
    setCustSearch(true)
    try {
      const c = await customersApi.getByPhone(phoneInput.trim())
      setCustomer(c)
      setCustName(c.name)
      setCustPhone(c.phone)
      setCustAddress(c.address || '')
    } catch {
      setCustomer(null)
      setCustPhone(phoneInput.trim())
    } finally {
      setCustSearch(false)
    }
  }

  // Item CRUD
  const updateItem = (idx: number, field: keyof BillItem, value: unknown) => {
    setItems(prev => {
      const next = prev.map((it, i) => {
        if (i !== idx) return it
        const updated = { ...it, [field]: value }
        updated.line_total = computeLineTotal(updated)
        return updated
      })
      return next
    })
  }

  const addItem    = () => setItems(p => [...p, emptyItem()])
  const removeItem = (idx: number) =>
    setItems(p => p.length > 1 ? p.filter((_, i) => i !== idx) : p)

  // Totals
  const subtotal    = items.reduce((s, it) => s + it.line_total, 0)
  const discountAmt = parseNum(discount)
  const totalAmount = Math.max(0, subtotal - discountAmt)
  const paidAmt     = parseNum(amountPaid)
  const balanceDue  = Math.max(0, totalAmount - paidAmt)

  // Validation
  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!custName.trim())     errs.custName = 'Customer name is required'
    items.forEach((it, i) => {
      if (!it.description.trim()) errs[`desc_${i}`] = 'Required'
      if (it.line_total < 0)      errs[`total_${i}`] = 'Invalid amount'
    })
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // Save + generate PDF
  const handleSave = async (andPrint = false) => {
    if (!validate()) return
    setSaving(true)
    setApiError('')
    try {
      const bill = await billsApi.create({
        bill_date:        billDate,
        customer_id:      customer?.customer_id,
        customer_name:    custName.trim(),
        customer_phone:   custPhone.trim()   || undefined,
        customer_address: custAddress.trim() || undefined,
        items,
        discount:         discountAmt  || 0,
        amount_paid:      paidAmt      || 0,
        payment_method:   payMethod,
        notes:            notes.trim() || undefined,
      })
      if (andPrint) generateBillPDF(bill)
      navigate(`/bills/${bill.id}`)
    } catch (e: unknown) {
      setApiError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigate('/bills')} className="hover:text-gold-400 transition-colors">
          Bills
        </button>
        <span>/</span>
        <span className="text-white">New Bill</span>
      </div>

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white"
              style={{ fontFamily: "'Playfair Display', serif" }}>
            Create Purchase Bill
          </h2>
          <p className="text-gray-400 text-sm mt-0.5">
            Bill No: <span className="text-gold-400 font-semibold">{billNumber}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="btn-ghost text-sm py-2 px-4 disabled:opacity-60"
          >
            Save Only
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="btn-gold text-sm py-2 px-4 disabled:opacity-60"
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                Save & Download PDF
              </>
            )}
          </button>
        </div>
      </div>

      {apiError && (
        <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {apiError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left column: Customer + Bill meta ── */}
        <div className="space-y-5 lg:col-span-1">

          {/* Bill date */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white border-b border-gray-800 pb-2">
              Bill Details
            </h3>
            <div>
              <label className="input-label">Bill Date</label>
              <input type="date" className="input-field"
                value={billDate} onChange={e => setBillDate(e.target.value)}/>
            </div>
            <div>
              <label className="input-label">Payment Method</label>
              <div className="relative">
                <select className="select-field pr-8"
                  value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  {['Cash','UPI','Bank Transfer','Cheque','Other'].map(m =>
                    <option key={m} value={m}>{m}</option>
                  )}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                  <svg className="w-3.5 h-3.5 text-gold-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                  </svg>
                </div>
              </div>
            </div>
            <div>
              <label className="input-label">Notes <span className="text-gray-500">(optional)</span></label>
              <textarea className="input-field resize-none" rows={2}
                placeholder="Any notes for this bill…"
                value={notes} onChange={e => setNotes(e.target.value)}/>
            </div>
          </div>

          {/* Customer */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white border-b border-gray-800 pb-2">
              Customer Details
            </h3>
            {/* Phone lookup */}
            <div className="flex gap-2">
              <input type="tel" className="input-field flex-1 py-2 text-sm"
                placeholder="Search by phone…"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && lookupCustomer()}/>
              <button onClick={lookupCustomer} disabled={custSearch}
                className="btn-ghost text-xs py-2 px-3 flex-shrink-0">
                {custSearch ? '…' : 'Find'}
              </button>
            </div>
            {customer && (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                </svg>
                Linked: {customer.name}
              </p>
            )}
            <div>
              <label className="input-label">Name <span className="text-red-400">*</span></label>
              <input type="text" className={`input-field ${errors.custName ? 'border-red-500' : ''}`}
                placeholder="Customer name"
                value={custName} onChange={e => { setCustName(e.target.value); setErrors(er => ({ ...er, custName: '' })) }}/>
              {errors.custName && <p className="text-red-400 text-xs mt-1">{errors.custName}</p>}
            </div>
            <div>
              <label className="input-label">Phone</label>
              <input type="tel" className="input-field"
                placeholder="Phone number"
                value={custPhone} onChange={e => setCustPhone(e.target.value)}/>
            </div>
            <div>
              <label className="input-label">Address</label>
              <textarea className="input-field resize-none" rows={2}
                placeholder="Address…"
                value={custAddress} onChange={e => setCustAddress(e.target.value)}/>
            </div>
          </div>
        </div>

        {/* ── Right column: Items + Totals ── */}
        <div className="space-y-5 lg:col-span-2">

          {/* Items */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Ornament Items</h3>
              <button onClick={addItem} className="btn-gold text-xs py-1.5 px-3">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                </svg>
                Add Item
              </button>
            </div>

            <div className="p-4 space-y-4">
              {items.map((item, idx) => (
                <div key={idx}
                  className="bg-gray-800/50 border border-gray-700/60 rounded-xl p-4 space-y-3 relative">
                  {/* Remove button */}
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(idx)}
                      className="absolute top-3 right-3 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  )}

                  <p className="text-xs text-gold-500 font-semibold uppercase tracking-wider">
                    Item {idx + 1}
                  </p>

                  {/* Description + Metal */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="input-label text-xs">Description <span className="text-red-400">*</span></label>
                      <input type="text"
                        className={`input-field py-2 text-sm ${errors[`desc_${idx}`] ? 'border-red-500' : ''}`}
                        placeholder="e.g. Gold Necklace 22K"
                        value={item.description}
                        onChange={e => {
                          updateItem(idx, 'description', e.target.value)
                          setErrors(er => ({ ...er, [`desc_${idx}`]: '' }))
                        }}/>
                      {errors[`desc_${idx}`] &&
                        <p className="text-red-400 text-xs mt-1">{errors[`desc_${idx}`]}</p>}
                    </div>
                    <div>
                      <label className="input-label text-xs">Metal Type</label>
                      <div className="relative">
                        <select className="select-field py-2 text-sm pr-8"
                          value={item.metal_type}
                          onChange={e => updateItem(idx, 'metal_type', e.target.value)}>
                          <option value="Gold">🥇 Gold</option>
                          <option value="Silver">🥈 Silver</option>
                          <option value="Other">Other</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                          <svg className="w-3 h-3 text-gold-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Weight / Purity / Rate / Making */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="input-label text-xs">Weight (g)</label>
                      <input type="number"
                        className="input-field py-2 text-sm"
                        placeholder="0.000"
                        value={item.weight_grams ?? ''}
                        onChange={e => updateItem(idx, 'weight_grams', e.target.value ? parseFloat(e.target.value) : null)}
                        min="0" step="0.001"/>
                    </div>
                    <div>
                      <label className="input-label text-xs">Purity (%)</label>
                      <input type="number"
                        className="input-field py-2 text-sm"
                        placeholder="91.6"
                        value={item.purity_percent ?? ''}
                        onChange={e => updateItem(idx, 'purity_percent', e.target.value ? parseFloat(e.target.value) : null)}
                        min="0" max="100" step="0.1"/>
                    </div>
                    <div>
                      <label className="input-label text-xs">Rate / gram (₹)</label>
                      <input type="number"
                        className="input-field py-2 text-sm"
                        placeholder="9800"
                        value={item.rate_per_gram ?? ''}
                        onChange={e => updateItem(idx, 'rate_per_gram', e.target.value ? parseFloat(e.target.value) : null)}
                        min="0" step="0.01"/>
                    </div>
                    <div>
                      <label className="input-label text-xs">Making (₹)</label>
                      <input type="number"
                        className="input-field py-2 text-sm"
                        placeholder="0"
                        value={item.making_charges || ''}
                        onChange={e => updateItem(idx, 'making_charges', parseFloat(e.target.value) || 0)}
                        min="0" step="1"/>
                    </div>
                  </div>

                  {/* Line total */}
                  <div className="flex items-center justify-between pt-1 border-t border-gray-700/40">
                    <p className="text-xs text-gray-500">
                      {item.weight_grams && item.rate_per_gram && item.purity_percent
                        ? `${item.rate_per_gram} × ${item.weight_grams}g × ${item.purity_percent}% ÷ 100`
                        : 'Enter weight, purity & rate to auto-calculate'}
                    </p>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 mb-0.5">Line Total</p>
                      <p className="text-gold-400 font-bold text-base tabular-nums">
                        {formatINR(item.line_total)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white border-b border-gray-800 pb-2">
              Bill Summary
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="input-label">Discount (₹)</label>
                <input type="number" className="input-field"
                  placeholder="0"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  min="0" step="1"/>
              </div>
              <div>
                <label className="input-label">Amount Paid (₹)</label>
                <input type="number" className="input-field"
                  placeholder="0"
                  value={amountPaid}
                  onChange={e => setAmountPaid(e.target.value)}
                  min="0" step="1"/>
                {totalAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmountPaid(totalAmount.toFixed(2))}
                    className="text-xs text-gold-400 hover:underline mt-1"
                  >
                    Pay full: {formatINR(totalAmount)}
                  </button>
                )}
              </div>
            </div>

            {/* Summary rows */}
            <div className="space-y-2 pt-2 border-t border-gray-800">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-white tabular-nums">{formatINR(subtotal)}</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Discount</span>
                  <span className="text-red-400 tabular-nums">− {formatINR(discountAmt)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold bg-gold-500/10 border border-gold-500/30 rounded-lg px-3 py-2">
                <span className="text-gold-300">Total Amount</span>
                <span className="text-gold-300 tabular-nums">{formatINR(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Amount Paid</span>
                <span className="text-emerald-400 tabular-nums">{formatINR(paidAmt)}</span>
              </div>
              {balanceDue > 0 && (
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-red-400">Balance Due</span>
                  <span className="text-red-400 tabular-nums">{formatINR(balanceDue)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatINR, formatNumber, parseNum, daysBetween, todayISO, formatDateDisplay } from '../utils/format'
import { generateInterestPDF } from '../utils/pdf'
import { customersApi } from '../api/customers'
import { loansApi      } from '../api/loans'
import type { CustomerSummary } from '../api/types'

interface InterestResult {
  totalDays:    number
  totalMonths:  number
  interest:     number
  totalPayable: number
}

interface InterestCalculatorProps {
  shopName: string
}

type RateOption = '2' | '2.5' | '2.75' | 'custom'
type DateMode   = 'dates' | 'days'

const RATE_OPTIONS: { label: string; value: RateOption }[] = [
  { label: '₹2.00 per ₹100/month',  value: '2'      },
  { label: '₹2.50 per ₹100/month',  value: '2.5'    },
  { label: '₹2.75 per ₹100/month',  value: '2.75'   },
  { label: 'Custom Rate',            value: 'custom' },
]

export default function InterestCalculator({ shopName }: InterestCalculatorProps) {
  const navigate = useNavigate()

  // ── existing calculator state (unchanged) ────────────────────────────────
  const [principal,  setPrincipal]  = useState('')
  const [rateOption, setRateOption] = useState<RateOption>('2.5')
  const [customRate, setCustomRate] = useState('')
  const [dateMode,   setDateMode]   = useState<DateMode>('dates')
  const [startDate,  setStartDate]  = useState(todayISO())
  const [endDate,    setEndDate]    = useState('')
  const [numDays,    setNumDays]    = useState('')
  const [result,     setResult]     = useState<InterestResult | null>(null)
  const [errors,     setErrors]     = useState<Record<string, string>>({})
  const [copied,     setCopied]     = useState(false)

  // ── save-to-customer state (new) ─────────────────────────────────────────
  const [phoneSearch,     setPhoneSearch]     = useState('')
  const [foundCustomer,   setFoundCustomer]   = useState<CustomerSummary | null>(null)
  const [phoneSearching,  setPhoneSearching]  = useState(false)
  const [phoneError,      setPhoneError]      = useState('')
  const [saving,          setSaving]          = useState(false)
  const [saveSuccess,     setSaveSuccess]     = useState('')
  const [showSavePanel,   setShowSavePanel]   = useState(false)

  const effectiveRate = rateOption === 'custom' ? parseNum(customRate) : parseFloat(rateOption)

  // ── existing validation + calculate (unchanged logic) ────────────────────
  const validate = useCallback(() => {
    const errs: Record<string, string> = {}
    if (!principal || parseNum(principal) <= 0)
      errs.principal = 'Enter a valid principal amount greater than 0'
    if (rateOption === 'custom' && (!customRate || parseNum(customRate) <= 0))
      errs.customRate = 'Enter a valid custom rate greater than 0'
    if (dateMode === 'dates') {
      if (!startDate) errs.startDate = 'Select a start date'
      if (!endDate)   errs.endDate   = 'Select an end date'
      if (startDate && endDate && endDate <= startDate)
        errs.endDate = 'End date must be after start date'
    } else {
      const d = parseNum(numDays)
      if (!numDays || d <= 0 || !Number.isInteger(d))
        errs.numDays = 'Enter a valid number of days (whole number, greater than 0)'
    }
    return errs
  }, [principal, rateOption, customRate, dateMode, startDate, endDate, numDays])

  const calculate = useCallback(() => {
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) { setResult(null); return }

    const p    = parseNum(principal)
    const rate = effectiveRate
    const days = dateMode === 'dates'
      ? daysBetween(startDate, endDate)
      : Math.round(parseNum(numDays))

    const months       = days / 30
    const interest     = p * (rate / 100) * months
    const totalPayable = p + interest
    setResult({ totalDays: days, totalMonths: months, interest, totalPayable })
  }, [principal, effectiveRate, dateMode, startDate, endDate, numDays, validate])

  useEffect(() => {
    // `startDate` is pre-filled with today, so the old condition was true on
    // first render and the form opened already showing "enter a principal" and
    // "select an end date". Wait until the user has actually entered something
    // before validating.
    const userHasEntered = Boolean(principal) || Boolean(endDate) || Boolean(numDays)
    if (userHasEntered) calculate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal, rateOption, customRate, dateMode, startDate, endDate, numDays])

  const handleReset = () => {
    setPrincipal(''); setRateOption('2.5'); setCustomRate('')
    setDateMode('dates'); setStartDate(todayISO()); setEndDate(''); setNumDays('')
    setResult(null); setErrors({}); setCopied(false)
    setShowSavePanel(false); setFoundCustomer(null); setPhoneSearch(''); setPhoneError(''); setSaveSuccess('')
  }

  const handleCopy = () => {
    if (!result) return
    const sd  = dateMode === 'dates' ? formatDateDisplay(startDate) : 'N/A'
    const ed  = dateMode === 'dates' ? formatDateDisplay(endDate)   : 'N/A'
    const text = [
      `Principal Amount  : ${formatINR(parseNum(principal))}`,
      `Interest Rate     : ₹${effectiveRate} per ₹100 per month`,
      `Loan Start Date   : ${sd}`,
      `Loan End Date     : ${ed}`,
      `Total Days        : ${result.totalDays} days`,
      `Total Months      : ${formatNumber(result.totalMonths, 4)} months (30-day basis)`,
      `Interest Amount   : ${formatINR(result.interest)}`,
      `Total Payable     : ${formatINR(result.totalPayable)}`,
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) })
  }

  const handleDownloadPDF = () => {
    if (!result) return
    const sd = dateMode === 'dates' ? formatDateDisplay(startDate) : `${result.totalDays} days`
    const ed = dateMode === 'dates' ? formatDateDisplay(endDate)   : '—'
    generateInterestPDF({
      shopName, principal: parseNum(principal), rate: effectiveRate,
      startDate: sd, endDate: ed, totalDays: result.totalDays,
      totalMonths: result.totalMonths, interest: result.interest,
      totalPayable: result.totalPayable, date: new Date().toLocaleString('en-IN'),
    })
  }

  // ── save-to-customer handlers ─────────────────────────────────────────────
  const handlePhoneLookup = async () => {
    if (!phoneSearch.trim()) { setPhoneError('Enter a phone number'); return }
    setPhoneSearching(true)
    setPhoneError('')
    setFoundCustomer(null)
    try {
      const c = await customersApi.getByPhone(phoneSearch.trim())
      setFoundCustomer(c)
    } catch {
      setPhoneError('Customer not found. You can create a new one.')
    } finally {
      setPhoneSearching(false)
    }
  }

  const handleSaveToCustomer = async () => {
    if (!result || !foundCustomer) return
    setSaving(true)
    setSaveSuccess('')
    try {
      const actualStartDate = dateMode === 'dates' ? startDate : todayISO()
      await loansApi.create({
        customer_id:   foundCustomer.customer_id,
        principal:     parseNum(principal),
        interest_rate: effectiveRate,
        start_date:    actualStartDate,
        description:   `Saved from calculator on ${new Date().toLocaleDateString('en-IN')}`,
      })
      setSaveSuccess(`Loan saved to ${foundCustomer.name}'s profile!`)
    } catch (e: unknown) {
      setPhoneError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="calc-card animate-slide-up">
      {/* ── Header ── */}
      <div className="calc-header flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gold-500/20 border border-gold-500/40 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
            Loan Interest Calculator
          </h2>
          <p className="text-xs text-gray-400">Calculate interest &amp; total payable for jewellery loans</p>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-5">

        {/* Principal + Rate */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="input-label">Principal Amount <span className="text-gold-500">(₹)</span></label>
            <input type="number" className={`input-field ${errors.principal ? 'border-red-500' : ''}`}
              placeholder="e.g. 50000" value={principal}
              onChange={e => setPrincipal(e.target.value)} min="0" step="1"/>
            {errors.principal && <p className="text-red-400 text-xs mt-1">{errors.principal}</p>}
            {principal && parseNum(principal) > 0 && !errors.principal && (
              <p className="text-gold-500/70 text-xs mt-1">{formatINR(parseNum(principal))}</p>
            )}
          </div>
          <div>
            <label className="input-label">Interest Rate</label>
            <div className="relative">
              <select className="select-field pr-10" value={rateOption}
                onChange={e => setRateOption(e.target.value as RateOption)}>
                {RATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <svg className="w-4 h-4 text-gold-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Rate */}
        {rateOption === 'custom' && (
          <div className="animate-fade-in">
            <label className="input-label">Custom Rate <span className="text-gold-500">(₹ per ₹100 per month)</span></label>
            <input type="number" className={`input-field ${errors.customRate ? 'border-red-500' : ''}`}
              placeholder="e.g. 3" value={customRate}
              onChange={e => setCustomRate(e.target.value)} min="0" step="0.01"/>
            {errors.customRate && <p className="text-red-400 text-xs mt-1">{errors.customRate}</p>}
          </div>
        )}

        {/* Date Mode Toggle */}
        <div>
          <label className="input-label mb-2">Loan Duration</label>
          <div className="flex rounded-lg border border-gray-700 overflow-hidden w-fit">
            {(['dates', 'days'] as DateMode[]).map((mode, i) => (
              <button key={mode} onClick={() => setDateMode(mode)}
                className={`px-4 py-2 text-sm font-medium transition-all duration-200
                  ${i > 0 ? 'border-l border-gray-700' : ''}
                  ${dateMode === mode ? 'bg-gold-500 text-black' : 'bg-transparent text-gray-400 hover:text-white'}`}>
                {mode === 'dates' ? 'Select Dates' : 'Enter Days'}
              </button>
            ))}
          </div>
        </div>

        {/* Date Inputs */}
        {dateMode === 'dates' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
            <div>
              <label className="input-label">Loan Start Date</label>
              <input type="date" className={`input-field ${errors.startDate ? 'border-red-500' : ''}`}
                value={startDate} onChange={e => setStartDate(e.target.value)}/>
              {errors.startDate && <p className="text-red-400 text-xs mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="input-label">Loan End Date</label>
              <input type="date" className={`input-field ${errors.endDate ? 'border-red-500' : ''}`}
                value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}/>
              {errors.endDate && <p className="text-red-400 text-xs mt-1">{errors.endDate}</p>}
              {startDate && endDate && endDate > startDate && (
                <p className="text-gold-500/70 text-xs mt-1">{daysBetween(startDate, endDate)} days between dates</p>
              )}
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
            <label className="input-label">Number of Days <span className="text-gray-500">(1 month = 30 days)</span></label>
            <input type="number" className={`input-field ${errors.numDays ? 'border-red-500' : ''}`}
              placeholder="e.g. 75" value={numDays}
              onChange={e => setNumDays(e.target.value)} min="1" step="1"/>
            {errors.numDays && <p className="text-red-400 text-xs mt-1">{errors.numDays}</p>}
            {numDays && parseNum(numDays) > 0 && !errors.numDays && (
              <p className="text-gold-500/70 text-xs mt-1">= {formatNumber(parseNum(numDays) / 30, 4)} months (30-day basis)</p>
            )}
          </div>
        )}

        {/* Formula info */}
        <div className="flex items-start gap-2 bg-gold-500/5 border border-gold-500/20 rounded-lg px-4 py-3">
          <svg className="w-4 h-4 text-gold-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
          <p className="text-xs text-gray-400">
            Formula: <span className="text-gold-400 font-medium">Principal × (Rate ÷ 100) × (Days ÷ 30)</span>.
            One month = exactly 30 days.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 pt-1">
          <button onClick={calculate} className="btn-gold flex-1 sm:flex-none min-w-[120px]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
            Calculate
          </button>
          <button onClick={handleReset} className="btn-ghost flex-1 sm:flex-none min-w-[100px]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Reset
          </button>
        </div>

        {/* ── Result ── */}
        {result && (
          <div className="result-card space-y-4 mt-2">
            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-black/30 rounded-xl p-3 border border-gray-700/50 text-center">
                <p className="result-label mb-1">Total Days</p>
                <p className="text-xl font-bold text-white tabular-nums">{result.totalDays}</p>
                <p className="text-xs text-gray-500">days</p>
              </div>
              <div className="bg-black/30 rounded-xl p-3 border border-gray-700/50 text-center">
                <p className="result-label mb-1">Total Months</p>
                <p className="text-xl font-bold text-white tabular-nums">{formatNumber(result.totalMonths, 2)}</p>
                <p className="text-xs text-gray-500">30-day basis</p>
              </div>
              <div className="bg-black/30 rounded-xl p-3 border border-gold-500/20 text-center">
                <p className="result-label mb-1">Interest</p>
                <p className="text-lg font-bold text-gold-400 tabular-nums">{formatINR(result.interest)}</p>
              </div>
              <div className="bg-gold-500/10 rounded-xl p-3 border border-gold-500/40 text-center">
                <p className="result-label mb-1">Total Payable</p>
                <p className="text-lg font-bold text-gold-300 tabular-nums">{formatINR(result.totalPayable)}</p>
              </div>
            </div>

            <div className="gold-divider"/>

            {/* Breakdown */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-1.5 border-b border-gray-800">
                <span className="text-gray-400">Principal Amount</span>
                <span className="text-white font-medium tabular-nums">{formatINR(parseNum(principal))}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-gray-800">
                <span className="text-gray-400">Interest Amount</span>
                <span className="text-gold-400 font-medium tabular-nums">+ {formatINR(result.interest)}</span>
              </div>
              <div className="flex justify-between items-center py-2 bg-gold-500/10 rounded-lg px-3 border border-gold-500/30 mt-1">
                <span className="text-gold-300 font-bold text-base">Total Payable</span>
                <span className="text-gold-300 font-bold text-lg tabular-nums">{formatINR(result.totalPayable)}</span>
              </div>
            </div>

            {/* Formula */}
            <div className="bg-black/30 rounded-lg px-4 py-3">
              <p className="result-label mb-1">Formula Used</p>
              <p className="text-xs text-gray-300 font-mono break-all">
                Interest = {formatINR(parseNum(principal))} × ({effectiveRate} ÷ 100) × ({result.totalDays} ÷ 30)
                {' = '}<span className="text-gold-400 font-bold">{formatINR(result.interest)}</span>
              </p>
            </div>

            {/* Receipt actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={handleCopy} className="btn-outline text-sm py-2 px-4">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
                </svg>
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={() => window.print()} className="btn-ghost text-sm py-2 px-4 no-print">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                </svg>
                Print
              </button>
              <button onClick={handleDownloadPDF} className="btn-ghost text-sm py-2 px-4 no-print">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                PDF
              </button>
              {/* Save to Customer button */}
              <button
                onClick={() => setShowSavePanel(p => !p)}
                className="btn-outline text-sm py-2 px-4 border-emerald-500/60 text-emerald-400 hover:bg-emerald-500 hover:text-black"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
                </svg>
                Save to Customer
              </button>
            </div>

            {/* ── Save-to-Customer panel ── */}
            {showSavePanel && (
              <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-xl p-4 space-y-3 animate-fade-in">
                <p className="text-sm font-medium text-emerald-400">Link this calculation to a customer</p>

                {saveSuccess ? (
                  <div className="space-y-3">
                    <p className="text-emerald-400 text-sm flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                      </svg>
                      {saveSuccess}
                    </p>
                    <button
                      onClick={() => foundCustomer && navigate(`/customers/${foundCustomer.customer_id}`)}
                      className="btn-gold text-sm py-2 px-4"
                    >
                      View Customer Profile →
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        className="input-field flex-1 py-2 text-sm"
                        placeholder="Enter customer phone number…"
                        value={phoneSearch}
                        onChange={e => { setPhoneSearch(e.target.value); setPhoneError(''); setFoundCustomer(null) }}
                        onKeyDown={e => e.key === 'Enter' && handlePhoneLookup()}
                      />
                      <button
                        onClick={handlePhoneLookup}
                        disabled={phoneSearching}
                        className="btn-ghost text-sm py-2 px-4 flex-shrink-0"
                      >
                        {phoneSearching ? '…' : 'Search'}
                      </button>
                    </div>

                    {phoneError && (
                      <div className="text-xs text-amber-400 space-y-1">
                        <p>{phoneError}</p>
                        <button
                          onClick={() => navigate('/customers/new')}
                          className="text-gold-400 hover:underline"
                        >
                          + Create new customer →
                        </button>
                      </div>
                    )}

                    {foundCustomer && (
                      <div className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="text-white text-sm font-medium">{foundCustomer.name}</p>
                          <p className="text-gray-400 text-xs">{foundCustomer.phone}</p>
                          {foundCustomer.address && (
                            <p className="text-gray-500 text-xs">{foundCustomer.address}</p>
                          )}
                        </div>
                        <button
                          onClick={handleSaveToCustomer}
                          disabled={saving}
                          className="btn-gold text-sm py-1.5 px-4 disabled:opacity-60 flex-shrink-0"
                        >
                          {saving ? 'Saving…' : 'Save Loan'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

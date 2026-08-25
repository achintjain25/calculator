import { useState, useEffect, useCallback } from 'react'
import { formatINR, formatNumber, parseNum } from '../utils/format'
import { generateGoldPDF } from '../utils/pdf'

interface GoldResult {
  estimatedValue: number
  roundedValue:   number
  formula:        string
}

interface GoldCalculatorProps {
  shopName: string
}

export default function GoldCalculator({ shopName }: GoldCalculatorProps) {
  const [metalType, setMetalType] = useState<'Gold' | 'Silver'>('Gold')
  const [rate,      setRate]      = useState('')
  const [weight,    setWeight]    = useState('')
  const [purity,    setPurity]    = useState('')
  const [result,    setResult]    = useState<GoldResult | null>(null)
  const [errors,    setErrors]    = useState<Record<string, string>>({})
  const [copied,    setCopied]    = useState(false)

  const purityPresets =
    metalType === 'Gold'
      ? [
          { label: '24K (99.9%)', value: '99.9' },
          { label: '22K (91.6%)', value: '91.6' },
          { label: '18K (75%)',   value: '75'   },
          { label: '14K (58.5%)', value: '58.5' },
        ]
      : [
          { label: '999 (99.9%)', value: '99.9' },
          { label: '925 (92.5%)', value: '92.5' },
          { label: '800 (80%)',   value: '80'   },
        ]

  const validate = useCallback(() => {
    const errs: Record<string, string> = {}
    if (!rate   || parseNum(rate)   <= 0) errs.rate   = 'Enter a valid rate greater than 0'
    if (!weight || parseNum(weight) <= 0) errs.weight = 'Enter a valid weight greater than 0'
    const pVal = parseNum(purity)
    if (!purity || pVal <= 0 || pVal > 100) errs.purity = 'Purity must be between 0.1 and 100'
    return errs
  }, [rate, weight, purity])

  const calculate = useCallback(() => {
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) { setResult(null); return }

    const r       = parseNum(rate)
    const w       = parseNum(weight)
    const pVal    = parseNum(purity)
    const value   = r * w * (pVal / 100)
    const rounded = Math.round(value)
    const formula = `${formatINR(r)} × ${formatNumber(w, 3)}g × (${formatNumber(pVal, 2)}% ÷ 100)`

    setResult({ estimatedValue: value, roundedValue: rounded, formula })
  }, [rate, weight, purity, validate])

  useEffect(() => {
    if (rate || weight || purity) calculate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, weight, purity, metalType])

  const handleReset = () => {
    setRate(''); setWeight(''); setPurity('')
    setResult(null); setErrors({}); setCopied(false)
  }

  const handleCopy = () => {
    if (!result) return
    const text = [
      `Metal Type       : ${metalType}`,
      `Rate             : ${formatINR(parseNum(rate))} per gram`,
      `Weight           : ${formatNumber(parseNum(weight), 3)} grams`,
      `Purity           : ${formatNumber(parseNum(purity), 2)}%`,
      `Formula          : ${result.formula}`,
      `Estimated Value  : ${formatINR(result.estimatedValue)}`,
      `Rounded Value    : ${formatINR(result.roundedValue)}`,
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const handleDownloadPDF = () => {
    if (!result) return
    generateGoldPDF({
      shopName,
      metalType,
      rate:           parseNum(rate),
      weight:         parseNum(weight),
      purity:         parseNum(purity),
      estimatedValue: result.estimatedValue,
      date:           new Date().toLocaleString('en-IN'),
    })
  }

  return (
    <div className="calc-card animate-slide-up">
      <div className="calc-header flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gold-500/20 border border-gold-500/40 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-gold-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/>
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
            Gold &amp; Silver Valuation
          </h2>
          <p className="text-xs text-gray-400">Calculate ornament value based on weight &amp; purity</p>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        {/* Metal Type + Rate */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="input-label">Metal Type</label>
            <div className="relative">
              <select
                className="select-field pr-10"
                value={metalType}
                onChange={e => { setMetalType(e.target.value as 'Gold' | 'Silver'); handleReset() }}
              >
                <option value="Gold">🥇 Gold</option>
                <option value="Silver">🥈 Silver</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <svg className="w-4 h-4 text-gold-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
          <div>
            <label className="input-label">Current Rate <span className="text-gold-500">(₹ per gram)</span></label>
            <input
              type="number"
              className={`input-field ${errors.rate ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
              placeholder={metalType === 'Gold' ? 'e.g. 9800' : 'e.g. 120'}
              value={rate}
              onChange={e => setRate(e.target.value)}
              min="0" step="0.01"
            />
            {errors.rate && <p className="text-red-400 text-xs mt-1">{errors.rate}</p>}
          </div>
        </div>

        {/* Weight + Purity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="input-label">Weight of Ornament <span className="text-gold-500">(grams)</span></label>
            <input
              type="number"
              className={`input-field ${errors.weight ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
              placeholder="e.g. 10"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              min="0" step="0.001"
            />
            {errors.weight && <p className="text-red-400 text-xs mt-1">{errors.weight}</p>}
          </div>
          <div>
            <label className="input-label">Purity <span className="text-gold-500">(%)</span></label>
            <input
              type="number"
              className={`input-field ${errors.purity ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
              placeholder="e.g. 91.6"
              value={purity}
              onChange={e => setPurity(e.target.value)}
              min="0.1" max="100" step="0.1"
            />
            {errors.purity && <p className="text-red-400 text-xs mt-1">{errors.purity}</p>}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {purityPresets.map(preset => (
                <button
                  key={preset.value}
                  onClick={() => setPurity(preset.value)}
                  className={`text-xs px-2 py-1 rounded border transition-all duration-150
                    ${purity === preset.value
                      ? 'bg-gold-500 border-gold-500 text-black font-semibold'
                      : 'border-gray-600 text-gray-400 hover:border-gold-500/60 hover:text-gold-400'}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Buttons */}
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

        {/* Result */}
        {result && (
          <div className="result-card space-y-4 mt-2">
            <div>
              <p className="result-label mb-1">Formula Used</p>
              <p className="text-sm text-gray-300 font-mono bg-black/40 rounded-lg px-3 py-2 break-all">
                Value = {result.formula} = <span className="text-gold-400 font-bold">{formatINR(result.estimatedValue)}</span>
              </p>
            </div>
            <div className="gold-divider" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-black/30 rounded-xl p-4 border border-gold-500/20">
                <p className="result-label mb-1">Estimated Value</p>
                <p className="result-value">{formatINR(result.estimatedValue)}</p>
              </div>
              <div className="bg-gold-500/10 rounded-xl p-4 border border-gold-500/40">
                <p className="result-label mb-1">Rounded Value</p>
                <p className="result-value text-gold-300">{formatINR(result.roundedValue)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={handleCopy} className="btn-outline text-sm py-2 px-4">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
                </svg>
                {copied ? 'Copied!' : 'Copy Result'}
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
                Download PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

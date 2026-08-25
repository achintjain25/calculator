/**
 * The shop's timezone. Every "today" here is a business date, so it must roll
 * over at local midnight. A UTC-based `toISOString()` keeps returning
 * yesterday's date until 05:30 IST, which silently backdates loans, payments
 * and bills recorded early in the morning.
 */
export const APP_TIMEZONE = 'Asia/Kolkata'

/** Format a number as Indian Rupee currency (₹1,25,000.00) */
export function formatINR(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0
  return new Intl.NumberFormat('en-IN', {
    style:                 'currency',
    currency:              'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Format a plain number with Indian numbering system commas */
export function formatNumber(value: number, decimals = 2): string {
  const n = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

/** Parse a string to a valid finite number of 0 or more, returning 0 on failure */
export function parseNum(value: string): number {
  const parsed = parseFloat(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/**
 * Parse an API money field. Postgres NUMERIC columns arrive as strings, and a
 * missing one must read as 0 rather than NaN — `formatINR(NaN)` renders "₹NaN"
 * on screen.
 */
export function parseMoney(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

/** Round to 2 decimal places, matching the server's money rounding. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Whole days between two YYYY-MM-DD dates.
 * Both ends are read as UTC midnight so the count is a pure calendar
 * difference, never shifted by the browser's timezone offset.
 */
export function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(String(startDate).slice(0, 10) + 'T00:00:00Z')
  const end   = Date.parse(String(endDate).slice(0, 10)   + 'T00:00:00Z')
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, Math.round((end - start) / 86400000))
}

/** Today's date as YYYY-MM-DD, in the shop's timezone. */
export function todayISO(): string {
  // en-CA formats as YYYY-MM-DD; timeZone pins the calendar day regardless of
  // how the user's machine is configured.
  return new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })
}

/** Format a date string for display (e.g. "12 Jul 2026") */
export function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return ''
  const raw = String(dateStr)

  // A bare YYYY-MM-DD is a calendar date with no time or zone attached, so
  // read and render it in UTC — otherwise a browser behind UTC shows the
  // previous day. A full timestamp is a real instant, so render it in the
  // shop's timezone instead.
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())

  const d = new Date(isDateOnly ? raw.trim() + 'T00:00:00Z' : raw)
  if (Number.isNaN(d.getTime())) return ''

  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: isDateOnly ? 'UTC' : APP_TIMEZONE,
  })
}

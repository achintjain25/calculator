import { Request, Response, NextFunction } from 'express'

/**
 * Request validation helpers.
 *
 * Without these, a bad path param or body field reaches PostgreSQL and comes
 * back as a driver error (22P02 invalid input syntax, 23514 check violation),
 * which the generic handler turns into a 500. Callers deserve a 400.
 */

/** Thrown by the helpers below; the route error handlers map it to a status. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/**
 * Express middleware factory: rejects a request whose named path params are
 * not valid UUIDs, so the query never reaches the database.
 */
export function requireUuidParams(...names: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const name of names) {
      if (!isUuid(req.params[name])) {
        return res.status(400).json({ error: `Invalid ${name}: expected a UUID` })
      }
    }
    next()
  }
}

/** A finite number strictly greater than zero. */
export function requirePositiveNumber(value: unknown, field: string): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  if (!Number.isFinite(n) || n <= 0) {
    throw new HttpError(400, `${field} must be a number greater than 0`)
  }
  return n
}

/** A finite number of zero or more; returns `fallback` when absent. */
export function optionalNonNegativeNumber(
  value: unknown, field: string, fallback = 0
): number {
  if (value === undefined || value === null || value === '') return fallback
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  if (!Number.isFinite(n) || n < 0) {
    throw new HttpError(400, `${field} must be a number of 0 or more`)
  }
  return n
}

/** A finite number of zero or more, or null when absent. */
export function optionalNumberOrNull(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  if (!Number.isFinite(n) || n < 0) {
    throw new HttpError(400, `${field} must be a number of 0 or more`)
  }
  return n
}

/** A calendar date in YYYY-MM-DD form that actually exists. */
export function requireDate(value: unknown, field: string): string {
  const s = String(value ?? '').slice(0, 10)
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z'))) {
    throw new HttpError(400, `${field} must be a valid date in YYYY-MM-DD format`)
  }
  return s
}

/** Same as requireDate, but returns `fallback` when the value is absent. */
export function optionalDate(value: unknown, field: string, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback
  return requireDate(value, field)
}

/** A non-empty string, trimmed and capped at `max` characters. */
export function requireString(value: unknown, field: string, max = 255): string {
  const s = String(value ?? '').trim()
  if (!s) throw new HttpError(400, `${field} is required`)
  if (s.length > max) {
    throw new HttpError(400, `${field} must be at most ${max} characters`)
  }
  return s
}

/** A trimmed string, or null when absent. Capped at `max` characters. */
export function optionalString(value: unknown, field: string, max = 255): string | null {
  if (value === undefined || value === null) return null
  const s = String(value).trim()
  if (!s) return null
  if (s.length > max) {
    throw new HttpError(400, `${field} must be at most ${max} characters`)
  }
  return s
}

/** One of a fixed set of allowed values. */
export function requireEnum<T extends string>(
  value: unknown, allowed: readonly T[], field: string, fallback?: T
): T {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) {
    return fallback
  }
  const s = String(value ?? '') as T
  if (!allowed.includes(s)) {
    throw new HttpError(400, `${field} must be one of: ${allowed.join(', ')}`)
  }
  return s
}

/** Clamp a ?limit= query param into a sane range. */
export function parseLimit(value: unknown, fallback = 50, max = 200): number {
  const n = parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(n, max)
}

/** Parse a ?offset= query param, never negative. */
export function parseOffset(value: unknown): number {
  const n = parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * The shop's timezone. Every "today" in this app is a business date, so it must
 * roll over at local midnight — a UTC-based toISOString() would keep recording
 * yesterday's date until 05:30 IST, backdating payments and bills.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata'

/** Today's date in YYYY-MM-DD, in the shop's timezone. */
export function todayISO(): string {
  // en-CA formats as YYYY-MM-DD, and timeZone pins the calendar day
  // explicitly rather than depending on how the host machine is configured.
  return new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })
}

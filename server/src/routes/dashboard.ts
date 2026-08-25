import { Router, Request, Response } from 'express'
import { query } from '../db'
import { DashboardStats } from '../types'
import { computeReducingBalance, toDateOnly, round2 } from '../interestEngine'
import { parseLimit, todayISO } from '../validate'

const router = Router()

/**
 * The dashboard used to compute interest in SQL with simple interest on the
 * ORIGINAL principal, while the customer profile used the reducing-balance
 * engine. The two screens disagreed on what a customer owed.
 *
 * Both now run through the same engine: one query pulls every active loan with
 * its payments, then the numbers are derived in TypeScript.
 */

interface ActiveLoanRow {
  loan_id:       string
  customer_id:   string
  name:          string
  phone:         string
  principal:     string
  interest_rate: string
  start_date:    string
  metal_type:    string
  payment_dates:   string[] | null
  payment_amounts: string[] | null
}

/**
 * Every active loan with its payment history folded into arrays, so the whole
 * dashboard costs one round trip rather than one query per loan.
 */
async function loadActiveLoans(): Promise<ActiveLoanRow[]> {
  return query<ActiveLoanRow>(
    `SELECT
       l.id            AS loan_id,
       l.customer_id,
       c.name,
       c.phone,
       l.principal,
       l.interest_rate,
       l.start_date::text AS start_date,
       l.metal_type,
       ARRAY_AGG(p.payment_date::text ORDER BY p.payment_date, p.created_at)
         FILTER (WHERE p.id IS NOT NULL) AS payment_dates,
       ARRAY_AGG(p.amount::text ORDER BY p.payment_date, p.created_at)
         FILTER (WHERE p.id IS NOT NULL) AS payment_amounts
     FROM   loan_records l
     JOIN   customers c ON c.id = l.customer_id
     LEFT   JOIN payments p ON p.loan_id = l.id
     WHERE  l.is_active = TRUE
     GROUP  BY l.id, c.name, c.phone`
  )
}

/** Zip the two parallel arrays back into payment objects for the engine. */
function paymentsOf(row: ActiveLoanRow) {
  const dates   = row.payment_dates   ?? []
  const amounts = row.payment_amounts ?? []
  return dates.map((date, i) => ({
    payment_date: toDateOnly(date),
    amount:       parseFloat(amounts[i] ?? '0'),
  }))
}

/** Run one loan through the reducing-balance engine as of `asOf`. */
function stateOf(row: ActiveLoanRow, asOf: string) {
  return computeReducingBalance(
    parseFloat(row.principal),
    parseFloat(row.interest_rate),
    toDateOnly(row.start_date),
    paymentsOf(row),
    asOf
  )
}

// ─── GET /api/dashboard/stats ─────────────────────────────────────────────────
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const asOf = todayISO()

    const [totals] = await query<{ total_customers: string; total_paid: string }>(
      `SELECT
         (SELECT COUNT(*)                  FROM customers) AS total_customers,
         (SELECT COALESCE(SUM(amount), 0)  FROM payments)  AS total_paid`
    )

    const activeLoans = await loadActiveLoans()

    let totalPrincipal   = 0   // current (reduced) principal, not the original
    let totalOutstanding = 0
    let overdueCount     = 0

    for (const row of activeLoans) {
      const state = stateOf(row, asOf)
      totalPrincipal   += state.current_principal
      totalOutstanding += state.remaining
      // "Overdue" means nothing has been collected in over 90 days, which is a
      // truer signal than age alone — a loan serviced monthly is not overdue.
      const payments = paymentsOf(row)
      const lastEvent = payments.length > 0
        ? payments[payments.length - 1].payment_date
        : toDateOnly(row.start_date)
      if (state.remaining > 0 && daysSince(lastEvent, asOf) > 90) overdueCount++
    }

    const stats: DashboardStats = {
      total_customers:   totals?.total_customers ?? '0',
      active_loans:      String(activeLoans.length),
      total_principal:   round2(totalPrincipal).toFixed(2),
      total_paid:        parseFloat(totals?.total_paid ?? '0').toFixed(2),
      total_outstanding: round2(totalOutstanding).toFixed(2),
      overdue_count:     String(overdueCount),
    }

    res.json({ data: stats })
  } catch (err) {
    console.error('GET /dashboard/stats error:', err)
    res.status(500).json({ error: 'Failed to fetch dashboard stats' })
  }
})

function daysSince(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z')
  const b = Date.parse(to   + 'T00:00:00Z')
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86400000))
}

// ─── GET /api/dashboard/top-dues ──────────────────────────────────────────────
// Loans with the largest outstanding balance — the "attention needed" list.
router.get('/top-dues', async (req: Request, res: Response) => {
  try {
    const asOf  = todayISO()
    const limit = parseLimit(req.query.limit, 10, 100)

    const rows = await loadActiveLoans()

    const dues = rows
      .map(row => {
        const state = stateOf(row, asOf)
        return {
          id:               row.customer_id,
          name:             row.name,
          phone:            row.phone,
          loan_id:          row.loan_id,
          principal:        state.current_principal.toFixed(2),
          original_principal: parseFloat(row.principal).toFixed(2),
          interest_rate:    row.interest_rate,
          start_date:       toDateOnly(row.start_date),
          metal_type:       row.metal_type,
          days_elapsed:     state.total_days,
          interest_accrued: state.outstanding_interest.toFixed(2),
          total_payable:    state.total_payable.toFixed(2),
          total_paid:       state.total_paid.toFixed(2),
          outstanding:      state.remaining.toFixed(2),
        }
      })
      .sort((a, b) => parseFloat(b.outstanding) - parseFloat(a.outstanding))
      .slice(0, limit)

    res.json({ data: dues })
  } catch (err) {
    console.error('GET /dashboard/top-dues error:', err)
    res.status(500).json({ error: 'Failed to fetch top dues' })
  }
})

export default router

import { Router, Request, Response } from 'express'
import { query } from '../db'
import { LoanRecord } from '../types'
import { computeReducingBalance, toDateOnly } from '../interestEngine'
import {
  HttpError, requireUuidParams, isUuid, requirePositiveNumber,
  optionalNumberOrNull, optionalString, requireDate, optionalDate,
  requireEnum, todayISO,
} from '../validate'

const router = Router()

const METAL_TYPES = ['Gold', 'Silver'] as const

function fail(res: Response, err: unknown, context: string, fallback: string) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }
  // FK violation — the referenced customer does not exist.
  if ((err as { code?: string }).code === '23503') {
    return res.status(400).json({ error: 'Customer not found' })
  }
  // CHECK violation — a value the DB constraints reject.
  if ((err as { code?: string }).code === '23514') {
    return res.status(400).json({ error: 'One or more values are outside the allowed range' })
  }
  console.error(`${context}:`, err)
  return res.status(500).json({ error: fallback })
}

/** Load a loan and its payment history in the shape the engine expects. */
async function loadLoanWithPayments(loanId: string) {
  const loanRows = await query<LoanRecord>(
    `SELECT * FROM loan_records WHERE id = $1`,
    [loanId]
  )
  if (loanRows.length === 0) throw new HttpError(404, 'Loan not found')

  const payRows = await query<{
    payment_date:   string
    amount:         string
    payment_method: string
    notes:          string | null
  }>(
    `SELECT payment_date, amount, payment_method, notes
     FROM   payments
     WHERE  loan_id = $1
     ORDER  BY payment_date ASC, created_at ASC`,
    [loanId]
  )

  return {
    loan: loanRows[0],
    payments: payRows.map(p => ({
      payment_date:   toDateOnly(p.payment_date),
      amount:         parseFloat(p.amount),
      payment_method: p.payment_method,
      notes:          p.notes,
    })),
  }
}

// ─── GET /api/loans/customer/:customerId ─────────────────────────────────────
router.get('/customer/:customerId', requireUuidParams('customerId'), async (req: Request, res: Response) => {
  try {
    const rows = await query<LoanRecord>(
      `SELECT l.*,
              COALESCE(SUM(p.amount), 0) AS total_paid
       FROM   loan_records l
       LEFT   JOIN payments p ON p.loan_id = l.id
       WHERE  l.customer_id = $1
       GROUP  BY l.id
       ORDER  BY l.is_active DESC, l.created_at DESC`,
      [req.params.customerId]
    )
    res.json({ data: rows })
  } catch (err) {
    fail(res, err, 'GET /loans/customer', 'Failed to fetch loans')
  }
})

// ─── GET /api/loans/:id ───────────────────────────────────────────────────────
router.get('/:id', requireUuidParams('id'), async (req: Request, res: Response) => {
  try {
    const rows = await query<LoanRecord>(
      `SELECT l.*,
              COALESCE(SUM(p.amount), 0) AS total_paid
       FROM   loan_records l
       LEFT   JOIN payments p ON p.loan_id = l.id
       WHERE  l.id = $1
       GROUP  BY l.id`,
      [req.params.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Loan not found' })
    res.json({ data: rows[0] })
  } catch (err) {
    fail(res, err, 'GET /loans/:id', 'Failed to fetch loan')
  }
})

// ─── POST /api/loans ──────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {}

    if (!isUuid(body.customer_id)) {
      throw new HttpError(400, 'customer_id must be a valid customer UUID')
    }

    const metalType     = requireEnum(body.metal_type, METAL_TYPES, 'metal_type', 'Gold')
    const principal     = requirePositiveNumber(body.principal, 'principal')
    const interestRate  = requirePositiveNumber(body.interest_rate, 'interest_rate')
    const startDate     = requireDate(body.start_date, 'start_date')
    const weightGrams   = optionalNumberOrNull(body.weight_grams, 'weight_grams')
    const purityPercent = optionalNumberOrNull(body.purity_percent, 'purity_percent')
    const ornamentValue = optionalNumberOrNull(body.ornament_value, 'ornament_value')
    const description   = optionalString(body.description, 'description', 1000)

    // A loan dated in the future would accrue negative interest on every
    // screen, so reject it rather than storing something the engine clamps.
    if (startDate > todayISO()) {
      throw new HttpError(400, 'start_date cannot be in the future')
    }
    if (purityPercent !== null && purityPercent > 100) {
      throw new HttpError(400, 'purity_percent cannot exceed 100')
    }

    const rows = await query<LoanRecord>(
      `INSERT INTO loan_records
         (customer_id, metal_type, weight_grams, purity_percent,
          ornament_value, principal, interest_rate, start_date, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        body.customer_id, metalType, weightGrams, purityPercent,
        ornamentValue, principal, interestRate, startDate, description,
      ]
    )
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    fail(res, err, 'POST /loans', 'Failed to create loan')
  }
})

// ─── PATCH /api/loans/:id ─────────────────────────────────────────────────────
// Financial terms are validated the same way as on create — a loan with
// payments against it must not be silently re-based to nonsense values.
router.patch('/:id', requireUuidParams('id'), async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {}
    const fields: string[]  = []
    const values: unknown[] = []
    let   idx               = 1

    const push = (column: string, value: unknown) => {
      fields.push(`${column} = $${idx++}`)
      values.push(value)
    }

    if (body.metal_type !== undefined) {
      push('metal_type', requireEnum(body.metal_type, METAL_TYPES, 'metal_type'))
    }
    if (body.principal !== undefined) {
      push('principal', requirePositiveNumber(body.principal, 'principal'))
    }
    if (body.interest_rate !== undefined) {
      push('interest_rate', requirePositiveNumber(body.interest_rate, 'interest_rate'))
    }
    if (body.start_date !== undefined) {
      const startDate = requireDate(body.start_date, 'start_date')
      if (startDate > todayISO()) {
        throw new HttpError(400, 'start_date cannot be in the future')
      }
      push('start_date', startDate)
    }
    if (body.weight_grams !== undefined) {
      push('weight_grams', optionalNumberOrNull(body.weight_grams, 'weight_grams'))
    }
    if (body.purity_percent !== undefined) {
      const purity = optionalNumberOrNull(body.purity_percent, 'purity_percent')
      if (purity !== null && purity > 100) {
        throw new HttpError(400, 'purity_percent cannot exceed 100')
      }
      push('purity_percent', purity)
    }
    if (body.ornament_value !== undefined) {
      push('ornament_value', optionalNumberOrNull(body.ornament_value, 'ornament_value'))
    }
    if (body.description !== undefined) {
      push('description', optionalString(body.description, 'description', 1000))
    }

    if (body.is_active !== undefined) {
      const isActive = body.is_active === true || body.is_active === 'true'
      push('is_active', isActive)
      // Closing stamps closed_at; reopening clears it, so the two never disagree.
      push('closed_at', isActive ? null : new Date().toISOString())
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' })

    values.push(req.params.id)
    const rows = await query<LoanRecord>(
      `UPDATE loan_records SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Loan not found' })
    res.json({ data: rows[0] })
  } catch (err) {
    fail(res, err, 'PATCH /loans/:id', 'Failed to update loan')
  }
})

// ─── GET /api/loans/:id/interest-to-date ─────────────────────────────────────
// REDUCING BALANCE: walks every prior payment to derive the current principal,
// then accrues interest on that reduced balance up to ?date= (default today).
router.get('/:id/interest-to-date', requireUuidParams('id'), async (req: Request, res: Response) => {
  try {
    const { loan, payments } = await loadLoanWithPayments(req.params.id)

    const startDate = toDateOnly(loan.start_date)
    const toDate    = optionalDate(req.query.date, 'date', todayISO())

    if (toDate < startDate) {
      throw new HttpError(400, 'date must be on or after the loan start date')
    }

    const state = computeReducingBalance(
      parseFloat(loan.principal),
      parseFloat(loan.interest_rate),
      startDate,
      payments,
      toDate
    )

    res.json({
      data: {
        loan_id:            loan.id,
        original_principal: parseFloat(loan.principal),
        current_principal:  state.current_principal,
        interest_rate:      parseFloat(loan.interest_rate),
        start_date:         startDate,
        to_date:            toDate,
        total_days:         state.total_days,
        total_months:       state.total_months,

        // Aliases kept for the existing frontend contract.
        principal:            state.current_principal,
        interest:             state.current_segment_interest,

        total_interest:       state.total_interest,
        outstanding_interest: state.outstanding_interest,
        carried_interest:     state.carried_interest,
        total_payable:        state.total_payable,
        total_paid:           state.total_paid,
        remaining:            state.remaining,
        segments:             state.segments,
      },
    })
  } catch (err) {
    fail(res, err, 'GET /loans/:id/interest-to-date', 'Failed to calculate interest')
  }
})

export default router

import { Router, Request, Response } from 'express'
import { query, withTransaction } from '../db'
import { Payment } from '../types'
import { splitPayment, toDateOnly } from '../interestEngine'
import {
  HttpError, requireUuidParams, isUuid, requirePositiveNumber,
  optionalDate, optionalString, requireEnum, parseLimit, parseOffset, todayISO,
} from '../validate'

const router = Router()

const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'] as const

function fail(res: Response, err: unknown, context: string, fallback: string) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }
  console.error(`${context}:`, err)
  return res.status(500).json({ error: fallback })
}

// ─── GET /api/payments/recent ─────────────────────────────────────────────────
// Declared before the /:param routes so the literal segment wins.
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseLimit(req.query.limit, 20, 100)
    const rows  = await query<Payment>(
      `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone
       FROM   payments p
       JOIN   customers c ON c.id = p.customer_id
       ORDER  BY p.payment_date DESC, p.created_at DESC
       LIMIT  $1`,
      [limit]
    )
    res.json({ data: rows })
  } catch (err) {
    fail(res, err, 'GET /payments/recent', 'Failed to fetch recent payments')
  }
})

// ─── GET /api/payments/loan/:loanId ──────────────────────────────────────────
router.get('/loan/:loanId', requireUuidParams('loanId'), async (req: Request, res: Response) => {
  try {
    const rows = await query<Payment>(
      `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone
       FROM   payments p
       JOIN   customers c ON c.id = p.customer_id
       WHERE  p.loan_id = $1
       ORDER  BY p.payment_date ASC, p.created_at ASC`,
      [req.params.loanId]
    )
    res.json({ data: rows })
  } catch (err) {
    fail(res, err, 'GET /payments/loan', 'Failed to fetch payments')
  }
})

// ─── GET /api/payments/customer/:customerId ───────────────────────────────────
router.get('/customer/:customerId', requireUuidParams('customerId'), async (req: Request, res: Response) => {
  try {
    const limit  = parseLimit(req.query.limit, 200, 500)
    const offset = parseOffset(req.query.offset)

    const rows = await query<Payment>(
      `SELECT p.*,
              l.principal     AS loan_principal,
              l.interest_rate AS loan_rate,
              l.start_date    AS loan_start_date,
              l.metal_type    AS loan_metal_type
       FROM   payments p
       JOIN   loan_records l ON l.id = p.loan_id
       WHERE  p.customer_id = $1
       ORDER  BY p.payment_date ASC, p.created_at ASC
       LIMIT  $2 OFFSET $3`,
      [req.params.customerId, limit, offset]
    )
    res.json({ data: rows })
  } catch (err) {
    fail(res, err, 'GET /payments/customer', 'Failed to fetch payments')
  }
})

// ─── POST /api/payments ───────────────────────────────────────────────────────
// REDUCING BALANCE, all inside one transaction:
//   1. Lock the loan row so two concurrent payments cannot both read the same
//      prior state and each compute a stale interest/principal split
//   2. Replay every prior payment through the engine
//   3. Split this payment into interest vs. principal
//   4. Append the payment with its full breakdown (the ledger is append-only)
//   5. Auto-close the loan once principal and interest are both cleared
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {}

    if (!isUuid(body.loan_id))     throw new HttpError(400, 'loan_id must be a valid UUID')
    if (!isUuid(body.customer_id)) throw new HttpError(400, 'customer_id must be a valid UUID')

    const amount        = requirePositiveNumber(body.amount, 'amount')
    const paymentDate   = optionalDate(body.payment_date, 'payment_date', todayISO())
    const paymentMethod = requireEnum(body.payment_method, PAYMENT_METHODS, 'payment_method', 'Cash')
    const notes         = optionalString(body.notes, 'notes', 1000)

    // A payment dated in the future would let interest run backwards.
    if (paymentDate > todayISO()) {
      throw new HttpError(400, 'payment_date cannot be in the future')
    }

    const result = await withTransaction(async (client) => {
      // FOR UPDATE serialises concurrent payments against the same loan.
      const loanRes = await client.query(
        `SELECT * FROM loan_records
         WHERE  id = $1 AND customer_id = $2
         FOR UPDATE`,
        [body.loan_id, body.customer_id]
      )
      if (loanRes.rowCount === 0) {
        throw new HttpError(404, 'Loan not found, or it does not belong to this customer')
      }

      const loan      = loanRes.rows[0]
      const startDate = toDateOnly(loan.start_date)

      if (paymentDate < startDate) {
        throw new HttpError(400, 'payment_date cannot be before the loan start date')
      }

      const priorRes = await client.query(
        `SELECT payment_date, amount
         FROM   payments
         WHERE  loan_id = $1
         ORDER  BY payment_date ASC, created_at ASC`,
        [body.loan_id]
      )
      const priorPayments = priorRes.rows.map((p: { payment_date: string; amount: string }) => ({
        payment_date: toDateOnly(p.payment_date),
        amount:       parseFloat(p.amount),
      }))

      const split = splitPayment(
        parseFloat(loan.principal),
        parseFloat(loan.interest_rate),
        startDate,
        priorPayments,
        paymentDate,
        amount
      )

      const payRes = await client.query<Payment>(
        `INSERT INTO payments
           (loan_id, customer_id, payment_date, amount, payment_method, notes,
            interest_paid, principal_paid, balance_after)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          body.loan_id, body.customer_id, paymentDate, amount, paymentMethod, notes,
          split.interest_paid, split.principal_paid, split.balance_after,
        ]
      )

      // Close only when nothing is left owing. Clearing the principal while
      // interest is still carried forward is not a settled loan.
      const fullySettled = split.balance_after <= 0 && split.interest_remaining <= 0
      if (fullySettled) {
        await client.query(
          `UPDATE loan_records SET is_active = FALSE, closed_at = NOW() WHERE id = $1`,
          [body.loan_id]
        )
      }

      return { payment: payRes.rows[0], split, loan_closed: fullySettled }
    })

    res.status(201).json({ data: result })
  } catch (err) {
    fail(res, err, 'POST /payments', 'Failed to record payment')
  }
})

export default router

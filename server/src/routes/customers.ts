import { Router, Request, Response } from 'express'
import { query, withTransaction } from '../db'
import { Customer, CustomerSummary } from '../types'
import {
  HttpError, requireUuidParams, requireString, optionalString,
  parseLimit, parseOffset,
} from '../validate'

const router = Router()

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Normalise phone: strip spaces/dashes/brackets, keep digits and a leading +. */
function normalisePhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, '').trim()
}

/** Reject anything that is not a plausible phone number before it hits the DB. */
function validatePhone(raw: unknown): string {
  const phone = normalisePhone(requireString(raw, 'Phone number', 20))
  if (!/^\+?\d{10,15}$/.test(phone)) {
    throw new HttpError(400, 'Enter a valid phone number (10–15 digits)')
  }
  return phone
}

/** Map an error onto a response, keeping DB internals out of the payload. */
function fail(res: Response, err: unknown, context: string, fallback: string) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }
  if ((err as { code?: string }).code === '23505') {
    return res.status(409).json({ error: 'A customer with this phone number already exists.' })
  }
  console.error(`${context}:`, err)
  return res.status(500).json({ error: fallback })
}

// ─── GET /api/customers ───────────────────────────────────────────────────────
// All customers with their financial summary.
//   ?search=  matches name OR phone, case-insensitive
//   ?sort=name|principal|total_paid|created_at|last_payment   (default created_at)
//   ?order=asc|desc                                           (default desc)
//   ?limit=  1–200 (default 200)   ?offset=
router.get('/', async (req: Request, res: Response) => {
  try {
    const search = String(req.query.search ?? '').trim()
    const sort   = String(req.query.sort ?? 'created_at')
    const order  = String(req.query.order ?? 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    const limit  = parseLimit(req.query.limit, 200, 200)
    const offset = parseOffset(req.query.offset)

    // Whitelist — the column name is interpolated, so it can never come from
    // user input directly.
    const allowedSort: Record<string, string> = {
      name:         'cs.name',
      principal:    'cs.latest_principal',
      total_paid:   'cs.total_paid',
      created_at:   'cs.created_at',
      last_payment: 'cs.last_payment_date',
    }
    const sortCol = allowedSort[sort] || 'cs.created_at'

    // NULLS LAST keeps customers without loans/payments off the top of a
    // descending sort, where they read as "no data" rather than "highest".
    const orderBy = `ORDER BY ${sortCol} ${order} NULLS LAST, cs.customer_id`

    const rows = search
      ? await query<CustomerSummary>(
          `SELECT * FROM customer_summary cs
           WHERE cs.name ILIKE $1 OR cs.phone ILIKE $1
           ${orderBy}
           LIMIT $2 OFFSET $3`,
          [`%${search}%`, limit, offset]
        )
      : await query<CustomerSummary>(
          `SELECT * FROM customer_summary cs
           ${orderBy}
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        )

    res.json({ data: rows, count: rows.length, limit, offset })
  } catch (err) {
    fail(res, err, 'GET /customers', 'Failed to fetch customers')
  }
})

// ─── GET /api/customers/phone/:phone ─────────────────────────────────────────
// Look up a customer by phone — used by the calculator "Save" flow.
// Declared before /:id so the literal "phone" segment wins.
router.get('/phone/:phone', async (req: Request, res: Response) => {
  try {
    const phone = normalisePhone(req.params.phone)
    if (!phone) return res.status(400).json({ error: 'Phone number is required' })

    const rows = await query<CustomerSummary>(
      `SELECT * FROM customer_summary WHERE phone = $1`,
      [phone]
    )
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found', phone })
    }
    res.json({ data: rows[0] })
  } catch (err) {
    fail(res, err, 'GET /customers/phone', 'Failed to fetch customer')
  }
})

// ─── GET /api/customers/:id ───────────────────────────────────────────────────
router.get('/:id', requireUuidParams('id'), async (req: Request, res: Response) => {
  try {
    const rows = await query<CustomerSummary>(
      `SELECT * FROM customer_summary WHERE customer_id = $1`,
      [req.params.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Customer not found' })
    res.json({ data: rows[0] })
  } catch (err) {
    fail(res, err, 'GET /customers/:id', 'Failed to fetch customer')
  }
})

// ─── POST /api/customers ──────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const name    = requireString(req.body?.name, 'Name', 255)
    const phone   = validatePhone(req.body?.phone)
    const address = optionalString(req.body?.address, 'Address', 500)
    const notes   = optionalString(req.body?.notes, 'Notes', 2000)

    // Check first so the response can carry the existing customer, letting the
    // UI offer "open their profile" instead of a bare error.
    const existing = await query<Customer>(
      `SELECT id, name, phone FROM customers WHERE phone = $1`,
      [phone]
    )
    if (existing.length > 0) {
      return res.status(409).json({
        error:             'A customer with this phone number already exists.',
        existing_customer: existing[0],
      })
    }

    const rows = await query<Customer>(
      `INSERT INTO customers (name, phone, address, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, phone, address, notes]
    )
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    fail(res, err, 'POST /customers', 'Failed to create customer')
  }
})

// ─── PATCH /api/customers/:id ─────────────────────────────────────────────────
router.patch('/:id', requireUuidParams('id'), async (req: Request, res: Response) => {
  try {
    const fields: string[]  = []
    const values: unknown[] = []
    let   idx               = 1

    if (req.body?.name !== undefined) {
      fields.push(`name = $${idx++}`)
      values.push(requireString(req.body.name, 'Name', 255))
    }
    if (req.body?.phone !== undefined) {
      fields.push(`phone = $${idx++}`)
      values.push(validatePhone(req.body.phone))
    }
    if (req.body?.address !== undefined) {
      fields.push(`address = $${idx++}`)
      values.push(optionalString(req.body.address, 'Address', 500))
    }
    if (req.body?.notes !== undefined) {
      fields.push(`notes = $${idx++}`)
      values.push(optionalString(req.body.notes, 'Notes', 2000))
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' })

    values.push(req.params.id)
    const rows = await query<Customer>(
      `UPDATE customers SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Customer not found' })
    res.json({ data: rows[0] })
  } catch (err) {
    fail(res, err, 'PATCH /customers/:id', 'Failed to update customer')
  }
})

// ─── DELETE /api/customers/:id ────────────────────────────────────────────────
// Cascades to loan_records and payments via FK ON DELETE CASCADE.
router.delete('/:id', requireUuidParams('id'), async (req: Request, res: Response) => {
  try {
    // Deleting a customer destroys their entire payment ledger, so refuse
    // unless the caller opts in with ?force=true after seeing the warning.
    const force = String(req.query.force ?? '') === 'true'

    const [counts] = await query<{ loan_count: string; payment_count: string }>(
      `SELECT
         (SELECT COUNT(*) FROM loan_records WHERE customer_id = $1) AS loan_count,
         (SELECT COUNT(*) FROM payments     WHERE customer_id = $1) AS payment_count`,
      [req.params.id]
    )
    const loanCount    = parseInt(counts?.loan_count ?? '0', 10)
    const paymentCount = parseInt(counts?.payment_count ?? '0', 10)

    if (!force && (loanCount > 0 || paymentCount > 0)) {
      return res.status(409).json({
        error: `This customer has ${loanCount} loan record(s) and ${paymentCount} payment(s). `
             + 'Deleting them erases that financial history permanently. '
             + 'Retry with ?force=true to confirm.',
        loan_count:    loanCount,
        payment_count: paymentCount,
        requires_confirmation: true,
      })
    }

    await withTransaction(async (client) => {
      const result = await client.query(
        `DELETE FROM customers WHERE id = $1 RETURNING id`,
        [req.params.id]
      )
      if (result.rowCount === 0) throw new HttpError(404, 'Customer not found')
    })

    res.json({ message: 'Customer deleted successfully' })
  } catch (err) {
    fail(res, err, 'DELETE /customers/:id', 'Failed to delete customer')
  }
})

export default router

import { Router, Request, Response } from 'express'
import { query, withTransaction } from '../db'
import { round2 } from '../interestEngine'
import {
  HttpError, requireUuidParams, isUuid, requireString, optionalString,
  optionalNonNegativeNumber, optionalNumberOrNull, optionalDate,
  requireEnum, parseLimit, parseOffset, todayISO,
} from '../validate'

const router = Router()

const METAL_TYPES     = ['Gold', 'Silver', 'Other'] as const
const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'] as const
const MAX_ITEMS       = 100

interface BillItemInput {
  description:     string
  metal_type:      string
  weight_grams:    number | null
  purity_percent:  number | null
  rate_per_gram:   number | null
  making_charges:  number
  line_total:      number
}

function fail(res: Response, err: unknown, context: string, fallback: string) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }
  if ((err as { code?: string }).code === '23505') {
    return res.status(409).json({ error: 'That bill number is already in use — please retry.' })
  }
  console.error(`${context}:`, err)
  return res.status(500).json({ error: fallback })
}

/**
 * Validate one line item and recompute its total on the server.
 *
 * The client sends `line_total`, but a bill is a financial document — trusting
 * a client-supplied total lets a tampered or buggy request store a figure that
 * does not match its own line items.
 */
function normaliseItem(raw: unknown, index: number): BillItemInput {
  const item = (raw ?? {}) as Record<string, unknown>
  const label = `Item ${index + 1}`

  const description   = requireString(item.description, `${label} description`, 255)
  const metalType     = requireEnum(item.metal_type, METAL_TYPES, `${label} metal_type`, 'Gold')
  const weightGrams   = optionalNumberOrNull(item.weight_grams, `${label} weight_grams`)
  const purityPercent = optionalNumberOrNull(item.purity_percent, `${label} purity_percent`)
  const ratePerGram   = optionalNumberOrNull(item.rate_per_gram, `${label} rate_per_gram`)
  const makingCharges = optionalNonNegativeNumber(item.making_charges, `${label} making_charges`, 0)

  if (purityPercent !== null && purityPercent > 100) {
    throw new HttpError(400, `${label} purity_percent cannot exceed 100`)
  }

  // metal value = rate × weight × (purity ÷ 100), plus making charges.
  // Mirrors computeLineTotal() in the client so both agree to the paise.
  const metalValue = (ratePerGram ?? 0) * (weightGrams ?? 0) * ((purityPercent ?? 100) / 100)
  const computed   = round2(metalValue + makingCharges)

  // When there is no rate/weight to compute from, honour an explicit total so
  // a shop can still bill a flat-priced item.
  const lineTotal = computed > 0
    ? computed
    : optionalNonNegativeNumber(item.line_total, `${label} line_total`, 0)

  return {
    description,
    metal_type:     metalType,
    weight_grams:   weightGrams,
    purity_percent: purityPercent,
    rate_per_gram:  ratePerGram,
    making_charges: makingCharges,
    line_total:     lineTotal,
  }
}

// ─── GET /api/bills ───────────────────────────────────────────────────────────
// Newest first. Optional ?search= over customer name / phone / bill number.
router.get('/', async (req: Request, res: Response) => {
  try {
    const search = String(req.query.search ?? '').trim()
    const limit  = parseLimit(req.query.limit, 100, 200)
    const offset = parseOffset(req.query.offset)

    const rows = search
      ? await query(
          `SELECT b.*, COUNT(bi.id) AS item_count
           FROM   bills b
           LEFT   JOIN bill_items bi ON bi.bill_id = b.id
           WHERE  b.customer_name  ILIKE $1
              OR  b.customer_phone ILIKE $1
              OR  b.bill_number    ILIKE $1
           GROUP  BY b.id
           ORDER  BY b.bill_date DESC, b.created_at DESC
           LIMIT  $2 OFFSET $3`,
          [`%${search}%`, limit, offset]
        )
      : await query(
          `SELECT b.*, COUNT(bi.id) AS item_count
           FROM   bills b
           LEFT   JOIN bill_items bi ON bi.bill_id = b.id
           GROUP  BY b.id
           ORDER  BY b.bill_date DESC, b.created_at DESC
           LIMIT  $1 OFFSET $2`,
          [limit, offset]
        )

    res.json({ data: rows, count: rows.length, limit, offset })
  } catch (err) {
    fail(res, err, 'GET /bills', 'Failed to fetch bills')
  }
})

// ─── GET /api/bills/next-number ───────────────────────────────────────────────
// Preview only. The number actually stored is generated inside the insert
// transaction, so this value is indicative and may be taken by a concurrent
// bill before the user saves.
router.get('/next-number', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ bill_number: string }>(
      `SELECT peek_next_bill_number() AS bill_number`
    )
    res.json({ data: { bill_number: rows[0]?.bill_number ?? null, preview: true } })
  } catch (err) {
    fail(res, err, 'GET /bills/next-number', 'Failed to generate bill number')
  }
})

// ─── GET /api/bills/:id ───────────────────────────────────────────────────────
// Full bill with all line items — used for reprinting the PDF.
router.get('/:id', requireUuidParams('id'), async (req: Request, res: Response) => {
  try {
    const bills = await query(`SELECT * FROM bills WHERE id = $1`, [req.params.id])
    if (bills.length === 0) return res.status(404).json({ error: 'Bill not found' })

    const items = await query(
      `SELECT * FROM bill_items WHERE bill_id = $1 ORDER BY item_number ASC`,
      [req.params.id]
    )
    res.json({ data: { ...bills[0], items } })
  } catch (err) {
    fail(res, err, 'GET /bills/:id', 'Failed to fetch bill')
  }
})

// ─── POST /api/bills ──────────────────────────────────────────────────────────
// Bill + line items in a single transaction, with every total recomputed here.
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {}

    const customerName = requireString(body.customer_name, 'Customer name', 255)
    const billDate     = optionalDate(body.bill_date, 'bill_date', todayISO())
    const customerId   = body.customer_id ? String(body.customer_id) : null
    const phone        = optionalString(body.customer_phone, 'customer_phone', 20)
    const address      = optionalString(body.customer_address, 'customer_address', 500)
    const notes        = optionalString(body.notes, 'notes', 2000)
    const method       = requireEnum(body.payment_method, PAYMENT_METHODS, 'payment_method', 'Cash')

    if (customerId !== null && !isUuid(customerId)) {
      throw new HttpError(400, 'customer_id must be a valid UUID when provided')
    }
    if (billDate > todayISO()) {
      throw new HttpError(400, 'bill_date cannot be in the future')
    }

    const rawItems = Array.isArray(body.items) ? body.items : []
    if (rawItems.length === 0) {
      throw new HttpError(400, 'At least one item is required')
    }
    if (rawItems.length > MAX_ITEMS) {
      throw new HttpError(400, `A bill can hold at most ${MAX_ITEMS} items`)
    }

    const items: BillItemInput[] = rawItems.map(normaliseItem)
    const subtotal = round2(
      items.reduce((sum: number, item: BillItemInput) => sum + item.line_total, 0)
    )
    const discount = optionalNonNegativeNumber(body.discount, 'discount', 0)

    if (discount > subtotal) {
      throw new HttpError(400, 'Discount cannot exceed the bill subtotal')
    }

    const totalAmount = round2(subtotal - discount)
    const amountPaid  = optionalNonNegativeNumber(body.amount_paid, 'amount_paid', 0)

    if (amountPaid > totalAmount) {
      throw new HttpError(400, 'Amount paid cannot exceed the bill total')
    }

    const status =
      amountPaid >= totalAmount && totalAmount > 0 ? 'paid'
      : amountPaid > 0                             ? 'partial'
      : totalAmount === 0                          ? 'paid'
      :                                              'unpaid'

    const result = await withTransaction(async (client) => {
      // Generated inside the transaction under an advisory lock, so two
      // simultaneous bills cannot claim the same number.
      const numRes = await client.query(`SELECT next_bill_number() AS bill_number`)
      const billNumber = numRes.rows[0].bill_number

      const billRes = await client.query(
        `INSERT INTO bills
           (bill_number, bill_date, customer_id, customer_name,
            customer_phone, customer_address, subtotal, discount,
            total_amount, amount_paid, payment_method, notes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          billNumber, billDate, customerId, customerName,
          phone, address, subtotal, discount,
          totalAmount, amountPaid, method, notes, status,
        ]
      )
      const bill = billRes.rows[0]

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        await client.query(
          `INSERT INTO bill_items
             (bill_id, item_number, description, metal_type,
              weight_grams, purity_percent, rate_per_gram,
              making_charges, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            bill.id, i + 1, item.description, item.metal_type,
            item.weight_grams, item.purity_percent, item.rate_per_gram,
            item.making_charges, item.line_total,
          ]
        )
      }

      const itemsRes = await client.query(
        `SELECT * FROM bill_items WHERE bill_id = $1 ORDER BY item_number`,
        [bill.id]
      )
      return { ...bill, items: itemsRes.rows }
    })

    res.status(201).json({ data: result })
  } catch (err) {
    fail(res, err, 'POST /bills', 'Failed to create bill')
  }
})

// ─── DELETE /api/bills/:id ────────────────────────────────────────────────────
// A bill is a financial record, so deletion needs explicit confirmation.
router.delete('/:id', requireUuidParams('id'), async (req: Request, res: Response) => {
  try {
    if (String(req.query.force ?? '') !== 'true') {
      return res.status(409).json({
        error: 'Deleting a bill permanently removes a financial record. '
             + 'Retry with ?force=true to confirm.',
        requires_confirmation: true,
      })
    }

    const rows = await query(
      `DELETE FROM bills WHERE id = $1 RETURNING id, bill_number`,
      [req.params.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Bill not found' })
    res.json({ message: 'Bill deleted' })
  } catch (err) {
    fail(res, err, 'DELETE /bills/:id', 'Failed to delete bill')
  }
})

export default router

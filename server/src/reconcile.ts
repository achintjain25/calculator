/**
 * Loan reconciliation
 * ───────────────────
 * Replays every active loan through the current interest engine and reports
 * any whose balance is actually settled.
 *
 * Why this exists: the previous engine dropped unpaid interest and read DATE
 * columns a day early, and it only closed a loan when the principal hit zero
 * during the exact payment being recorded. Loans settled before those fixes can
 * still be flagged active, so the dashboard counts them and shows a customer as
 * owing nothing while their loan stays open.
 *
 *   npm run reconcile           report only — changes nothing
 *   npm run reconcile -- --apply  close the loans listed in the report
 *
 * Reporting is the default deliberately: closing a loan is a business decision,
 * so nothing is written until someone has read the list and asked for it.
 */

import dotenv from 'dotenv'
import { pool, query } from './db'
import { computeReducingBalance, toDateOnly } from './interestEngine'
import { todayISO } from './validate'

dotenv.config()

interface Row {
  loan_id:       string
  customer_name: string
  phone:         string
  principal:     string
  interest_rate: string
  start_date:    string
  payment_dates:   string[] | null
  payment_amounts: string[] | null
}

const money = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function main() {
  const apply = process.argv.includes('--apply')
  const asOf  = todayISO()

  const rows = await query<Row>(
    `SELECT
       l.id AS loan_id,
       c.name AS customer_name,
       c.phone,
       l.principal,
       l.interest_rate,
       l.start_date::text AS start_date,
       ARRAY_AGG(p.payment_date::text ORDER BY p.payment_date, p.created_at)
         FILTER (WHERE p.id IS NOT NULL) AS payment_dates,
       ARRAY_AGG(p.amount::text ORDER BY p.payment_date, p.created_at)
         FILTER (WHERE p.id IS NOT NULL) AS payment_amounts
     FROM   loan_records l
     JOIN   customers c ON c.id = l.customer_id
     LEFT   JOIN payments p ON p.loan_id = l.id
     WHERE  l.is_active = TRUE
     GROUP  BY l.id, c.name, c.phone
     ORDER  BY c.name`
  )

  if (rows.length === 0) {
    console.log('\nNo active loans to reconcile.\n')
    return
  }

  const settled: { id: string; label: string; overpaid: number }[] = []

  console.log(`\nReconciling ${rows.length} active loan(s) as of ${asOf}:\n`)

  for (const row of rows) {
    const dates   = row.payment_dates   ?? []
    const amounts = row.payment_amounts ?? []
    const payments = dates.map((date, i) => ({
      payment_date: toDateOnly(date),
      amount:       parseFloat(amounts[i] ?? '0'),
    }))

    const state = computeReducingBalance(
      parseFloat(row.principal),
      parseFloat(row.interest_rate),
      toDateOnly(row.start_date),
      payments,
      asOf
    )

    const label = `${row.customer_name} (${row.phone})`

    if (state.remaining <= 0) {
      // Overpayment is worth surfacing — the shop may owe a refund.
      const overpaid = Math.max(
        0, state.total_paid - (parseFloat(row.principal) + state.total_interest)
      )
      settled.push({ id: row.loan_id, label, overpaid })
      console.log(
        `  SETTLED   ${label}\n` +
        `            principal ${money(parseFloat(row.principal))}` +
        `  interest ${money(state.total_interest)}` +
        `  paid ${money(state.total_paid)}` +
        (overpaid > 0.005 ? `  OVERPAID BY ${money(overpaid)}` : '')
      )
    } else {
      console.log(
        `  open      ${label}  outstanding ${money(state.remaining)}` +
        `  (principal ${money(state.current_principal)}` +
        ` + interest ${money(state.outstanding_interest)})`
      )
    }
  }

  if (settled.length === 0) {
    console.log('\n✅ Every active loan still has a balance. Nothing to change.\n')
    return
  }

  console.log(`\n${settled.length} loan(s) are fully settled but still marked active.`)

  const totalOverpaid = settled.reduce((sum, s) => sum + s.overpaid, 0)
  if (totalOverpaid > 0.005) {
    console.log(`Total overpayment across them: ${money(totalOverpaid)} — worth checking before closing.`)
  }

  if (!apply) {
    console.log('\nThis was a report only — nothing was changed.')
    console.log('To close these loans, re-run with:  npm run reconcile -- --apply\n')
    return
  }

  for (const s of settled) {
    await query(
      `UPDATE loan_records
       SET    is_active = FALSE,
              closed_at = COALESCE(closed_at, NOW())
       WHERE  id = $1 AND is_active = TRUE`,
      [s.id]
    )
    console.log(`  closed: ${s.label}`)
  }

  console.log(`\n✅ Closed ${settled.length} settled loan(s).\n`)
}

main()
  .then(async () => { await pool.end(); process.exit(0) })
  .catch(async (err) => {
    console.error('\nReconciliation failed:', (err as Error).message)
    await pool.end().catch(() => undefined)
    process.exit(1)
  })

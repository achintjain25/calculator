/**
 * Reducing Balance Interest Engine
 * ─────────────────────────────────
 * Formula (unchanged from the calculator):
 *   Interest = Principal × (Rate ÷ 100) × (Days ÷ 30)
 *   1 month  = exactly 30 days
 *
 * Reducing balance logic:
 *   When a payment arrives:
 *     1. Interest accrues from the last event date to the payment date
 *     2. The payment first clears OUTSTANDING interest (carried-over + newly accrued)
 *     3. Any remainder reduces the principal
 *     4. Any shortfall stays owed as carried-over interest — it is NOT forgiven
 *     5. The next period's interest accrues on the NEW (reduced) principal
 *
 * Money is rounded to paise (2 dp) at every boundary so that the API, the PDF
 * receipt and the database ledger always agree to the last rupee.
 */

/** Round to 2 decimal places, avoiding binary float drift (e.g. 1.005 -> 1.01). */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Normalise anything the DB or an API client may hand us into YYYY-MM-DD.
 * node-postgres returns DATE columns as JS Date objects, so routes must not
 * assume they already hold strings.
 */
export function toDateOnly(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, '0')
    const d = String(value.getUTCDate()).padStart(2, '0')
    return y + '-' + m + '-' + d
  }
  return String(value).slice(0, 10)
}

/**
 * Whole days between two YYYY-MM-DD dates, calendar-based.
 * Both ends are parsed as UTC midnight so the result is never skewed by the
 * server's local timezone or by a daylight-saving transition.
 */
export function daysBetween(from: string | Date, to: string | Date): number {
  const a = Date.parse(toDateOnly(from) + 'T00:00:00Z')
  const b = Date.parse(toDateOnly(to) + 'T00:00:00Z')
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86400000))
}

export interface PaymentEvent {
  payment_date:   string
  amount:         number
  payment_method: string
  notes:          string | null
  interest_paid:  number
  principal_paid: number
  balance_after:  number
}

export interface LoanSegment {
  from_date:           string
  to_date:             string
  opening_principal:   number
  days:                number
  months:              number
  interest_accrued:    number
  /** Unpaid interest carried into this segment from earlier short payments */
  interest_carried_in: number
  payment?:            PaymentEvent
}

export interface LoanState {
  /** Outstanding principal right now (reduces with each payment) */
  current_principal: number
  /** Every rupee of interest that has accrued since origination */
  total_interest: number
  /** Interest still unpaid: carried-over shortfall + the open segment */
  outstanding_interest: number
  /** What the customer must hand over today to close the loan */
  total_payable: number
  /** Sum of every payment received so far */
  total_paid: number
  /** Alias of total_payable — what is still owed */
  remaining: number
  segments: LoanSegment[]
  total_days: number
  total_months: number
  /** Interest accrued in the current open segment only */
  current_segment_interest: number
  /** Unpaid interest carried forward from earlier short payments */
  carried_interest: number
}

export interface PaymentInput {
  payment_date:    string | Date
  amount:          number
  payment_method?: string
  notes?:          string | null
}

/**
 * Walks every payment event chronologically and computes the reducing-balance
 * state at toDate.
 *
 * @param originalPrincipal  Loan principal at origination
 * @param rate               Rupees per 100 per month (e.g. 2.5)
 * @param startDate          Loan start date, YYYY-MM-DD
 * @param payments           All payments for the loan (any order)
 * @param toDate             Calculate up to this date, YYYY-MM-DD
 */
export function computeReducingBalance(
  originalPrincipal: number,
  rate: number,
  startDate: string | Date,
  payments: PaymentInput[],
  toDate: string | Date
): LoanState {
  const start = toDateOnly(startDate)
  const end   = toDateOnly(toDate)

  const calcInterest = (principal: number, days: number): number =>
    round2(principal * (rate / 100) * (days / 30))

  let currentPrincipal = round2(originalPrincipal)
  let carriedInterest  = 0        // interest owed but not yet paid
  let segmentStart     = start
  let totalInterest    = 0
  let totalPaid        = 0
  const segments: LoanSegment[] = []

  // Only payments on or before toDate count, oldest first.
  const sorted = payments
    .map(p => ({
      payment_date:   toDateOnly(p.payment_date),
      amount:         round2(Number(p.amount) || 0),
      payment_method: p.payment_method || 'Cash',
      notes:          p.notes ?? null,
    }))
    .filter(p => p.payment_date <= end)
    .sort((a, b) => a.payment_date.localeCompare(b.payment_date))

  for (const payment of sorted) {
    const days            = daysBetween(segmentStart, payment.payment_date)
    const interestAccrued = calcInterest(currentPrincipal, days)

    // Everything the customer owes in interest at this moment.
    const interestDue = round2(carriedInterest + interestAccrued)

    // Interest is settled first, then principal. Any shortfall is carried.
    const interestPaid  = round2(Math.min(payment.amount, interestDue))
    const principalPaid = round2(
      Math.min(Math.max(0, payment.amount - interestDue), currentPrincipal)
    )
    const balanceAfter  = round2(Math.max(0, currentPrincipal - principalPaid))

    segments.push({
      from_date:           segmentStart,
      to_date:             payment.payment_date,
      opening_principal:   currentPrincipal,
      days,
      months:              days / 30,
      interest_accrued:    interestAccrued,
      interest_carried_in: carriedInterest,
      payment: {
        payment_date:   payment.payment_date,
        amount:         payment.amount,
        payment_method: payment.payment_method,
        notes:          payment.notes,
        interest_paid:  interestPaid,
        principal_paid: principalPaid,
        balance_after:  balanceAfter,
      },
    })

    totalInterest    = round2(totalInterest + interestAccrued)
    totalPaid        = round2(totalPaid + payment.amount)
    carriedInterest  = round2(interestDue - interestPaid)   // unpaid remainder
    currentPrincipal = balanceAfter
    segmentStart     = payment.payment_date
  }

  // ── Final open segment: last event -> toDate ───────────────────────────────
  const finalDays     = daysBetween(segmentStart, end)
  const finalInterest = calcInterest(currentPrincipal, finalDays)
  const totalDays     = daysBetween(start, end)

  segments.push({
    from_date:           segmentStart,
    to_date:             end,
    opening_principal:   currentPrincipal,
    days:                finalDays,
    months:              finalDays / 30,
    interest_accrued:    finalInterest,
    interest_carried_in: carriedInterest,
  })

  totalInterest = round2(totalInterest + finalInterest)

  const outstandingInterest = round2(carriedInterest + finalInterest)
  const totalPayable        = round2(currentPrincipal + outstandingInterest)

  return {
    current_principal:        currentPrincipal,
    total_interest:           totalInterest,
    outstanding_interest:     outstandingInterest,
    total_payable:            totalPayable,
    total_paid:               totalPaid,
    remaining:                totalPayable,
    segments,
    total_days:               totalDays,
    total_months:             totalDays / 30,
    current_segment_interest: finalInterest,
    carried_interest:         carriedInterest,
  }
}

/**
 * Given a new payment of paymentAmount on paymentDate, work out how much
 * clears interest and how much reduces principal, based on all prior payments.
 */
export function splitPayment(
  originalPrincipal: number,
  rate: number,
  startDate: string | Date,
  priorPayments: PaymentInput[],
  paymentDate: string | Date,
  paymentAmount: number
): {
  interest_paid:      number
  principal_paid:     number
  balance_after:      number
  /** Interest still owed after this payment (carried to the next period) */
  interest_remaining: number
} {
  const amount = round2(paymentAmount)

  // State the instant before this payment lands.
  const state = computeReducingBalance(
    originalPrincipal, rate, startDate, priorPayments, paymentDate
  )

  // Carried-over shortfall plus interest accrued in the open segment.
  const interestDue = state.outstanding_interest

  const interestPaid  = round2(Math.min(amount, interestDue))
  const principalPaid = round2(
    Math.min(Math.max(0, amount - interestDue), state.current_principal)
  )

  return {
    interest_paid:      interestPaid,
    principal_paid:     principalPaid,
    balance_after:      round2(Math.max(0, state.current_principal - principalPaid)),
    interest_remaining: round2(interestDue - interestPaid),
  }
}

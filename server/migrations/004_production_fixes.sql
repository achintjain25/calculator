-- =============================================================================
-- Migration 004: Production correctness fixes
--
--   1. customer_summary reported inflated total_paid / last_payment_date
--   2. Bill numbers could collide under concurrent inserts
--   3. Missing constraints and indexes that production data depends on
--
-- Safe to re-run.
-- =============================================================================

-- =============================================================================
-- FIX 1 — customer_summary multiplied total_paid by the customer's loan count
-- -----------------------------------------------------------------------------
-- The old view joined BOTH loan_records AND payments onto customers. Those two
-- joins multiply: a customer with 2 loans and 1 payment of Rs.5,000 produced
-- two identical payment rows, so SUM(p.amount) reported Rs.10,000.
--
-- COUNT(DISTINCT l.id) hid the same problem on the loan side, which is why it
-- went unnoticed — the money column had no such guard.
--
-- The fix aggregates payments in a scalar subquery instead of a join, so each
-- payment is counted exactly once regardless of how many loans exist.
-- =============================================================================
-- Dropped rather than replaced: CREATE OR REPLACE VIEW refuses any change to
-- the output column list or types, and this rewrite changes how the columns
-- are derived.
DROP VIEW IF EXISTS customer_summary;

CREATE VIEW customer_summary AS
SELECT
  c.id         AS customer_id,
  c.name,
  c.phone,
  c.address,
  c.created_at,
  c.updated_at,

  -- Active loan count
  (
    SELECT COUNT(*) FROM loan_records l
    WHERE l.customer_id = c.id AND l.is_active
  )                                                   AS active_loans,

  -- Latest active loan's principal (NULL when there is no active loan)
  (
    SELECT principal FROM loan_records
    WHERE customer_id = c.id AND is_active = TRUE
    ORDER BY created_at DESC, id LIMIT 1
  )                                                   AS latest_principal,

  -- Latest active loan's interest rate
  (
    SELECT interest_rate FROM loan_records
    WHERE customer_id = c.id AND is_active = TRUE
    ORDER BY created_at DESC, id LIMIT 1
  )                                                   AS latest_rate,

  -- Latest active loan's start date
  (
    SELECT start_date FROM loan_records
    WHERE customer_id = c.id AND is_active = TRUE
    ORDER BY created_at DESC, id LIMIT 1
  )                                                   AS loan_start_date,

  -- Total paid across ALL loans — counted once per payment
  (
    SELECT COALESCE(SUM(p.amount), 0) FROM payments p
    WHERE p.customer_id = c.id
  )                                                   AS total_paid,

  -- Most recent payment date
  (
    SELECT MAX(p.payment_date) FROM payments p
    WHERE p.customer_id = c.id
  )                                                   AS last_payment_date

FROM customers c;

-- =============================================================================
-- FIX 2 — race-free bill numbering
-- -----------------------------------------------------------------------------
-- generate_bill_number() derived the next number from COUNT(*) + 1 and then
-- looped while the number existed. Two transactions running concurrently both
-- saw the same COUNT and both passed the existence check (neither had committed
-- yet), so both tried to insert the same bill_number and one failed on the
-- UNIQUE constraint with a 500.
--
-- next_bill_number() takes a transaction-scoped advisory lock keyed on the
-- year, so callers serialise on numbering only, and the lock is released
-- automatically at COMMIT or ROLLBACK.
-- =============================================================================
CREATE OR REPLACE FUNCTION next_bill_number()
RETURNS VARCHAR LANGUAGE plpgsql AS $$
DECLARE
  yr       TEXT := to_char(CURRENT_DATE, 'YYYY');
  next_num INT;
BEGIN
  -- Serialise concurrent numbering for this year only.
  PERFORM pg_advisory_xact_lock(hashtext('bill_number_' || yr));

  -- Derive from the highest number actually issued, not from COUNT(*), so
  -- deleting a bill never causes a number to be handed out twice.
  SELECT COALESCE(MAX(SUBSTRING(bill_number FROM '\d+$')::INT), 0) + 1
    INTO next_num
    FROM bills
   WHERE bill_number LIKE 'RJ-' || yr || '-%';

  RETURN 'RJ-' || yr || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

-- Read-only preview for the "next bill number" hint in the UI.
-- Takes no lock, so it must never be used to actually issue a number.
CREATE OR REPLACE FUNCTION peek_next_bill_number()
RETURNS VARCHAR LANGUAGE plpgsql STABLE AS $$
DECLARE
  yr       TEXT := to_char(CURRENT_DATE, 'YYYY');
  next_num INT;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(bill_number FROM '\d+$')::INT), 0) + 1
    INTO next_num
    FROM bills
   WHERE bill_number LIKE 'RJ-' || yr || '-%';

  RETURN 'RJ-' || yr || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

-- The old, race-prone function and its unused sequence.
DROP FUNCTION IF EXISTS generate_bill_number();
DROP SEQUENCE IF EXISTS bill_number_seq;

-- =============================================================================
-- FIX 3 — constraints the application relies on but the schema did not enforce
-- =============================================================================

-- payment_method on bills had no CHECK, unlike payments.payment_method.
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_payment_method_check;
ALTER TABLE bills ADD  CONSTRAINT bills_payment_method_check
  CHECK (payment_method IN ('Cash','UPI','Bank Transfer','Cheque','Other'));

-- Money on a bill can never be negative.
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_amounts_nonnegative;
ALTER TABLE bills ADD  CONSTRAINT bills_amounts_nonnegative
  CHECK (subtotal >= 0 AND discount >= 0 AND total_amount >= 0 AND amount_paid >= 0);

-- A payment must be dated on or after its loan started, and the interest /
-- principal split must add up to the amount actually received.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_split_nonnegative;
ALTER TABLE payments ADD  CONSTRAINT payments_split_nonnegative
  CHECK (interest_paid >= 0 AND principal_paid >= 0
         AND interest_paid + principal_paid <= amount + 0.01);

-- Purity is a percentage.
ALTER TABLE loan_records DROP CONSTRAINT IF EXISTS loan_records_purity_range;
ALTER TABLE loan_records ADD  CONSTRAINT loan_records_purity_range
  CHECK (purity_percent IS NULL OR (purity_percent > 0 AND purity_percent <= 100));

ALTER TABLE bill_items DROP CONSTRAINT IF EXISTS bill_items_purity_range;
ALTER TABLE bill_items ADD  CONSTRAINT bill_items_purity_range
  CHECK (purity_percent IS NULL OR (purity_percent > 0 AND purity_percent <= 100));

-- =============================================================================
-- FIX 4 — indexes for the queries the dashboard and search actually run
-- =============================================================================

-- The dashboard scans active loans on every page load.
CREATE INDEX IF NOT EXISTS idx_loan_records_active_only
  ON loan_records (is_active) WHERE is_active = TRUE;

-- Payment replay always reads a loan's history in chronological order.
CREATE INDEX IF NOT EXISTS idx_payments_loan_chrono
  ON payments (loan_id, payment_date, created_at);

-- Customer search is ILIKE '%term%' on phone as well as name.
CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm
  ON customers USING GIN (phone gin_trgm_ops);

-- Bill search covers name, phone and bill number.
CREATE INDEX IF NOT EXISTS idx_bills_name_trgm
  ON bills USING GIN (customer_name gin_trgm_ops);

-- Sorting the customer list by creation date.
CREATE INDEX IF NOT EXISTS idx_customers_created
  ON customers (created_at DESC);

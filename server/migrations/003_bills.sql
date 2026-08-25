-- =============================================================================
-- Migration 003: Purchase Bills
-- Stores customer purchase bills (buying ornaments from the shop).
-- Run in pgAdmin Query Tool on rj_jewellers database.
-- =============================================================================

-- ── Auto bill number sequence ─────────────────────────────────────────────────
-- Format: RJ-YYYY-NNNN  (resets each year)
CREATE SEQUENCE IF NOT EXISTS bill_number_seq START 1;

-- ── bills table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bills (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Bill identity
  bill_number     VARCHAR(30)   NOT NULL UNIQUE,   -- e.g. RJ-2026-0001
  bill_date       DATE          NOT NULL DEFAULT CURRENT_DATE,

  -- Customer (optional link — can also bill walk-in customers by name only)
  customer_id     UUID          REFERENCES customers(id) ON DELETE SET NULL,
  customer_name   VARCHAR(255)  NOT NULL,
  customer_phone  VARCHAR(20),
  customer_address TEXT,

  -- Payment
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid     NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due     NUMERIC(14,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  payment_method  VARCHAR(50)   DEFAULT 'Cash',
  notes           TEXT,

  -- Status
  status          VARCHAR(20)   NOT NULL DEFAULT 'paid'
                                CHECK (status IN ('paid','partial','unpaid')),

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── bill_items table ──────────────────────────────────────────────────────────
-- Each bill can have multiple ornament line items.
CREATE TABLE IF NOT EXISTS bill_items (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id         UUID          NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  item_number     SMALLINT      NOT NULL DEFAULT 1,  -- line order

  description     VARCHAR(255)  NOT NULL,            -- e.g. "Gold Necklace 22K"
  metal_type      VARCHAR(10)   DEFAULT 'Gold'
                                CHECK (metal_type IN ('Gold','Silver','Other')),
  weight_grams    NUMERIC(10,3),
  purity_percent  NUMERIC(5,2),
  rate_per_gram   NUMERIC(14,2),
  making_charges  NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total      NUMERIC(14,2) NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bills_customer     ON bills (customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_date         ON bills (bill_date DESC);
CREATE INDEX IF NOT EXISTS idx_bills_number       ON bills (bill_number);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill    ON bill_items (bill_id);

-- Auto updated_at
DROP TRIGGER IF EXISTS trg_bills_updated_at ON bills;
CREATE TRIGGER trg_bills_updated_at
  BEFORE UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Bill number generator function ───────────────────────────────────────────
-- Generates RJ-YYYY-NNNN  where NNNN is a per-year sequential counter.
CREATE OR REPLACE FUNCTION generate_bill_number()
RETURNS VARCHAR LANGUAGE plpgsql AS $$
DECLARE
  yr       TEXT := to_char(CURRENT_DATE, 'YYYY');
  cnt      INT;
  bill_num TEXT;
BEGIN
  SELECT COUNT(*) + 1
    INTO cnt
    FROM bills
   WHERE to_char(bill_date, 'YYYY') = yr;

  bill_num := 'RJ-' || yr || '-' || LPAD(cnt::TEXT, 4, '0');

  -- Handle race condition: keep incrementing if number already exists
  WHILE EXISTS (SELECT 1 FROM bills WHERE bill_number = bill_num) LOOP
    cnt      := cnt + 1;
    bill_num := 'RJ-' || yr || '-' || LPAD(cnt::TEXT, 4, '0');
  END LOOP;

  RETURN bill_num;
END;
$$;

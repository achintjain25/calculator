-- =============================================================================
-- RJ Jewellers — PostgreSQL Schema
-- Migration: 001_initial_schema.sql
-- Run: psql -U postgres -d rj_jewellers -f 001_initial_schema.sql
-- =============================================================================

-- Create database (run separately as superuser if needed)
-- CREATE DATABASE rj_jewellers;

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fast text search on names

-- =============================================================================
-- TABLE: customers
-- One row per customer. Phone number is the business unique key.
-- =============================================================================
CREATE TABLE IF NOT EXISTS customers (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255)  NOT NULL,
  phone         VARCHAR(20)   NOT NULL,
  address       TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT customers_phone_unique UNIQUE (phone),
  CONSTRAINT customers_phone_nonempty CHECK (trim(phone) <> ''),
  CONSTRAINT customers_name_nonempty  CHECK (trim(name)  <> '')
);

-- Index for fast phone lookups (primary search key in this app)
CREATE INDEX IF NOT EXISTS idx_customers_phone
  ON customers (phone);

-- Index for trigram-based name search (partial match, case-insensitive)
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON customers USING GIN (name gin_trgm_ops);

-- =============================================================================
-- TABLE: loan_records
-- Each customer can have multiple loan records over time.
-- Stores the full snapshot of each loan's financial parameters.
-- =============================================================================
CREATE TABLE IF NOT EXISTS loan_records (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID           NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Ornament / collateral
  metal_type      VARCHAR(10)    NOT NULL DEFAULT 'Gold'
                                 CHECK (metal_type IN ('Gold','Silver')),
  weight_grams    NUMERIC(10,3),
  purity_percent  NUMERIC(5,2),
  ornament_value  NUMERIC(14,2), -- estimated value at time of loan

  -- Loan financial terms
  principal       NUMERIC(14,2)  NOT NULL CHECK (principal > 0),
  interest_rate   NUMERIC(6,4)   NOT NULL CHECK (interest_rate > 0),
                                 -- stored as the ₹X per ₹100/month value (e.g. 2.5)
  start_date      DATE           NOT NULL,

  -- Status
  is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
  closed_at       TIMESTAMPTZ,
  description     TEXT,

  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_records_customer
  ON loan_records (customer_id);

CREATE INDEX IF NOT EXISTS idx_loan_records_active
  ON loan_records (customer_id, is_active);

-- =============================================================================
-- TABLE: payments
-- Append-only ledger — never update or delete rows.
-- Each row is one payment event for one loan record.
-- =============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id         UUID           NOT NULL REFERENCES loan_records(id) ON DELETE CASCADE,
  customer_id     UUID           NOT NULL REFERENCES customers(id)    ON DELETE CASCADE,

  payment_date    DATE           NOT NULL DEFAULT CURRENT_DATE,
  amount          NUMERIC(14,2)  NOT NULL CHECK (amount > 0),
  payment_method  VARCHAR(50)    DEFAULT 'Cash'
                                 CHECK (payment_method IN ('Cash','UPI','Bank Transfer','Cheque','Other')),
  notes           TEXT,

  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_loan
  ON payments (loan_id);

CREATE INDEX IF NOT EXISTS idx_payments_customer
  ON payments (customer_id);

CREATE INDEX IF NOT EXISTS idx_payments_date
  ON payments (payment_date DESC);

-- =============================================================================
-- FUNCTION + TRIGGER: auto-update updated_at on row change
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_updated_at   ON customers;
DROP TRIGGER IF EXISTS trg_loan_records_updated_at ON loan_records;

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_loan_records_updated_at
  BEFORE UPDATE ON loan_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- VIEW: customer_summary
-- Pre-computed per-customer financial summary used by the dashboard and
-- customer list. Avoids repeating this logic in every API query.
-- =============================================================================
CREATE OR REPLACE VIEW customer_summary AS
SELECT
  c.id                                               AS customer_id,
  c.name,
  c.phone,
  c.address,
  c.created_at,
  c.updated_at,

  -- Active loan count
  COUNT(DISTINCT l.id) FILTER (WHERE l.is_active)    AS active_loans,

  -- Latest active loan's principal (NULL if no active loan)
  (
    SELECT principal FROM loan_records
    WHERE customer_id = c.id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1
  )                                                   AS latest_principal,

  -- Latest active loan's interest rate
  (
    SELECT interest_rate FROM loan_records
    WHERE customer_id = c.id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1
  )                                                   AS latest_rate,

  -- Latest active loan's start date
  (
    SELECT start_date FROM loan_records
    WHERE customer_id = c.id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1
  )                                                   AS loan_start_date,

  -- Total amount paid across ALL loans for this customer
  COALESCE(SUM(p.amount), 0)                         AS total_paid,

  -- Last payment date
  MAX(p.payment_date)                                AS last_payment_date

FROM customers c
LEFT JOIN loan_records l ON l.customer_id = c.id
LEFT JOIN payments     p ON p.customer_id = c.id
GROUP BY c.id, c.name, c.phone, c.address, c.created_at, c.updated_at;

-- =============================================================================
-- SAMPLE SEED DATA (optional — comment out for production)
-- =============================================================================
/*
INSERT INTO customers (name, phone, address) VALUES
  ('Rahul Sharma',   '9876543210', '12 MG Road, Chennai'),
  ('Priya Menon',    '9123456789', '45 Anna Nagar, Chennai'),
  ('Suresh Kumar',   '9988776655', '8 T Nagar, Chennai');

INSERT INTO loan_records (customer_id, metal_type, principal, interest_rate, start_date)
SELECT id, 'Gold', 50000, 2.5, '2026-01-01' FROM customers WHERE phone = '9876543210';

INSERT INTO loan_records (customer_id, metal_type, principal, interest_rate, start_date)
SELECT id, 'Silver', 20000, 2.0, '2026-03-15' FROM customers WHERE phone = '9123456789';
*/

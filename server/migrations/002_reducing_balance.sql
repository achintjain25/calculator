-- =============================================================================
-- Migration 002: Reducing Balance Interest Model
-- Adds interest_paid / principal_paid columns to payments table so each
-- payment records exactly how much cleared interest vs. reduced principal.
-- Run: psql -U postgres -d rj_jewellers -f 002_reducing_balance.sql
-- =============================================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS interest_paid   NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS principal_paid  NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_after   NUMERIC(14,2);  -- principal remaining after this payment

-- Back-fill existing rows: mark entire amount as principal_paid (conservative)
UPDATE payments SET
  interest_paid  = 0,
  principal_paid = amount,
  balance_after  = NULL
WHERE interest_paid = 0 AND principal_paid = 0;

COMMENT ON COLUMN payments.interest_paid  IS 'Portion of payment that cleared accrued interest';
COMMENT ON COLUMN payments.principal_paid IS 'Portion of payment that reduced outstanding principal';
COMMENT ON COLUMN payments.balance_after  IS 'Remaining principal immediately after this payment';

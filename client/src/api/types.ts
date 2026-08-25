// ─── Shared client-side types mirroring server types ─────────────────────────

export interface Customer {
  id:         string
  name:       string
  phone:      string
  address:    string | null
  notes:      string | null
  created_at: string
  updated_at: string
}

export interface CustomerSummary {
  customer_id:       string
  name:              string
  phone:             string
  address:           string | null
  created_at:        string
  updated_at:        string
  active_loans:      number
  latest_principal:  string | null
  latest_rate:       string | null
  loan_start_date:   string | null
  total_paid:        string
  last_payment_date: string | null
}

export interface LoanRecord {
  id:             string
  customer_id:    string
  metal_type:     'Gold' | 'Silver'
  weight_grams:   string | null
  purity_percent: string | null
  ornament_value: string | null
  principal:      string
  interest_rate:  string
  start_date:     string
  is_active:      boolean
  closed_at:      string | null
  description:    string | null
  created_at:     string
  updated_at:     string
  total_paid?:    string
}

export interface Payment {
  id:              string
  loan_id:         string
  customer_id:     string
  payment_date:    string
  amount:          string
  payment_method:  string
  notes:           string | null
  interest_paid:   string
  principal_paid:  string
  balance_after:   string | null
  created_at:      string
  customer_name?:  string
  customer_phone?: string
  loan_principal?: string
  loan_rate?:      string
  loan_start_date?: string
  loan_metal_type?: string
}

export interface LoanSegment {
  from_date:          string
  to_date:            string
  opening_principal:  number
  days:               number
  months:             number
  interest_accrued:   number
  payment?: {
    payment_date:   string
    amount:         number
    payment_method: string
    notes:          string | null
    interest_paid:  number
    principal_paid: number
    balance_after:  number
  }
}

export interface InterestBreakdown {
  loan_id:            string
  original_principal: number
  current_principal:  number
  principal:          number   // alias for current_principal
  interest_rate:      number
  start_date:         string
  to_date:            string
  total_days:         number
  total_months:       number
  interest:           number   // interest in the current open segment
  total_interest:     number   // all interest ever accrued
  total_payable:      number   // current_principal + current segment interest
  total_paid:         number
  remaining:          number
  segments:           LoanSegment[]
}

export interface DashboardStats {
  total_customers:  string
  active_loans:     string
  total_principal:  string
  total_paid:       string
  total_outstanding: string
  overdue_count:    string
}

export interface TopDue {
  id:               string
  name:             string
  phone:            string
  loan_id:          string
  /** Current principal after reducing-balance payments, not the original */
  principal:        string
  /** Principal at origination */
  original_principal: string
  interest_rate:    string
  start_date:       string
  metal_type:       string
  days_elapsed:     number
  /** Interest still unpaid: carried-over shortfall + the current open period */
  interest_accrued: string
  total_payable:    string
  total_paid:       string
  outstanding:      string
}

export interface CreateCustomerPayload {
  name:     string
  phone:    string
  address?: string
  notes?:   string
}

export interface CreateLoanPayload {
  customer_id:    string
  metal_type?:    'Gold' | 'Silver'
  weight_grams?:  number
  purity_percent?: number
  ornament_value?: number
  principal:      number
  interest_rate:  number
  start_date:     string
  description?:   string
}

export interface BillItem {
  id?:             string
  bill_id?:        string
  item_number?:    number
  description:     string
  metal_type:      'Gold' | 'Silver' | 'Other'
  weight_grams?:   number | null
  purity_percent?: number | null
  rate_per_gram?:  number | null
  making_charges:  number
  line_total:      number
}

export interface Bill {
  id:               string
  bill_number:      string
  bill_date:        string
  customer_id?:     string | null
  customer_name:    string
  customer_phone?:  string | null
  customer_address?: string | null
  subtotal:         string
  discount:         string
  total_amount:     string
  amount_paid:      string
  balance_due:      string
  payment_method:   string
  notes?:           string | null
  status:           'paid' | 'partial' | 'unpaid'
  created_at:       string
  updated_at:       string
  item_count?:      number
  items?:           BillItem[]
}

export interface CreateBillPayload {
  bill_date?:        string
  customer_id?:      string
  customer_name:     string
  customer_phone?:   string
  customer_address?: string
  items:             BillItem[]
  discount?:         number
  amount_paid?:      number
  payment_method?:   string
  notes?:            string
}

export interface CreatePaymentPayload {
  loan_id:         string
  customer_id:     string
  payment_date?:   string
  amount:          number
  payment_method?: string
  notes?:          string
}

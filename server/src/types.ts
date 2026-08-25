// Shared TypeScript types used across routes

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
  latest_principal:  string | null  // NUMERIC comes as string from pg
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
}

export interface Payment {
  id:             string
  loan_id:        string
  customer_id:    string
  payment_date:   string
  amount:         string
  payment_method: string
  notes:          string | null
  interest_paid:  string
  principal_paid: string
  balance_after:  string | null
  created_at:     string
}

export interface DashboardStats {
  total_customers: string
  active_loans:    string
  total_principal: string
  total_paid:      string
  total_outstanding: string
  overdue_count:   string
}

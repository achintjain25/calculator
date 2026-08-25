import api from './client'
import type { LoanRecord, InterestBreakdown, CreateLoanPayload } from './types'

export const loansApi = {
  getByCustomer: async (customerId: string) => {
    const res = await api.get<{ data: LoanRecord[] }>(`/loans/customer/${customerId}`)
    return res.data.data
  },

  getById: async (id: string) => {
    const res = await api.get<{ data: LoanRecord }>(`/loans/${id}`)
    return res.data.data
  },

  create: async (payload: CreateLoanPayload) => {
    const res = await api.post<{ data: LoanRecord }>('/loans', payload)
    return res.data.data
  },

  update: async (id: string, payload: Partial<CreateLoanPayload & { is_active: boolean }>) => {
    const res = await api.patch<{ data: LoanRecord }>(`/loans/${id}`, payload)
    return res.data.data
  },

  getInterestToDate: async (id: string, date?: string) => {
    const res = await api.get<{ data: InterestBreakdown }>(
      `/loans/${id}/interest-to-date`,
      { params: date ? { date } : {} }
    )
    return res.data.data
  },
}

import api from './client'
import type { Payment, CreatePaymentPayload } from './types'

export const paymentsApi = {
  getByLoan: async (loanId: string) => {
    const res = await api.get<{ data: Payment[] }>(`/payments/loan/${loanId}`)
    return res.data.data
  },

  getByCustomer: async (customerId: string) => {
    const res = await api.get<{ data: Payment[] }>(`/payments/customer/${customerId}`)
    return res.data.data
  },

  getRecent: async (limit = 20) => {
    const res = await api.get<{ data: Payment[] }>('/payments/recent', { params: { limit } })
    return res.data.data
  },

  create: async (payload: CreatePaymentPayload) => {
    const res = await api.post<{ data: Payment }>('/payments', payload)
    return res.data.data
  },
}

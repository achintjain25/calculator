import api from './client'
import type { Bill, BillItem, CreateBillPayload } from './types'

export const billsApi = {
  getAll: async (search?: string) => {
    const res = await api.get<{ data: Bill[]; count: number }>('/bills', {
      params: search ? { search } : {},
    })
    return res.data
  },

  getById: async (id: string) => {
    const res = await api.get<{ data: Bill & { items: BillItem[] } }>(`/bills/${id}`)
    return res.data.data
  },

  getNextNumber: async () => {
    const res = await api.get<{ data: { bill_number: string } }>('/bills/next-number')
    return res.data.data.bill_number
  },

  create: async (payload: CreateBillPayload) => {
    const res = await api.post<{ data: Bill & { items: BillItem[] } }>('/bills', payload)
    return res.data.data
  },

  /**
   * A bill is a financial record, so the server refuses to delete one unless
   * `force` is set. The UI confirms with the user before passing it through.
   */
  delete: async (id: string, force = false) => {
    await api.delete(`/bills/${id}`, { params: force ? { force: 'true' } : {} })
  },
}

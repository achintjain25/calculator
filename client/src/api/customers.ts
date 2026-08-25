import api from './client'
import type {
  CustomerSummary, Customer,
  CreateCustomerPayload,
} from './types'

export const customersApi = {
  getAll: async (params?: { search?: string; sort?: string; order?: string }) => {
    const res = await api.get<{ data: CustomerSummary[]; count: number }>('/customers', { params })
    return res.data
  },

  getById: async (id: string) => {
    const res = await api.get<{ data: CustomerSummary }>(`/customers/${id}`)
    return res.data.data
  },

  getByPhone: async (phone: string) => {
    const res = await api.get<{ data: CustomerSummary }>(`/customers/phone/${encodeURIComponent(phone)}`)
    return res.data.data
  },

  create: async (payload: CreateCustomerPayload) => {
    const res = await api.post<{ data: Customer }>('/customers', payload)
    return res.data.data
  },

  update: async (id: string, payload: Partial<CreateCustomerPayload>) => {
    const res = await api.patch<{ data: Customer }>(`/customers/${id}`, payload)
    return res.data.data
  },

  /**
   * Deleting a customer cascades to their loans and payments, so the server
   * refuses with 409 unless `force` is set. The UI asks the user to confirm
   * first, then passes force through.
   */
  delete: async (id: string, force = false) => {
    await api.delete(`/customers/${id}`, { params: force ? { force: 'true' } : {} })
  },
}

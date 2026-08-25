import api from './client'
import type { DashboardStats, TopDue } from './types'

export const dashboardApi = {
  getStats: async () => {
    const res = await api.get<{ data: DashboardStats }>('/dashboard/stats')
    return res.data.data
  },

  getTopDues: async () => {
    const res = await api.get<{ data: TopDue[] }>('/dashboard/top-dues')
    return res.data.data
  },
}

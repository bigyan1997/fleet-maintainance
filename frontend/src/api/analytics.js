import { api } from './client'

export async function fetchAnalytics(filters = {}) {
  const res = await api.get('/analytics/', { params: filters })
  return res.data
}

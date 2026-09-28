import { api } from './client'

export async function fetchDashboard() {
  const res = await api.get('/dashboard/')
  return res.data
}

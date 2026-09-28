import { api } from './client'

export async function fetchAlerts() {
  const res = await api.get('/alerts/')
  return res.data
}

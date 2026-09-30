import { api } from './client'

export async function fetchWashes() {
  const res = await api.get('/washes/')
  return res.data
}

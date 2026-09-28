import { api } from './client'

// { sheet } — URL for the header shortcut; may be null if not configured.
export async function fetchLinks() {
  const res = await api.get('/links/')
  return res.data
}

import { api } from './client'

// Which frontend build the server is currently serving (see AppVersionView).
export async function fetchAppVersion() {
  const res = await api.get('/version/')
  return res.data.version
}

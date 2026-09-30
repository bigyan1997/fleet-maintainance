import { api } from './client'

// Drivers
export const fetchDrivers = async () => (await api.get('/drivers/')).data
export const createDriver = async (data) => (await api.post('/drivers/', data)).data
export const updateDriver = async (id, data) => (await api.patch(`/drivers/${id}/`, data)).data
export const deleteDriver = async (id) => api.delete(`/drivers/${id}/`)

// One field on a van (driver, tyre interval…)
export const patchVehicle = async (id, data) => (await api.patch(`/vehicles/${id}/`, data)).data

// Documents
export const fetchAttachments = async (filters) => (await api.get('/attachments/', { params: filters })).data
export async function uploadAttachment({ file, kind, vehicle, service, incident }) {
  const form = new FormData()
  form.append('file', file)
  form.append('kind', kind)
  if (vehicle) form.append('vehicle', vehicle)
  if (service) form.append('service', service)
  if (incident) form.append('incident', incident)
  return (await api.post('/attachments/', form)).data
}
export const deleteAttachment = async (id) => api.delete(`/attachments/${id}/`)

// Activity, budgets, trends, weekly email
export const fetchActivity = async (filters = {}) => (await api.get('/activity/', { params: filters })).data
export const fetchBudget = async () => (await api.get('/budget/')).data
export const saveBudget = async (data) => (await api.put('/budget/', data)).data
export const fetchFuelTrends = async () => (await api.get('/fuel-trends/')).data
export const fetchWeeklySummary = async () => (await api.get('/weekly-summary/')).data

// Team
export const fetchUsers = async () => (await api.get('/auth/users/')).data
export const createUser = async (data) => (await api.post('/auth/users/', data)).data
export const setUserActive = async (id, active) => (await api.patch(`/auth/users/${id}/`, { active })).data
export const changePassword = async (data) => (await api.post('/auth/password/', data)).data

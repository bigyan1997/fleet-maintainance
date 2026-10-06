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

// Activity, budgets, trends
export const fetchActivity = async (filters = {}) => (await api.get('/activity/', { params: filters })).data
export const fetchBudget = async () => (await api.get('/budget/')).data
export const saveBudget = async (data) => (await api.put('/budget/', data)).data
export const fetchFuelTrends = async () => (await api.get('/fuel-trends/')).data


// Mechanics / workshops
export const fetchMechanics = async () => (await api.get('/mechanics/')).data
export const createMechanic = async (data) => (await api.post('/mechanics/', data)).data
export const updateMechanic = async (id, data) => (await api.patch(`/mechanics/${id}/`, data)).data
export const deleteMechanic = async (id) => api.delete(`/mechanics/${id}/`)

// Tolls (monthly E-Toll statement)
export const fetchTolls = async (statement) => (await api.get('/tolls/', { params: statement ? { statement } : {} })).data
export const deleteTollStatement = async (id) => api.delete(`/tolls/${id}/`)
export async function uploadTollStatement(file, confirm = false) {
  const form = new FormData()
  form.append('file', file)
  if (confirm) form.append('confirm', '1')
  return (await api.post('/toll-import/', form)).data
}
export const setTollDone = async (id, key, done) => (await api.post(`/tolls/${id}/done/`, { key, done })).data

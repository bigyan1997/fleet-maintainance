import { api } from './client'

export async function fetchFuelLogs(filters = {}) {
  const res = await api.get('/fuel-logs/', { params: filters })
  return res.data
}

export async function createFuelLog(data) {
  const res = await api.post('/fuel-logs/', data)
  return res.data
}

export async function updateFuelLog(id, data) {
  const res = await api.put(`/fuel-logs/${id}/`, data)
  return res.data
}

export async function deleteFuelLog(id) {
  await api.delete(`/fuel-logs/${id}/`)
}

// Monthly fuel card statement: no assignments -> preview, with them -> import.
export async function uploadFuelStatement(file, assignments) {
  const form = new FormData()
  form.append('file', file)
  if (assignments) form.append('assignments', JSON.stringify(assignments))
  const res = await api.post('/fuel-import/', form)
  return res.data
}

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

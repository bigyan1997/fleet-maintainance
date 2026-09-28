import { api } from './client'

export async function fetchIncidents(filters = {}) {
  const res = await api.get('/incidents/', { params: filters })
  return res.data
}

export async function createIncident(data) {
  const res = await api.post('/incidents/', data)
  return res.data
}

export async function updateIncident(id, data) {
  const res = await api.put(`/incidents/${id}/`, data)
  return res.data
}

export async function deleteIncident(id) {
  await api.delete(`/incidents/${id}/`)
}

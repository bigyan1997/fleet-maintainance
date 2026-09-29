import { api } from './client'

export async function fetchServices(filters = {}) {
  const res = await api.get('/services/', { params: filters })
  return res.data
}

export async function createService(data) {
  const res = await api.post('/services/', data)
  return res.data
}

export async function updateService(id, data) {
  const res = await api.put(`/services/${id}/`, data)
  return res.data
}

export async function deleteService(id) {
  await api.delete(`/services/${id}/`)
}

export async function setServiceStatus(id, status) {
  const res = await api.patch(`/services/${id}/`, { status })
  return res.data
}

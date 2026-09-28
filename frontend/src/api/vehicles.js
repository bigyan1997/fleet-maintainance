import { api } from './client'

export async function fetchVehicles(search = '') {
  const res = await api.get('/vehicles/', { params: { search } })
  return res.data
}

export async function fetchVehicle(id) {
  const res = await api.get(`/vehicles/${id}/`)
  return res.data
}

export async function createVehicle(data) {
  const res = await api.post('/vehicles/', data)
  return res.data
}

export async function updateVehicle(id, data) {
  const res = await api.put(`/vehicles/${id}/`, data)
  return res.data
}

export async function deleteVehicle(id) {
  await api.delete(`/vehicles/${id}/`)
}

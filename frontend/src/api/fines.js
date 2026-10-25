import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export const fetchFines = async () => (await api.get('/fines/')).data
export const createFine = async (data) => (await api.post('/fines/', data)).data
export const updateFine = async (id, data) => (await api.patch(`/fines/${id}/`, data)).data
export const deleteFine = async (id) => api.delete(`/fines/${id}/`)

export const useFines = () => useQuery({ queryKey: ['fines'], queryFn: fetchFines })

export const FINE_KINDS = ['Speeding', 'Parking', 'Camera / red light', 'Toll', 'Other']

import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export const fetchHomeNotes = async () => (await api.get('/home-notes/')).data
export const addHomeNote = async (text) => (await api.post('/home-notes/', { text })).data
export const editHomeNote = async ({ id, text }) => (await api.patch(`/home-notes/${id}/`, { text })).data
export const deleteHomeNote = async (id) => api.delete(`/home-notes/${id}/`)

export const useHomeNotes = () => useQuery({ queryKey: ['home-notes'], queryFn: fetchHomeNotes })

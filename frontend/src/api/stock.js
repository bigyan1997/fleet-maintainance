import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export const fetchStock = async () => (await api.get('/stock/')).data
export const createStockItem = async (data) => (await api.post('/stock/', data)).data
export const updateStockItem = async (id, data) => (await api.patch(`/stock/${id}/`, data)).data
export const deleteStockItem = async (id) => api.delete(`/stock/${id}/`)
// kind is 'use' (takes some off) or 'add' (puts some on).
export const addStock = async (id, kind, amount) => (await api.post(`/stock/${id}/${kind}/`, { amount })).data
export const fetchStockMoves = async (id) => (await api.get(`/stock/${id}/moves/`)).data

export const useStock = () => useQuery({ queryKey: ['stock'], queryFn: fetchStock })

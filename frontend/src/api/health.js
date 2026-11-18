import { useQuery } from '@tanstack/react-query'
import { api } from './client'

// What is quietly wrong behind the scenes: [{ kind, text }], empty when all is well.
export const fetchHealth = async () => (await api.get('/health/')).data

export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 5 * 60 * 1000, staleTime: 60 * 1000 })

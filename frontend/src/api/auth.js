import { api } from './client'

export async function fetchCsrf() {
  await api.get('/auth/csrf/')
}

export async function login(email, password) {
  await fetchCsrf()
  const res = await api.post('/auth/login/', { email, password })
  return res.data
}

export async function googleLogin(credential) {
  await fetchCsrf()
  const res = await api.post('/auth/google-login/', { credential })
  return res.data
}

export async function logout() {
  await api.post('/auth/logout/')
}

export async function me() {
  const res = await api.get('/auth/me/')
  return res.data
}

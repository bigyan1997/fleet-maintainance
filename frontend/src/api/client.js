import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
})

// If the server says "not signed in" (401/403) on any page request, tell the
// app so it can show the sign-in page with a clear message instead of blank data.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status
    const url = err.config?.url ?? ''
    if ((status === 401 || status === 403) && !url.startsWith('/auth/')) {
      window.dispatchEvent(new Event('session-expired'))
    }
    return Promise.reject(err)
  },
)

import { api } from './client'

export async function fetchFuelLogs(filters = {}) {
  const res = await api.get('/fuel-logs/', { params: filters })
  return res.data
}

// The statements imported so far, newest first: [{ date, lines, total, pdfUrl }].
export async function fetchFuelStatements() {
  const res = await api.get('/fuel-statements/')
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

// Monthly fuel card statement: no assignments -> preview, with them -> import.
// `pdf` (optional) is the statement's PDF, kept in Google Drive beside the TXT.
export async function uploadFuelStatement(file, assignments, pdf) {
  const form = new FormData()
  form.append('file', file)
  if (assignments) form.append('assignments', JSON.stringify(assignments))
  if (assignments && pdf) form.append('pdf', pdf)
  const res = await api.post('/fuel-import/', form)
  return res.data
}

// Add (or replace) the PDF of a statement that is already imported.
export async function uploadFuelStatementPdf(date, file) {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post(`/fuel-statements/${date}/pdf/`, form)
  return res.data
}

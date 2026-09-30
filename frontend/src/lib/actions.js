import { createContext, useContext } from 'react'

// App-wide actions any page can call: open a form as a pop-up, show a toast.
// openForm(kind, record) — kind is 'service' | 'fuel' | 'incident' | 'vehicle'
// | 'wash' | 'fuel-import'; record is the row to edit, or { vehicle: id } to
// start a new one for a particular van.
export const ActionsContext = createContext({ openForm: () => {}, toast: () => {} })

export function useActions() {
  return useContext(ActionsContext)
}

const inputClass =
  'w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm focus:outline-none focus:border-primary'

export function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[#444]">{label}</label>
      {children}
    </div>
  )
}

export function TextInput({ value, onChange, ...rest }) {
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} {...rest} />
}

export function NumberInput({ value, onChange, ...rest }) {
  return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} {...rest} />
}

export function DateInput({ value, onChange, ...rest }) {
  return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} {...rest} />
}

export function SelectInput({ value, onChange, options, placeholder, ...rest }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

export function FormRow({ children }) {
  return <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
}

export function SectionLabel({ children }) {
  return (
    <div className="mt-5 mb-2.5 border-t border-line pt-5 text-[11px] font-semibold tracking-wide text-off uppercase first:mt-0 first:border-0 first:pt-0">
      {children}
    </div>
  )
}

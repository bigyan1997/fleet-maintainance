import { fetchVehicles } from '../api/vehicles'
import { fetchServices } from '../api/services'
import { fetchIncidents } from '../api/incidents'
import { fetchFuelLogs } from '../api/fuelLogs'
import { fmtDate } from '../lib/formatDate'

function download(content, filename, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function esc(v) {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
}

const DATE_COLS = new Set(['date', 'rego_expiry', 'insurance_expiry', 'resolved_date'])

function toCSV(rows, cols) {
  const cell = (r, c) => esc(DATE_COLS.has(c) ? fmtDate(r[c]) : r[c])
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r, c)).join(','))].join('\n')
}

async function fetchAll(fetchFn) {
  const res = await fetchFn({ page_size: 5000 })
  return res.results ?? res // vehicles isn't paginated, services/incidents/fuel are
}

export function ExportView() {
  const handleExcel = async () => {
    // Loaded on demand — xlsx is a heavy dependency, no reason to ship it in
    // the main bundle for people who never open the Export tab.
    const XLSX = await import('xlsx')
    const [vehicles, services, incidents, fuel] = await Promise.all([
      fetchVehicles(''),
      fetchAll(fetchServices),
      fetchAll(fetchIncidents),
      fetchAll(fetchFuelLogs),
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        vehicles.map((v) => ({
          Make: v.make, Model: v.model, Year: v.year, Rego: v.rego, VIN: v.vin,
          'Vehicle Number': v.vehicle_number, 'Fuel Card': v.fuel_card_number, 'Fuel Type': v.fuel_type,
          'Odometer (km)': v.odometer, 'Rego Expiry': fmtDate(v.rego_expiry), 'Insurance Expiry': fmtDate(v.insurance_expiry),
          'Service Interval (km)': v.service_interval_km, 'Tyre Interval (km)': v.tyre_interval_km,
        })),
      ),
      'Vehicles',
    )
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        services.map((s) => ({
          Vehicle: s.vehicleLabel, 'Service Type': s.service_type, Date: fmtDate(s.date),
          'Odometer (km)': s.odometer, 'Cost ($)': s.cost, 'Next Due': s.next_due, Status: s.status, 'Issues for Mechanic': s.issues, 'Work Done / Parts': s.notes,
        })),
      ),
      'Service History',
    )
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        incidents.map((x) => ({
          Vehicle: x.vehicleLabel, Date: fmtDate(x.date), Type: x.incident_type, Severity: x.severity,
          Location: x.location, Description: x.description, 'Cost ($)': x.cost, Status: x.status, Updates: x.notes,
          Resolution: x.resolution, 'Resolved Date': fmtDate(x.resolved_date),
        })),
      ),
      'Incidents',
    )
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        fuel.map((f) => ({
          Vehicle: f.vehicleLabel, Date: fmtDate(f.date), Litres: f.litres, 'Cost ($)': f.cost,
          'Price Per Litre ($)': f.pricePerLitre, 'Odometer (km)': f.odometer, 'Invoice Number': f.invoice_number, Notes: f.notes,
        })),
      ),
      'Fuel Log',
    )
    XLSX.writeFile(wb, 'fleet-maintenance.xlsx')
  }

  const handleCSV = async (which) => {
    if (which === 'vehicles') {
      const vehicles = await fetchVehicles('')
      download(
        toCSV(vehicles, ['make', 'model', 'year', 'rego', 'vin', 'vehicle_number', 'fuel_card_number', 'fuel_type', 'odometer', 'rego_expiry', 'insurance_expiry', 'service_interval_km', 'tyre_interval_km']),
        'fleet-vehicles.csv',
        'text/csv',
      )
    } else if (which === 'services') {
      const rows = await fetchAll(fetchServices)
      download(toCSV(rows, ['vehicleLabel', 'service_type', 'date', 'odometer', 'cost', 'next_due', 'status', 'issues', 'notes']), 'fleet-services.csv', 'text/csv')
    } else if (which === 'incidents') {
      const rows = await fetchAll(fetchIncidents)
      download(toCSV(rows, ['vehicleLabel', 'date', 'incident_type', 'severity', 'location', 'description', 'cost', 'status', 'notes', 'resolution', 'resolved_date']), 'fleet-incidents.csv', 'text/csv')
    } else if (which === 'fuel') {
      const rows = await fetchAll(fetchFuelLogs)
      download(toCSV(rows, ['vehicleLabel', 'date', 'litres', 'cost', 'pricePerLitre', 'odometer', 'invoice_number', 'notes']), 'fleet-fuel.csv', 'text/csv')
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-line bg-white p-5">
        <h3 className="mb-1.5 text-sm font-semibold text-ink">Export to Excel</h3>
        <p className="mb-4 text-[13px] leading-relaxed text-off">
          Download the current fleet data as an Excel workbook with separate Vehicles, Service History, Incidents and Fuel Log sheets.
        </p>
        <button onClick={handleExcel} className="rounded-md bg-ok px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90">
          Export Excel workbook (.xlsx)
        </button>
      </div>
      <div className="rounded-lg border border-line bg-white p-5">
        <h3 className="mb-1.5 text-sm font-semibold text-ink">Export to CSV</h3>
        <p className="mb-4 text-[13px] leading-relaxed text-off">Download vehicles or service history as individual CSV files.</p>
        <div className="flex flex-col gap-2">
          <button onClick={() => handleCSV('vehicles')} className="rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#f5f5f5]">Export vehicles CSV</button>
          <button onClick={() => handleCSV('services')} className="rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#f5f5f5]">Export service history CSV</button>
          <button onClick={() => handleCSV('incidents')} className="rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#f5f5f5]">Export incidents CSV</button>
          <button onClick={() => handleCSV('fuel')} className="rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#f5f5f5]">Export fuel log CSV</button>
        </div>
      </div>
    </div>
  )
}

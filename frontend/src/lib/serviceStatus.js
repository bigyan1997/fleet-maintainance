// A service job's progress, in order. Must match SERVICE_STATUS_CHOICES in
// backend/fleet/models.py.
export const SERVICE_STATUSES = ['Booked', 'In service', 'Completed, awaiting invoice', 'Invoiced']

export const STATUS_STYLES = {
  Booked: 'bg-[#e8f1fb] text-primary border-[#bcd5ee]',
  'In service': 'bg-warn-bg text-warn border-[#f0dd8a]',
  'Completed, awaiting invoice': 'bg-due-bg text-due border-[#f5b5b5]',
  Invoiced: 'bg-[#f0f0f0] text-off border-line',
}

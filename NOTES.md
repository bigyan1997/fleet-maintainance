# Fleet Maintenance — Project Notes

Running notes on why this project exists, what's been decided, and what state it's in. Context for whoever picks this up next.

## Why this exists

Achieve Cafe Provisions tracked its vehicle fleet through a single static HTML/JS file (`fleet_maintenance_google_sheets_v2.html`, in the shared Google Drive folder `Operations25/Shared HTML Files`) that talked directly to a Google Sheet from the browser via per-user Google OAuth — no backend at all, just `python -m http.server`. This is the same architecture NPD Tracker v1 used before its rewrite, and it hits the same ceiling: no real database, no server-side validation, string-matched (not foreign-keyed) relationships between records.

This project gives it the same upgrade NPD Tracker v2 got: Postgres as the real source of truth, a shared Django login, and a one-way Postgres → Sheets mirror so people can still glance at a spreadsheet.

## Status (2026-09-29)

**Legacy data imported and Sheets mirror live.** `python manage.py import_from_sheet` (run once, with `--dry-run` reviewed first) brought in 11 vehicles, 58 service records, 1 incident and 0 fuel logs from the legacy sheet, resolving each row's text label to a real Vehicle FK. It reads slash dates as DD/MM/YYYY like the legacy app did (its `parseDateToTs()` MM/DD branch was dead code), and flags only the genuinely ambiguous ones — day and month both <= 12 *and* the swapped reading isn't in the future. Two service dates were in the future at import time (Van 9 `07/10/2026`, possibly a US-style 10 Jul; Van 1 `30/09/2026`) and several vans share copy-pasted VINs — imported as-is, left for staff to correct in the app.

The mirror (`fleet/sheets_sync.py`, wired via `fleet/signals.py`) writes to a new sheet ("Fleet Management v2", `FLEET_SHEET_ID`), never the legacy one. Unlike NPD's row-by-row find/update, each push rewrites a whole tab (Vehicles / Service History / Incidents / Fuel Log) — fleet data is small, and a full rewrite can't drift from Postgres. Pushes run on a background thread after commit, same as NPD. `python manage.py sync_sheet` forces a full rewrite. Service account: `fleet-management@fleet-maintenance-500122.iam.gserviceaccount.com` (key in `backend/secrets/`, gitignored) — Editor on the mirror, Viewer on the legacy sheet.

Also fixed: the Incidents list 500'd on every load (`list_incidents()` didn't accept the `date_from`/`date_to` the shared filter helper passes).

**Service status workflow** (later the same day): every ServiceRecord has a `status` — Booked → In service → Completed, awaiting invoice → Invoiced (originally five stages; "Service completed" and "Waiting for invoice" were merged at the business's request). The dashboard leads with per-status counts (click through to a filtered Service History) and a "Jobs in progress" list (everything not Invoiced) with inline status dropdowns; the service form and Service History also edit it, Recent services only displays it. Migration 0002 marked pre-existing past records Invoiced and future-dated ones Booked. The service PATCH endpoint is truly partial (the others still require every field) so the dropdown can send just `{status}`.

**Incident follow-up log**: an incident's single notes field became `IncidentUpdate` — a dated, author-stamped log, append-only by design (no edit/delete). Resolving requires a `resolution` ("what was done", enforced server-side) and stamps `resolved_date`, cleared again if reopened. The API still exposes the joined log as read-only `notes` so Export/CSV didn't need restructuring.

**Also fixed**: Service History / Incidents / Fuel Log all rendered empty — their plain `ViewSet`s ignored `DEFAULT_PAGINATION_CLASS`, while the pages read `{count, results}`. `views._paginated()` now paginates them explicitly.

**Always-on server + UI polish** (still 2026-09-29): the app now runs permanently on this PC the same way NPD Tracker does — `run_server.bat` (collectstatic, then waitress on `0.0.0.0:8001`; NPD has 8000) launched at login by a "Fleet Maintenance Server" shortcut in the Windows Startup folder, minimised. Reachable at `http://192.168.15.17:8001` / `http://DESKTOP-OB7PD9F:8001`; `.env` now has `DJANGO_DEBUG=False` and those hosts in `DJANGO_ALLOWED_HOSTS`. **Pending:** an inbound firewall rule for 8001 needs an admin PowerShell (`New-NetFirewallRule -DisplayName "Fleet Maintenance (8001)" -Direction Inbound -Protocol TCP -LocalPort 8001 -Action Allow -Profile Private,Public`) — until then only this PC can reach it. After frontend changes: `npm run build`, then restart the minimised server window. Also: NPD-style click-to-sort headers on the dashboard tables (`lib/useSort.js`; status sorts in workflow order), every displayed/exported/mirrored date is dd-mm-yyyy (`lib/formatDate.js`; ISO stays the underlying value), and service records gained `issues` — what to tell the mechanic when booking, shown under each Jobs-in-progress row — distinct from `notes` (relabelled "Work done / parts replaced").

**2026-09-30 additions:** Alerts only count *finished* services (Completed/Invoiced) towards "last serviced", note when a due item is already booked, use one 60-day expiry window (`EXPIRY_DUE_SOON_DAYS`, shared with the Fleet badge), and have All/Overdue/Upcoming filters. Fleet cards show an open booking next to "Service due" (`services.open_job()`). A scheduled service's "next due" auto-fills as odometer + the van's interval (form live; `_fill_next_due()` server-side). Van washes: stored as ServiceRecords of type `WASH_SERVICE_TYPE` ("Van wash", done in-house, no cost) but kept out of every service view/figure; own tab (`/api/washes/`) with a 2-week cycle (`WASH_CYCLE_DAYS`), recent-washes list, per-van date picker, and `Vehicle.wash_needed` for take-home vans. Searching "van N" matches exactly that van (`van_number_q()`), not Van 10/11.

### Earlier (2026-09-28)

**Backend and frontend fully built and verified end-to-end** against a real local Postgres database — all 4 entities' CRUD, the odometer-bump business rule, vehicle delete protection, dashboard, alerts, and analytics aggregation were all tested live via real HTTP requests, not just unit-level. Not yet deployed anywhere; not yet connected to any Google Sheet (neither the one-time import from the legacy sheet, nor the outgoing mirror).

## Decisions made building this (deliberately different from a literal port of the legacy app)

- **Real foreign keys, not string matching.** The legacy app matched Service/Incident/Fuel rows to a vehicle by a text label (`"2020 Toyota HiAce"`) built from make/model/year — two vehicles sharing that would have their history silently conflated. `Vehicle` is now a real FK (`on_delete=PROTECT`) from the other three models.
- **Vehicle delete is blocked while it has related records** (service/incident/fuel), same pattern as NPD's Supplier-delete protection, rather than the legacy app's silent orphaning.
- **Logging fuel now also bumps the vehicle's odometer**, same as logging a service — the legacy app only did this for services, which looked like an oversight rather than a deliberate asymmetry.
- **No schema-driven UI** (unlike NPD Tracker's `fields_schema.py`/`GET /api/schema/` machinery). NPD's product fields changed shape repeatedly over its life, which is what justified that complexity; this app's 4 entities have small, stable field sets, so plain per-entity DRF serializers and hand-built React forms are simpler and sufficient.
- **No audit-log/restore-deleted-record feature for v1** (NPD Tracker has one). Fleet's forms are quick, one-off fills rather than NPD's long photo-editing sessions, so the shared-login edit-conflict risk that feature protects against is lower here. Easy to add later if it turns out to matter in practice.
- **"Latest Odometer" (Service History) and "Price Per Litre" (Fuel Log) are not stored columns** — both were stale-prone derived values in the legacy sheet (recomputed at save time, could go stale if edited later). They're computed live instead: `price_per_litre` is a model property, and the vehicle's own `odometer` field is the single source of truth for "current reading" rather than a duplicated column on each service row.
- **Analytics aggregation happens server-side** (Django ORM `TruncMonth` + `Sum`), not client-side JS like the legacy app. The frontend charts are thin renderers over `{label, value}` arrays from `GET /api/analytics/`.
- **A real bug was found and fixed while porting the legacy month-range logic**: the initial Python port of "trailing 12 months" computed 13 months (same calendar month, one year back, inclusive) instead of 12, which showed the current month twice in the monthly-spend chart. Fixed in `fleet/services.py`'s `_month_range()` — verified live against seeded data before moving on.
- **Charts are hand-rolled inline SVG** (`frontend/src/components/charts/`), ported directly from the legacy app's vanilla-JS bar/line chart code — no charting library added, matching NPD's minimal-dependency approach.
- **`xlsx` (SheetJS) has a known, unfixed high-severity npm advisory** (prototype pollution / ReDoS — see `npm audit`). It only matters for *parsing* untrusted spreadsheet files; this app only ever *writes* export files from its own trusted data, so the real risk for this use case is low. It's also lazy-loaded (`await import('xlsx')` inside the Export tab's handler) so the ~140KB gzipped dependency isn't in the main bundle for people who never export.
- **Own visual theme**, not NPD Tracker's earthy moss/clay palette — Fleet Maintenance keeps the legacy app's blue identity (`--color-primary: #185fa5`) for continuity with staff who already know it.

## Not yet done

- Not deployed anywhere yet — no `DEPLOYMENT_NOTES.md`, no live server, no auto-deploy.
- No automated tests written yet (`backend/fleet/tests.py` and `backend/accounts/tests.py` are still the empty stubs from `startapp`/copied from NPD).

## Infra

- **Local dev**: Django on `127.0.0.1:8011`, Vite on port `5174` (proxying `/api` only — no `/media`, since this app has no file uploads). `start-dev.bat`/`stop-dev.bat` run both hidden in the background, same pattern as NPD Tracker.
- **Postgres**: local instance (same Windows Postgres service NPD Tracker uses), database `fleet_management`, role `fleet_maintenance`. Connection details in `backend/.env` (gitignored).
- **GitHub**: `bigyan1997/fleet-maintainance` (public repo, same no-AI-attribution policy as NPD Tracker).

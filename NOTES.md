# Fleet Maintenance — Project Notes

Running notes on why this project exists, what's been decided, and what state it's in. Context for whoever picks this up next.

## Why this exists

Achieve Cafe Provisions tracked its vehicle fleet through a single static HTML/JS file (`fleet_maintenance_google_sheets_v2.html`, in the shared Google Drive folder `Operations25/Shared HTML Files`) that talked directly to a Google Sheet from the browser via per-user Google OAuth — no backend at all, just `python -m http.server`. This is the same architecture NPD Tracker v1 used before its rewrite, and it hits the same ceiling: no real database, no server-side validation, string-matched (not foreign-keyed) relationships between records.

This project gives it the same upgrade NPD Tracker v2 got: Postgres as the real source of truth, a shared Django login, and a one-way Postgres → Sheets mirror so people can still glance at a spreadsheet.

## Status (2026-09-28)

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

- **One-time import from the legacy Google Sheet** into Postgres. Needs: the legacy sheet (`1WBJqRuYX06NG6l7SUeXkBL3JsGPFfqjrKp6zjHNsr0k`) shared with the service account as Viewer first. The legacy app's date-parsing has a real bug worth knowing about before importing: its `parseDateToTs()` "MM/DD/YYYY" branch has a regex identical to the DD/MM/YYYY branch above it, so it's dead code — every ambiguous date has only ever been read as DD/MM/YYYY, even if it was truly entered as MM/DD/YYYY. The import script will need a `--dry-run` mode to flag ambiguous dates for manual review, since this can't be recovered algorithmically.
- **Outgoing one-way Sheets mirror** — needs a brand-new, separate Google Sheet (never the legacy one, to avoid write collisions), shared with the service account as Editor. Should reuse the exact background-thread pattern from NPD's `sheets_sync.py` (a real bug — a Sheets push blocking the HTTP response — was found and fixed there; don't reintroduce it here).
- Not deployed anywhere yet — no `DEPLOYMENT_NOTES.md`, no live server, no auto-deploy.
- No automated tests written yet (`backend/fleet/tests.py` and `backend/accounts/tests.py` are still the empty stubs from `startapp`/copied from NPD).

## Infra

- **Local dev**: Django on `127.0.0.1:8011`, Vite on port `5174` (proxying `/api` only — no `/media`, since this app has no file uploads). `start-dev.bat`/`stop-dev.bat` run both hidden in the background, same pattern as NPD Tracker.
- **Postgres**: local instance (same Windows Postgres service NPD Tracker uses), database `fleet_management`, role `fleet_maintenance`. Connection details in `backend/.env` (gitignored).
- **GitHub**: `bigyan1997/fleet-maintainance` (public repo, same no-AI-attribution policy as NPD Tracker).

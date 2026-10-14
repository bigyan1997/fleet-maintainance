# Fleet Maintenance

Vehicle fleet tracker for Achieve Cafe Provisions — vans, services, incidents, washes, fuel card statements, E-Toll statements, drivers, photos and documents. Django + DRF backend, Postgres database, React + Vite + Tailwind frontend (plain JavaScript). Built the same way as this business's other internal tool, NPD Tracker v2 — a from-scratch rewrite of a Google-Sheets-backed single-page app, moving to Postgres as the real source of truth with a one-way Sheets mirror for people who still want to glance at a spreadsheet.

**Using the app?** See **[USAGE.md](USAGE.md)**: what each screen is for and how to do everyday jobs.

**Status: live on the orders PC, next to NPD Tracker v2 (which has port 8001).** Served by waitress on port 8002 (`run_server.bat`), kept running by `keep-alive.ps1` (scheduled task every 5 minutes) and auto-deployed from `main` by `auto_deploy.ps1` (every 5 minutes; tests, builds, migrates, restarts, rolls back on failure) — same setup as NPD Tracker v2. The database is copied to Google Drive every evening (`backup.vbs`, 30 days kept). Open it at http://orders-hostcomputer:8002 over Tailscale. Project history and decisions are in [NOTES.md](NOTES.md); notes for Claude Code are in [CLAUDE.md](CLAUDE.md) and `docs/claude-memory/`.

## Architecture

- **`backend/`** — Django project. Fleet data lives in **Postgres**, not Google Sheets. A background sync pushes every change to a Google Sheet as a read-only mirror, but the Sheet is not the source of truth — Postgres is.
- **`frontend/`** — React + Vite + Tailwind SPA, plain JavaScript (no TypeScript), built and served by Django (whitenoise), same as NPD Tracker.
- **Statement imports** — the monthly fuel card statement (`fleet/fuel_import.py`, MPDATA TXT file) and the monthly E-Toll statement (`fleet/toll_import.py`, PDF read with `pypdf`).
- **Photos** — issue and damage photos are kept in Google Drive (`Fleet Maintenance Photos/Services|Incidents/<van>/`), through the shared Google account's OAuth token (`backend/fleet/drive.py`; one-time sign-in with `drive_sign_in.bat`). Toll statement PDFs and the documents attached to vans, services and incidents go to Google Drive too (`Tolls/`, `Documents/<van>/`). Without a Drive token (or if Drive fails) files are kept on the server's disk (`backend/media/`) and move to Drive by themselves once it is connected.

- **Backups** — `manage.py backup_database` (`fleet/backup.py`) writes a `pg_dump` file to `backend/logs/backups/` and copies it to Drive (`Backups/`), keeping 30 days. On the server a scheduled task runs it daily at 8 pm through `backup.vbs`. Restore with `pg_restore --clean --if-exists -d fleet_management <file>`.

## One-time setup

### 1. Postgres

Create a database and a dedicated role for the app (via `psql` or pgAdmin's Query Tool):

```sql
CREATE ROLE fleet_maintenance WITH LOGIN PASSWORD 'choose-a-password';
CREATE DATABASE fleet_management OWNER fleet_maintenance;
```

### 2. Backend

```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env`: set `DB_PASSWORD` (from step 1) and a real `DJANGO_SECRET_KEY`.

```
python manage.py migrate
python manage.py createsuperuser
```

### 3. Frontend

```
cd frontend
npm install
npm run build
```

This produces `frontend/dist/`, which Django serves automatically in production.

## Running it locally

Easiest: double-click **`start-dev.bat`** — starts both servers completely in the background (no console windows) and opens the app. Run **`stop-dev.bat`** to stop them.

Or manually, two terminals:

```
cd backend  &&  .venv\Scripts\activate  &&  python manage.py runserver 127.0.0.1:8011
cd frontend &&  npm run dev
```

Open `http://localhost:5174`.

(Ports 8011/5174 rather than NPD Tracker's 8010/5173, so both apps can run side by side on the same machine.)

## Data model

Real Postgres tables with real foreign keys to `Vehicle` (the legacy app matched vehicles by a text label, which could silently conflate two vehicles with the same year/make/model):

- **Vehicle** — make, model, year, rego, VIN, fuel card, toll tag number, odometer, rego expiry, service and tyre intervals, usual driver, off-the-road switch.
- **Driver** and **DriverFile** — licence details, demerit points, date joined, and licence photos.
- **Mechanic** — the workshops used.
- **ServiceRecord** — a service, repair, tyre change or wash logged against a van, with a status (Booked, In service, Completed awaiting invoice, Invoiced).
- **Incident** and **IncidentUpdate** — an accident, breakdown or damage report and its follow-up notes.
- **FuelLog** — a fill-up or card charge, usually from the monthly statement import.
- **TollStatement** and **TollTrip** — a monthly E-Toll statement and its trips and fees.
- **Attachment** — a photo or document on a van, service or incident (stored in Google Drive).
- **ActivityLog** — who changed what and when (shown per van as change history).
- **Budget** — monthly fuel and maintenance budgets.

Business logic (next-service-due, next-tyre-due, the OK/Due soon/Attention status badge, fuel and toll checks) lives in `backend/fleet/services.py`. Analytics aggregation happens server-side in Postgres, not in the browser.

## Features

What each screen does is described in [USAGE.md](USAGE.md). In short:

- **Home**: what needs doing (grouped by urgency), a box per van, work booked or at the mechanic, invoices being waited for, and spending this month.
- **Vans**: a page per van (history, fuel, documents, details, change history), rego dates, drivers and their licences, tyres, QR stickers drivers scan to report a problem or log a wash.
- **Services**: services with a Booked → At mechanic → Waiting for invoice → Done flow, incidents with photos, mechanics.
- **Washes**: a two-weekly wash list.
- **Fuel**: monthly fuel card statement import, matching the statement to the cent, with checks worth asking about.
- **Tolls**: monthly E-Toll PDF import with double charges, weekend and late trips, and big toll days flagged.
- **Reports**: spending, fuel, tolls, budgets, and an Excel/CSV download. Charts are hand-rolled inline SVG, no charting library.
- **Google Sheet mirror**: a read-only copy of the data, rewritten after every change.
- **Shared login**: email + password via Django sessions, one login for the office, on purpose.

## Known gaps (deliberate, see `NOTES.md`)

- Insurance is not tracked, at the owner's request.
- A deleted record cannot be restored from inside the app (changes are recorded per van, and the nightly backup is the fallback).
- No optimistic-concurrency/edit-conflict handling yet, despite the shared login.
- The app is reachable only over Tailscale or the office network, and the server's tasks run only while someone is signed in to Windows there.

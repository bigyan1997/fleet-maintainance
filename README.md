# Fleet Maintenance

Vehicle fleet tracker for Achieve Cafe Provisions — vehicles, service history, incidents and fuel logs. Django + DRF backend, Postgres database, React + Vite + Tailwind frontend (plain JavaScript). Built the same way as this business's other internal tool, NPD Tracker v2 — a from-scratch rewrite of a Google-Sheets-backed single-page app, moving to Postgres as the real source of truth with a one-way Sheets mirror for people who still want to glance at a spreadsheet.

**Using the app?** See **[USAGE.md](USAGE.md)**: what each screen is for and how to do everyday jobs.

**Status: live on the office PC.** Served by waitress on port 8001 (`run_server.bat`), hidden and kept running by `keep-alive.ps1` (a scheduled task checks every 2 minutes and restarts it if needed). Open it at http://DESKTOP-OB7PD9F:8001 on the office network, or http://bigyan-desktop:8001 over Tailscale. Project history and decisions are in [NOTES.md](NOTES.md).

## Architecture

- **`backend/`** — Django project. Fleet data lives in **Postgres**, not Google Sheets. A background sync pushes every change to a Google Sheet as a read-only mirror, but the Sheet is not the source of truth — Postgres is.
- **`frontend/`** — React + Vite + Tailwind SPA, plain JavaScript (no TypeScript). In production it would be built and served by Django directly, same as NPD Tracker.

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

Four entities, all real Postgres tables with a real foreign key to `Vehicle` (the legacy app matched vehicles by a text label, which could silently conflate two vehicles with the same year/make/model):

- **Vehicle** — make, model, year, rego, VIN, vehicle number, fuel card/type, odometer, rego/insurance expiry, service/tyre intervals.
- **ServiceRecord** — a service/repair/registration/etc. logged against a vehicle.
- **Incident** — an accident/breakdown/damage report.
- **FuelLog** — a fuel fill-up.

Business logic (next-service-due, next-tyre-due, the OK/Due soon/Attention status badge) lives in `backend/fleet/services.py`, ported from the legacy app's client-side JS. Analytics aggregation (monthly spend, cost by vehicle/type) happens server-side in Postgres, not in the browser.

## Features

- **Vehicles**: add/edit/delete (blocked while it has service/incident/fuel history — same protection NPD Tracker uses for suppliers), searchable card grid with a live status badge and next-service-due indicator.
- **Service history / Incidents / Fuel log**: filterable, paginated tables with a detail view and inline edit/delete. Logging a service or a fuel fill-up bumps the vehicle's odometer if the new reading is higher.
- **Alerts**: registration/insurance expiring soon, service or tyre replacement due soon — computed server-side.
- **Analytics**: spend metrics plus monthly-spend/fuel line charts and cost-by-vehicle/type bar charts — hand-rolled inline SVG, no charting library.
- **Export**: an Excel workbook (Vehicles/Service History/Incidents/Fuel Log sheets) or individual CSVs.
- **Shared login**: email + password via Django sessions, same as NPD Tracker.

## Known gaps (deliberate, see `NOTES.md`)

- No edit-history/audit-log or restore-deleted-record feature (NPD Tracker has one; this app skips it for now — see NOTES.md for why).
- No optimistic-concurrency/edit-conflict handling yet, despite the shared login.

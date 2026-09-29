"""
One-way Postgres -> Google Sheets mirror. Postgres is the real source of
truth; the sheet (settings.FLEET_SHEET_ID — a brand-new sheet, never the
legacy one) exists so people can still glance at a familiar spreadsheet.

Unlike NPD's row-by-row find/update, each push rewrites a whole tab. Fleet
data is small (hundreds of rows, not tens of thousands), and a full rewrite
can never drift out of step with Postgres — no row-number bookkeeping, no
duplicate rows after a failed push.

Everything here is best-effort: it must never raise into, block, or roll
back the Postgres write that triggered it. Pushes run on a background thread
(a Sheets round trip is seconds, far too slow to hold up a Save click) and
only after the transaction commits (see signals.py).
"""

import logging
import threading

from django.conf import settings
from django.db import close_old_connections
from django.utils import timezone

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# Serialises pushes so two quick saves can't interleave their clear/write calls.
_lock = threading.Lock()


def _date(value):
    return value.strftime("%d-%m-%Y") if value else ""


def _num(value):
    return "" if value is None else str(value)


def _vehicle_rows():
    from .models import Vehicle

    header = [
        "ID", "Make", "Model", "Year", "Rego", "VIN", "Vehicle number", "Fuel card number",
        "Fuel type", "Odometer (km)", "Rego expiry", "Insurance expiry",
        "Service interval (km)", "Tyre interval (km)",
    ]
    rows = [
        [
            v.pk, v.make, v.model, _num(v.year), v.rego, v.vin, v.vehicle_number,
            v.fuel_card_number, v.fuel_type, v.odometer, _date(v.rego_expiry),
            _date(v.insurance_expiry), v.service_interval_km, _num(v.tyre_interval_km),
        ]
        for v in Vehicle.objects.order_by("pk")
    ]
    return header, rows


def _service_rows():
    from .models import ServiceRecord

    header = [
        "ID", "Vehicle ID", "Vehicle", "Rego", "Service type", "Date", "Status", "Odometer (km)", "Cost",
        "Next due", "Issues for mechanic", "Notes",
    ]
    rows = [
        [
            s.pk, s.vehicle_id, str(s.vehicle), s.vehicle.rego, s.service_type, _date(s.date), s.status,
            _num(s.odometer), _num(s.cost), s.next_due, s.issues, s.notes,
        ]
        for s in ServiceRecord.objects.select_related("vehicle").order_by("date", "pk")
    ]
    return header, rows


def _incident_rows():
    from .models import Incident

    header = [
        "ID", "Vehicle ID", "Vehicle", "Rego", "Type", "Date", "Severity", "Location",
        "Description", "Cost", "Status", "Updates", "Resolution", "Resolved date",
    ]
    rows = [
        [
            i.pk, i.vehicle_id, str(i.vehicle), i.vehicle.rego, i.incident_type, _date(i.date),
            i.severity, i.location, i.description, _num(i.cost), i.status,
            "\n".join(str(u) for u in i.updates.all()),
            i.resolution, _date(i.resolved_date),
        ]
        for i in Incident.objects.select_related("vehicle").prefetch_related("updates__author").order_by("date", "pk")
    ]
    return header, rows


def _fuel_rows():
    from .models import FuelLog

    header = [
        "ID", "Vehicle ID", "Vehicle", "Rego", "Date", "Litres", "Cost", "Price per litre",
        "Odometer (km)", "Invoice number", "Notes",
    ]
    rows = [
        [
            f.pk, f.vehicle_id, str(f.vehicle), f.vehicle.rego, _date(f.date), _num(f.litres),
            _num(f.cost), _num(f.price_per_litre), _num(f.odometer), f.invoice_number, f.notes,
        ]
        for f in FuelLog.objects.select_related("vehicle").order_by("date", "pk")
    ]
    return header, rows


# Tab name -> row builder. Service/incident/fuel rows show the vehicle's
# label and rego, so a vehicle edit also refreshes those tabs.
TABS = {
    "Vehicles": _vehicle_rows,
    "Service History": _service_rows,
    "Incidents": _incident_rows,
    "Fuel Log": _fuel_rows,
}
MODEL_TABS = {
    "Vehicle": list(TABS),
    "ServiceRecord": ["Service History"],
    "Incident": ["Incidents"],
    "IncidentUpdate": ["Incidents"],
    "FuelLog": ["Fuel Log"],
}


def configured():
    return bool(settings.FLEET_SHEET_ID)


def _service():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    keyfile = settings.BASE_DIR / settings.FLEET_SHEETS_KEYFILE  # an absolute path in .env wins over BASE_DIR
    creds = service_account.Credentials.from_service_account_file(keyfile, scopes=SCOPES)
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _ensure_tabs(sheets, names):
    meta = sheets.spreadsheets().get(spreadsheetId=settings.FLEET_SHEET_ID, fields="sheets.properties.title").execute()
    existing = {s["properties"]["title"] for s in meta.get("sheets", [])}
    missing = [n for n in names if n not in existing]
    if missing:
        sheets.spreadsheets().batchUpdate(
            spreadsheetId=settings.FLEET_SHEET_ID,
            body={"requests": [{"addSheet": {"properties": {"title": n}}} for n in missing]},
        ).execute()


def push_tabs_sync(names):
    """Rewrite the given tabs from Postgres. Raises on failure — callers that
    must not fail (the background push) wrap it."""
    with _lock:
        sheets = _service()
        _ensure_tabs(sheets, names)
        synced_at = timezone.localtime().strftime("%d-%m-%Y %H:%M")  # Sydney time
        for name in names:
            header, rows = TABS[name]()
            values = [header, *rows, [], [f"Mirrored from Fleet Maintenance at {synced_at} — edits here are overwritten."]]
            sheets.spreadsheets().values().clear(spreadsheetId=settings.FLEET_SHEET_ID, range=f"'{name}'").execute()
            sheets.spreadsheets().values().update(
                spreadsheetId=settings.FLEET_SHEET_ID,
                range=f"'{name}'!A1",
                valueInputOption="RAW",
                body={"values": values},
            ).execute()
        if "Vehicles" in names:
            from .models import Vehicle

            Vehicle.objects.update(sheet_row_synced_at=timezone.now())


def push_all_sync():
    push_tabs_sync(list(TABS))


def push_model(model_name):
    """Queue a background rewrite of the tabs affected by a change to model_name."""
    if not configured():
        return
    names = MODEL_TABS.get(model_name)
    if not names:
        return

    def runner():
        try:
            push_tabs_sync(names)
        except Exception:
            logger.exception("Sheets mirror push failed for %s", model_name)
        finally:
            # This thread isn't managed by Django's request lifecycle, so
            # nothing else closes the DB connection it opened.
            close_old_connections()

    threading.Thread(target=runner, daemon=True).start()

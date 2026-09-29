"""
One-time import from the legacy fleet app's Google Sheet (FLEET_LEGACY_SHEET_ID)
into Postgres. Run with --dry-run first: it reports what would be imported and
flags dates worth checking by hand, then rolls everything back.

The legacy sheet links Service/Incident/Fuel rows to a vehicle by a text label
("<year> <make> <model>"); here that label is resolved to a real Vehicle FK.

Date caveat: the legacy app's parseDateToTs() "MM/DD/YYYY" branch had the same
regex as its DD/MM/YYYY branch, so every slash date was only ever read as
DD/MM/YYYY. This import does the same, and lists the ambiguous ones (day and
month both <= 12) so a human can confirm nobody typed them US-style.
"""

import datetime
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from fleet import sheets_sync, signals
from fleet.models import FuelLog, Incident, IncidentUpdate, ServiceRecord, Vehicle


class DryRun(Exception):
    pass


def _cell(row, header, name):
    try:
        return (row[header.index(name)] or "").strip()
    except (ValueError, IndexError):
        return ""


def _int(value):
    try:
        number = int(float(value.replace(",", "")))
    except ValueError:
        return None
    return number or None  # the legacy sheet uses 0 for "unknown"


def _decimal(value):
    if not value:
        return None
    try:
        return Decimal(value.replace(",", "").replace("$", ""))
    except InvalidOperation:
        return None


class Command(BaseCommand):
    help = "One-time import of the legacy fleet Google Sheet into Postgres."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Report what would be imported, then roll back.")

    def handle(self, *args, dry_run=False, **options):
        if not settings.FLEET_LEGACY_SHEET_ID:
            raise CommandError("FLEET_LEGACY_SHEET_ID is not set in .env.")
        if Vehicle.objects.exists():
            raise CommandError("The database already has vehicles - this is a one-time import into an empty database.")

        self.today = datetime.date.today()
        self.warnings = []
        tabs = self._fetch()

        signals.suspended = True  # one mirror push at the end, not one per row
        try:
            with transaction.atomic():
                counts = self._import(tabs)
                self._report(counts, dry_run)
                if dry_run:
                    raise DryRun
        except DryRun:
            return
        finally:
            signals.suspended = False

        if sheets_sync.configured():
            sheets_sync.push_all_sync()
            self.stdout.write(self.style.SUCCESS("Mirrored everything to the new Google Sheet."))

    def _fetch(self):
        sheets = sheets_sync._service()
        tabs = {}
        for name in ["Vehicles", "Service History", "Incidents", "Fuel Log"]:
            values = sheets.spreadsheets().values().get(
                spreadsheetId=settings.FLEET_LEGACY_SHEET_ID, range=f"'{name}'"
            ).execute().get("values", [])
            header = [h.strip() for h in values[0]] if values else []
            rows = [r for r in values[1:] if any(c.strip() for c in r)]
            tabs[name] = (header, rows)
        return tabs

    def _date(self, value, where):
        if not value:
            return None
        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d/%m/%y"):
            try:
                parsed = datetime.datetime.strptime(value, fmt).date()
                break
            except ValueError:
                continue
        else:
            self.warnings.append(f"{where}: unreadable date {value!r} - row skipped")
            return None
        if fmt.startswith("%d/%m") and parsed.day <= 12 and parsed.day != parsed.month:
            swapped = parsed.replace(month=parsed.day, day=parsed.month)
            if swapped <= self.today:  # a future swap can't be what was meant
                self.warnings.append(
                    f"{where}: {value} read as {parsed:%d %b %Y} (could also be {swapped:%d %b %Y} if typed US-style)"
                )
        if parsed > self.today:
            self.warnings.append(f"{where}: {value} is in the future ({parsed:%d %b %Y})")
        return parsed

    def _import(self, tabs):
        header, rows = tabs["Vehicles"]
        by_label, vins = {}, {}
        for row in rows:
            get = lambda name: _cell(row, header, name)
            vehicle = Vehicle.objects.create(
                make=get("Make"),
                model=get("Model"),
                year=_int(get("Year")),
                rego=get("Rego")[:20],
                vin=get("VIN")[:17],
                vehicle_number=get("Vehicle Number"),
                fuel_card_number=get("Fuel Card"),
                fuel_type=get("Fuel Type"),
                odometer=_int(get("Odometer")) or 0,
                rego_expiry=self._date(get("Rego Expiry"), f"Vehicle {get('Make')}"),
                insurance_expiry=self._date(get("Insurance Expiry"), f"Vehicle {get('Make')}"),
                service_interval_km=_int(get("Service Interval")) or 10000,
                tyre_interval_km=_int(get("Tyre Interval")),
            )
            by_label[f"{get('Year')} {get('Make')} {get('Model')}".strip()] = vehicle
            if vehicle.vin:
                vins.setdefault(vehicle.vin, []).append(vehicle.make)
        for vin, makes in vins.items():
            if len(makes) > 1:
                self.warnings.append(f"VIN {vin} is shared by {', '.join(makes)} - probably a copy-paste in the old sheet")

        counts = {"Vehicles": len(rows), "Service History": 0, "Incidents": 0, "Fuel Log": 0}

        def vehicle_for(tab, n, label):
            vehicle = by_label.get(label)
            if not vehicle:
                self.warnings.append(f"{tab} row {n}: no vehicle matches {label!r} - row skipped")
            return vehicle

        header, rows = tabs["Service History"]
        for n, row in enumerate(rows, start=2):
            get = lambda name: _cell(row, header, name)
            vehicle = vehicle_for("Service History", n, get("Vehicle"))
            date = self._date(get("Date"), f"Service History row {n} ({get('Vehicle')})")
            if not vehicle or not date:
                continue
            next_due = get("Next Due")
            ServiceRecord.objects.create(
                vehicle=vehicle,
                service_type=get("Type"),
                date=date,
                odometer=_int(get("Odometer")),
                cost=_decimal(get("Cost")),
                next_due="" if next_due == "0" else next_due,
                notes=get("Notes"),
                # The legacy sheet had no status: past jobs are done, future ones are bookings.
                status="Booked" if date > self.today else "Invoiced",
            )
            counts["Service History"] += 1

        header, rows = tabs["Incidents"]
        for n, row in enumerate(rows, start=2):
            get = lambda name: _cell(row, header, name)
            vehicle = vehicle_for("Incidents", n, get("Vehicle"))
            date = self._date(get("Date"), f"Incidents row {n} ({get('Vehicle')})")
            if not vehicle or not date:
                continue
            incident = Incident.objects.create(
                vehicle=vehicle,
                incident_type=get("Type") or "Other",
                date=date,
                severity=get("Severity") or "Minor",
                location=get("Location"),
                description=get("Description"),
                cost=_decimal(get("Cost")),
                status=get("Status") or "Open",
            )
            if get("Notes"):
                IncidentUpdate.objects.create(incident=incident, text=get("Notes"))
            counts["Incidents"] += 1

        header, rows = tabs["Fuel Log"]
        for n, row in enumerate(rows, start=2):
            get = lambda name: _cell(row, header, name)
            vehicle = vehicle_for("Fuel Log", n, get("Vehicle"))
            date = self._date(get("Date"), f"Fuel Log row {n} ({get('Vehicle')})")
            litres, cost = _decimal(get("Litres")), _decimal(get("Cost"))
            if not vehicle or not date or litres is None or cost is None:
                continue
            FuelLog.objects.create(
                vehicle=vehicle,
                date=date,
                litres=litres,
                cost=cost,
                odometer=_int(get("Odometer")),
                invoice_number=get("Invoice Number"),
                notes=get("Notes"),
            )
            counts["Fuel Log"] += 1

        return counts

    def _report(self, counts, dry_run):
        verb = "Would import" if dry_run else "Imported"
        for tab, count in counts.items():
            self.stdout.write(f"{verb} {count} {tab}")
        if self.warnings:
            self.stdout.write(self.style.WARNING(f"\n{len(self.warnings)} things to check:"))
            for warning in self.warnings:
                self.stdout.write(f"  - {warning}")
        if dry_run:
            self.stdout.write(self.style.NOTICE("\nDry run - nothing was saved."))

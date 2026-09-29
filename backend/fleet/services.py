from datetime import date

from django.db.models import Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from .models import FuelLog, Incident, ServiceRecord, Vehicle


class ValidationError(Exception):
    pass


class NotFoundError(Exception):
    pass


class HasRelatedRecordsError(Exception):
    """Raised when deleting a vehicle that still has service/incident/fuel
    records — mirrors NPD's Supplier delete-while-in-use protection."""


# ── Business logic (ported from the legacy app's nextServiceDue()/statusBadge()
# and the inlined tyre-interval block in its vehicle-card renderer) ──────────

DUE_SOON_KM_THRESHOLD = 2000
EXPIRY_DUE_SOON_DAYS = 30


def next_service_due(vehicle):
    """km remaining until the next scheduled service, based on the last
    "Scheduled service" record's odometer plus the vehicle's interval.
    Returns None if there's no scheduled-service history yet."""
    last = (
        vehicle.services.filter(service_type="Scheduled service", odometer__gt=0)
        .order_by("-odometer")
        .first()
    )
    if not last:
        return None
    due_at = last.odometer + vehicle.service_interval_km
    return {"due_at": due_at, "km_left": due_at - vehicle.odometer}


def next_tyre_due(vehicle):
    """Same pattern as next_service_due, for "Tyre replacement" records."""
    if not vehicle.tyre_interval_km:
        return None
    last = (
        vehicle.services.filter(service_type="Tyre replacement", odometer__gt=0)
        .order_by("-odometer")
        .first()
    )
    if not last:
        return None
    due_at = last.odometer + vehicle.tyre_interval_km
    return {"due_at": due_at, "km_left": due_at - vehicle.odometer}


def vehicle_status_badge(vehicle):
    """"Attention" (rego/insurance already overdue), "Due soon" (within 30
    days), else "OK". Ported from the legacy app's statusBadge()."""
    today = timezone.localdate()

    def is_over(d):
        return d is not None and d < today

    def is_soon(d):
        return d is not None and not is_over(d) and (d - today).days < EXPIRY_DUE_SOON_DAYS

    if is_over(vehicle.rego_expiry) or is_over(vehicle.insurance_expiry):
        return "attention"
    if is_soon(vehicle.rego_expiry) or is_soon(vehicle.insurance_expiry):
        return "due_soon"
    return "ok"


# ── Vehicle CRUD ──────────────────────────────────────────────────────────


def list_vehicles(search=""):
    qs = Vehicle.objects.all()
    if search:
        qs = qs.filter(
            Q(make__icontains=search)
            | Q(model__icontains=search)
            | Q(rego__icontains=search)
            | Q(vin__icontains=search)
            | Q(vehicle_number__icontains=search)
        )
    return qs


def get_vehicle(pk):
    try:
        return Vehicle.objects.get(pk=pk)
    except Vehicle.DoesNotExist:
        raise NotFoundError(f"Vehicle {pk} not found.")


def delete_vehicle(pk):
    vehicle = get_vehicle(pk)
    related = vehicle.services.count() + vehicle.incidents.count() + vehicle.fuel_logs.count()
    if related:
        raise HasRelatedRecordsError(
            f"This vehicle has {related} linked service/incident/fuel record"
            f"{'s' if related != 1 else ''} and can't be deleted while they exist."
        )
    vehicle.delete()


def _bump_odometer_if_higher(vehicle, odometer):
    if odometer and odometer > vehicle.odometer:
        vehicle.odometer = odometer
        vehicle.save(update_fields=["odometer", "updated_at"])


# ── Service record CRUD ──────────────────────────────────────────────────


def list_services(vehicle=None, service_type="", date_from=None, date_to=None, search=""):
    qs = ServiceRecord.objects.select_related("vehicle").all()
    if vehicle:
        qs = qs.filter(vehicle_id=vehicle)
    if service_type:
        qs = qs.filter(service_type=service_type)
    if date_from:
        qs = qs.filter(date__gte=date_from)
    if date_to:
        qs = qs.filter(date__lte=date_to)
    if search:
        qs = qs.filter(
            Q(vehicle__make__icontains=search)
            | Q(vehicle__model__icontains=search)
            | Q(vehicle__rego__icontains=search)
            | Q(vehicle__vin__icontains=search)
            | Q(notes__icontains=search)
        )
    return qs


def create_service(data):
    record = ServiceRecord.objects.create(**data)
    _bump_odometer_if_higher(record.vehicle, record.odometer)
    return record


def update_service(pk, data):
    try:
        record = ServiceRecord.objects.get(pk=pk)
    except ServiceRecord.DoesNotExist:
        raise NotFoundError(f"Service record {pk} not found.")
    for key, value in data.items():
        setattr(record, key, value)
    record.save()
    _bump_odometer_if_higher(record.vehicle, record.odometer)
    return record


def delete_service(pk):
    try:
        ServiceRecord.objects.get(pk=pk).delete()
    except ServiceRecord.DoesNotExist:
        raise NotFoundError(f"Service record {pk} not found.")


# ── Incident CRUD ──────────────────────────────────────────────────────────


def list_incidents(vehicle=None, incident_type="", status="", date_from=None, date_to=None, search=""):
    qs = Incident.objects.select_related("vehicle").all()
    if vehicle:
        qs = qs.filter(vehicle_id=vehicle)
    if date_from:
        qs = qs.filter(date__gte=date_from)
    if date_to:
        qs = qs.filter(date__lte=date_to)
    if incident_type:
        qs = qs.filter(incident_type=incident_type)
    if status:
        qs = qs.filter(status=status)
    if search:
        qs = qs.filter(
            Q(vehicle__make__icontains=search)
            | Q(vehicle__model__icontains=search)
            | Q(vehicle__rego__icontains=search)
            | Q(description__icontains=search)
            | Q(notes__icontains=search)
        )
    return qs


def get_incident(pk):
    try:
        return Incident.objects.get(pk=pk)
    except Incident.DoesNotExist:
        raise NotFoundError(f"Incident {pk} not found.")


def delete_incident(pk):
    get_incident(pk).delete()


# ── Fuel log CRUD ──────────────────────────────────────────────────────────


def list_fuel_logs(vehicle=None, date_from=None, date_to=None, search=""):
    qs = FuelLog.objects.select_related("vehicle").all()
    if vehicle:
        qs = qs.filter(vehicle_id=vehicle)
    if date_from:
        qs = qs.filter(date__gte=date_from)
    if date_to:
        qs = qs.filter(date__lte=date_to)
    if search:
        qs = qs.filter(
            Q(vehicle__make__icontains=search)
            | Q(vehicle__model__icontains=search)
            | Q(vehicle__rego__icontains=search)
            | Q(invoice_number__icontains=search)
            | Q(notes__icontains=search)
        )
    return qs


def create_fuel_log(data):
    record = FuelLog.objects.create(**data)
    _bump_odometer_if_higher(record.vehicle, record.odometer)
    return record


def update_fuel_log(pk, data):
    try:
        record = FuelLog.objects.get(pk=pk)
    except FuelLog.DoesNotExist:
        raise NotFoundError(f"Fuel record {pk} not found.")
    for key, value in data.items():
        setattr(record, key, value)
    record.save()
    _bump_odometer_if_higher(record.vehicle, record.odometer)
    return record


def delete_fuel_log(pk):
    try:
        FuelLog.objects.get(pk=pk).delete()
    except FuelLog.DoesNotExist:
        raise NotFoundError(f"Fuel record {pk} not found.")


# ── Dashboard / alerts ──────────────────────────────────────────────────────


def dashboard_summary():
    today = timezone.localdate()
    vehicles = list(Vehicle.objects.all())
    due_count = 0
    for v in vehicles:
        svc = next_service_due(v)
        overdue_svc = svc is not None and svc["km_left"] < 0
        overdue_rego = v.rego_expiry is not None and v.rego_expiry < today
        overdue_ins = v.insurance_expiry is not None and v.insurance_expiry < today
        if overdue_svc or overdue_rego or overdue_ins:
            due_count += 1
    total_spend = ServiceRecord.objects.aggregate(total=Sum("cost"))["total"] or 0
    recent = ServiceRecord.objects.select_related("vehicle").order_by("-date", "-id")[:5]
    return {
        "vehicle_count": len(vehicles),
        "service_count": ServiceRecord.objects.count(),
        "due_count": due_count,
        "open_incident_count": Incident.objects.exclude(status="Resolved").count(),
        "total_spend": total_spend,
        "recent_services": recent,
    }


def alerts():
    today = timezone.localdate()
    rows = []
    for v in Vehicle.objects.all():
        label = str(v)

        def add(title, sub, diff):
            rows.append(
                {
                    "vehicle": label,
                    "title": title,
                    "sub": sub,
                    "days_or_km_left": diff,
                    "overdue": diff < 0,
                }
            )

        if v.rego_expiry:
            diff = (v.rego_expiry - today).days
            if diff < 60:
                add("Registration expires", v.rego_expiry.isoformat(), diff)
        if v.insurance_expiry:
            diff = (v.insurance_expiry - today).days
            if diff < 60:
                add("Insurance expires", v.insurance_expiry.isoformat(), diff)
        svc = next_service_due(v)
        if svc and svc["km_left"] < DUE_SOON_KM_THRESHOLD:
            add("Scheduled service due", f"{svc['due_at']} km", svc["km_left"])
        tyre = next_tyre_due(v)
        if tyre and tyre["km_left"] < DUE_SOON_KM_THRESHOLD:
            add("Tyre replacement due", f"{tyre['due_at']} km", tyre["km_left"])
    return rows


# ── Analytics (server-side aggregation — see NOTES.md for why) ─────────────


def _month_range(date_from, date_to):
    """Trailing 12 months by default; every month spanning from/to when a
    range is given (capped at 36 to keep the chart readable) — same rule
    the legacy app's buildMonthRange() used."""
    end = date_to or timezone.localdate()
    if date_from:
        start = date_from
    else:
        # 11 months before `end`'s month, so the range is 12 months inclusive.
        start_index = end.year * 12 + (end.month - 1) - 11
        start = date(start_index // 12, start_index % 12 + 1, 1)
    months = []
    cursor = date(start.year, start.month, 1)
    end_month = date(end.year, end.month, 1)
    guard = 0
    while cursor <= end_month and guard < 36:
        months.append(cursor)
        guard += 1
        cursor = date(cursor.year + (cursor.month // 12), (cursor.month % 12) + 1, 1)
    return months


def analytics(vehicle=None, date_from=None, date_to=None):
    services_qs = ServiceRecord.objects.all()
    incidents_qs = Incident.objects.all()
    fuel_qs = FuelLog.objects.all()
    if vehicle:
        services_qs = services_qs.filter(vehicle_id=vehicle)
        incidents_qs = incidents_qs.filter(vehicle_id=vehicle)
        fuel_qs = fuel_qs.filter(vehicle_id=vehicle)
    if date_from:
        services_qs = services_qs.filter(date__gte=date_from)
        incidents_qs = incidents_qs.filter(date__gte=date_from)
        fuel_qs = fuel_qs.filter(date__gte=date_from)
    if date_to:
        services_qs = services_qs.filter(date__lte=date_to)
        incidents_qs = incidents_qs.filter(date__lte=date_to)
        fuel_qs = fuel_qs.filter(date__lte=date_to)

    today = timezone.localdate()
    month_start = today.replace(day=1)

    total_spend = (services_qs.aggregate(t=Sum("cost"))["t"] or 0) + (
        incidents_qs.aggregate(t=Sum("cost"))["t"] or 0
    )
    month_spend = (
        services_qs.filter(date__gte=month_start).aggregate(t=Sum("cost"))["t"] or 0
    ) + (incidents_qs.filter(date__gte=month_start).aggregate(t=Sum("cost"))["t"] or 0)
    costed_services = services_qs.filter(cost__gt=0)
    avg_service = costed_services.aggregate(a=Sum("cost"))["a"] or 0
    costed_count = costed_services.count()
    avg_service = (avg_service / costed_count) if costed_count else 0
    open_incident_cost = incidents_qs.exclude(status="Resolved").aggregate(t=Sum("cost"))["t"] or 0
    fuel_month_qs = fuel_qs.filter(date__gte=month_start)
    fuel_month_cost = fuel_month_qs.aggregate(t=Sum("cost"))["t"] or 0
    fuel_month_litres = fuel_month_qs.aggregate(t=Sum("litres"))["t"] or 0

    months = _month_range(date_from, date_to)
    month_keys = [m.strftime("%Y-%m") for m in months]
    month_labels = [m.strftime("%b") for m in months]

    def bucket_by_month(qs, value_field):
        totals = dict.fromkeys(month_keys, 0)
        for row in qs.annotate(month=TruncMonth("date")).values("month").annotate(total=Sum(value_field)):
            key = row["month"].strftime("%Y-%m")
            if key in totals:
                totals[key] = float(row["total"] or 0)
        return totals

    spend_by_month = bucket_by_month(services_qs, "cost")
    incident_by_month = bucket_by_month(incidents_qs, "cost")
    monthly_spend = [
        {"label": label, "value": spend_by_month[k] + incident_by_month[k]}
        for label, k in zip(month_labels, month_keys)
    ]
    fuel_cost_by_month = bucket_by_month(fuel_qs, "cost")
    fuel_litres_by_month = bucket_by_month(fuel_qs, "litres")
    monthly_fuel = [
        {"label": label, "value": fuel_cost_by_month[k], "litres": fuel_litres_by_month[k]}
        for label, k in zip(month_labels, month_keys)
    ]

    def top_by_vehicle(qs, limit=10):
        rows = (
            qs.values("vehicle__make", "vehicle__model", "vehicle__year")
            .annotate(total=Sum("cost"))
            .filter(total__gt=0)
            .order_by("-total")[:limit]
        )
        return [
            {
                "label": f"{r['vehicle__year'] or ''} {r['vehicle__make']} {r['vehicle__model']}".strip(),
                "value": float(r["total"]),
            }
            for r in rows
        ]

    cost_by_vehicle = None
    fuel_by_vehicle = None
    if not vehicle:
        # Combine service + incident cost per vehicle
        combined = {}
        for r in services_qs.values("vehicle__make", "vehicle__model", "vehicle__year").annotate(total=Sum("cost")):
            label = f"{r['vehicle__year'] or ''} {r['vehicle__make']} {r['vehicle__model']}".strip()
            combined[label] = combined.get(label, 0) + float(r["total"] or 0)
        for r in incidents_qs.values("vehicle__make", "vehicle__model", "vehicle__year").annotate(total=Sum("cost")):
            label = f"{r['vehicle__year'] or ''} {r['vehicle__make']} {r['vehicle__model']}".strip()
            combined[label] = combined.get(label, 0) + float(r["total"] or 0)
        cost_by_vehicle = sorted(
            [{"label": k, "value": v} for k, v in combined.items() if v > 0],
            key=lambda r: -r["value"],
        )[:10]
        fuel_by_vehicle = top_by_vehicle(fuel_qs)

    cost_by_type = [
        {"label": r["service_type"], "value": float(r["total"])}
        for r in services_qs.values("service_type").annotate(total=Sum("cost")).filter(total__gt=0).order_by(
            "-total"
        )
    ]

    return {
        "totalSpend": total_spend,
        "monthSpend": month_spend,
        "avgService": avg_service,
        "openIncidentCost": open_incident_cost,
        "fuelMonthCost": fuel_month_cost,
        "fuelMonthLitres": fuel_month_litres,
        "monthlySpend": monthly_spend,
        "monthlyFuel": monthly_fuel,
        "costByVehicle": cost_by_vehicle,
        "fuelByVehicle": fuel_by_vehicle,
        "costByType": cost_by_type,
    }

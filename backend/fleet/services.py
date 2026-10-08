from bisect import bisect_right
import re
from datetime import date, timedelta

from django.db.models import Count, Max, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from .models import SERVICE_STATUS_CHOICES, SERVICE_STATUS_DONE, FuelLog, Incident, ServiceRecord, TollTrip, Vehicle, fuel_only_q


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
# One warning window for rego expiry, used by the Alerts page and
# the vehicle status badge alike.
EXPIRY_DUE_SOON_DAYS = 60
# Only work that has actually happened counts towards "last serviced at" —
# a Booked / In service job hasn't reset the interval yet.
DONE_SERVICE_STATUSES = ["Completed, awaiting invoice", "Invoiced"]
# How each status reads on screen; the stored values stay as they are.
STATUS_WORDS = {
    "Booked": "Booked",
    "In service": "At mechanic",
    "Completed, awaiting invoice": "Waiting for invoice",
    "Invoiced": "Done",
}
# Vans are washed every 2 weeks: due at 14 days since the last wash.
WASH_CYCLE_DAYS = 14
# Washes are stored as service records of this type, but live on their own
# Van washes tab — the service views (dashboard, History) leave them out.
WASH_SERVICE_TYPE = "Van wash"


def open_job(vehicle, service_type=None):
    """The vehicle's earliest job that's booked or underway (not yet
    completed), optionally of one service type — or None."""
    qs = vehicle.services.exclude(status__in=DONE_SERVICE_STATUSES)
    if service_type:
        qs = qs.filter(service_type=service_type)
    else:
        qs = qs.exclude(service_type=WASH_SERVICE_TYPE)
    job = qs.order_by("date", "id").first()
    if not job:
        return None
    return {"id": job.pk, "service_type": job.service_type, "status": job.status, "date": job.date}


def next_service_due(vehicle):
    """km remaining until the next scheduled service, based on the last
    completed "Scheduled service" record's odometer plus the vehicle's
    interval. Returns None if there's no completed scheduled service yet."""
    last = (
        vehicle.services.filter(service_type="Scheduled service", status__in=DONE_SERVICE_STATUSES, odometer__gt=0)
        .order_by("-odometer")
        .first()
    )
    if not last:
        return None
    due_at = last.odometer + vehicle.service_interval_km
    return {"due_at": due_at, "km_left": due_at - vehicle.odometer, "booked": open_job(vehicle, "Scheduled service")}


def next_tyre_due(vehicle):
    """Same pattern as next_service_due, for "Tyre replacement" records."""
    if not vehicle.tyre_interval_km:
        return None
    last = (
        vehicle.services.filter(service_type="Tyre replacement", status__in=DONE_SERVICE_STATUSES, odometer__gt=0)
        .order_by("-odometer")
        .first()
    )
    if not last:
        return None
    due_at = last.odometer + vehicle.tyre_interval_km
    return {"due_at": due_at, "km_left": due_at - vehicle.odometer, "booked": open_job(vehicle, "Tyre replacement")}


def last_washed_by_vehicle():
    """{vehicle_id: date of its most recent "Van wash"} — only washes that
    have happened (date today or earlier), not ones booked ahead."""
    rows = (
        ServiceRecord.objects.filter(service_type=WASH_SERVICE_TYPE, date__lte=timezone.localdate())
        .order_by()
        .values("vehicle_id")
        .annotate(last=Max("date"))
    )
    return {r["vehicle_id"]: r["last"] for r in rows}


def wash_summary():
    """Every vehicle with its last wash, least recently washed (or never) first."""
    today = timezone.localdate()
    last = last_washed_by_vehicle()
    rows = [
        {
            "vehicle": v.pk,
            "vehicleLabel": str(v),
            "rego": v.rego,
            "lastWashed": last.get(v.pk),
            "daysSince": (today - last[v.pk]).days if v.pk in last else None,
            "washNeeded": v.wash_needed,
        }
        for v in Vehicle.objects.all()
    ]
    # Vans that need washing first — never washed, then longest ago — and
    # "no need" vans (driver takes them home) at the bottom.
    rows.sort(key=lambda r: (not r["washNeeded"], r["daysSince"] is not None, -(r["daysSince"] or 0)))
    return rows


def recent_washes():
    """Washes logged in the last wash cycle, newest first."""
    today = timezone.localdate()
    return [
        {"id": s.pk, "vehicle": s.vehicle_id, "vehicleLabel": str(s.vehicle), "rego": s.vehicle.rego, "date": s.date}
        for s in ServiceRecord.objects.select_related("vehicle")
        .filter(service_type=WASH_SERVICE_TYPE, date__lte=today, date__gt=today - timedelta(days=WASH_CYCLE_DAYS))
        .order_by("-date", "-id")
    ]


def vehicle_status_badge(vehicle):
    """"attention" (rego expired, or a service/tyre change
    overdue), "due_soon" (expiry within EXPIRY_DUE_SOON_DAYS, or a
    service/tyre change within DUE_SOON_KM_THRESHOLD), else "ok"."""
    today = timezone.localdate()

    def is_over(d):
        return d is not None and d < today

    def is_soon(d):
        return d is not None and not is_over(d) and (d - today).days < EXPIRY_DUE_SOON_DAYS

    km_left = [due["km_left"] for due in (next_service_due(vehicle), next_tyre_due(vehicle)) if due]
    if is_over(vehicle.rego_expiry) or any(k < 0 for k in km_left):
        return "attention"
    if is_soon(vehicle.rego_expiry) or any(k < DUE_SOON_KM_THRESHOLD for k in km_left):
        return "due_soon"
    return "ok"


# ── Vehicle CRUD ──────────────────────────────────────────────────────────


def van_number_q(search, prefix=""):
    """ "van 1" / "Van1" / "VAN 12" matches exactly that van (by the "Van N"
    in its name, or its vehicle number) — so "van 1" doesn't also bring up
    Van 10 and 11. Returns None for any other search text."""
    m = re.fullmatch(r"\s*van\s*#?0*(\d+)\s*", search, re.IGNORECASE)
    if not m:
        return None
    n = m.group(1)
    return Q(**{f"{prefix}make__iregex": rf"^\s*van\s*0*{n}([^0-9]|$)"}) | Q(**{f"{prefix}vehicle_number": n})


def list_vehicles(search=""):
    qs = Vehicle.objects.all()
    van_q = van_number_q(search)
    if van_q is not None:
        qs = qs.filter(van_q)
    elif search:
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


def _rising_run(points):
    """From (date, km) readings in date order, the longest run where km never
    goes down. Typos (200,009 for 20,009) fall outside it."""
    tails, tail_idx, prev = [], [], [None] * len(points)
    for i, (_, km) in enumerate(points):
        k = bisect_right(tails, km)
        prev[i] = tail_idx[k - 1] if k else None
        if k == len(tails):
            tails.append(km)
            tail_idx.append(i)
        else:
            tails[k] = km
            tail_idx[k] = i
    run, i = [], tail_idx[-1] if tail_idx else None
    while i is not None:
        run.append(points[i])
        i = prev[i]
    return run[::-1]


def latest_reading(vehicle, extra=()):
    """The van's current km as (date, km): its newest believable reading,
    from fuel fill-ups and from services that have actually happened (a
    booked job's km is only a guess). `extra` adds readings not saved yet.
    None if there are no readings."""
    today = timezone.localdate()
    points = set(FuelLog.objects.filter(vehicle=vehicle, odometer__isnull=False, date__lte=today).values_list("date", "odometer"))
    points |= set(
        ServiceRecord.objects.filter(vehicle=vehicle, odometer__isnull=False, date__lte=today)
        .exclude(status="Booked")
        .values_list("date", "odometer")
    )
    points |= {(d, km) for d, km in extra if km}
    run = _rising_run(sorted(points))
    return run[-1] if run else None


def _bump_odometer_if_higher(vehicle, odometer):
    if odometer and odometer > vehicle.odometer:
        vehicle.odometer = odometer
        vehicle.save(update_fields=["odometer", "updated_at"])


# ── Service record CRUD ──────────────────────────────────────────────────


def list_services(vehicle=None, service_type="", status="", date_from=None, date_to=None, search="", mechanic=None):
    qs = ServiceRecord.objects.select_related("vehicle", "mechanic").all()
    if vehicle:
        qs = qs.filter(vehicle_id=vehicle)
    if mechanic:
        qs = qs.filter(mechanic_id=mechanic)
    if status:
        qs = qs.filter(status=status)
    if service_type:
        qs = qs.filter(service_type=service_type)
    else:
        qs = qs.exclude(service_type=WASH_SERVICE_TYPE)  # only shown when "Van wash" is picked
    if date_from:
        qs = qs.filter(date__gte=date_from)
    if date_to:
        qs = qs.filter(date__lte=date_to)
    van_q = van_number_q(search, "vehicle__")
    if van_q is not None:
        qs = qs.filter(van_q)
    elif search:
        qs = qs.filter(
            Q(vehicle__make__icontains=search)
            | Q(vehicle__model__icontains=search)
            | Q(vehicle__rego__icontains=search)
            | Q(vehicle__vin__icontains=search)
            | Q(issues__icontains=search)
            | Q(notes__icontains=search)
            | Q(mechanic__name__icontains=search)
        )
    return qs


def _fill_next_due(record, old_odometer=None):
    """A scheduled service with an odometer reading gets "next due" =
    odometer + the van's service interval (the form does the same live) when
    it's blank, or when it still holds the figure worked out from the old
    reading (e.g. set at booking, then the real km typed in when it's done).
    A value someone typed themselves is left alone."""
    if record.service_type != "Scheduled service" or not record.odometer:
        return
    interval = record.vehicle.service_interval_km
    stale = old_odometer is not None and record.next_due == str(old_odometer + interval)
    if not record.next_due or stale:
        record.next_due = str(record.odometer + interval)


def create_service(data):
    record = ServiceRecord(**data)
    _fill_next_due(record)
    record.save()
    _bump_odometer_if_higher(record.vehicle, record.odometer)
    return record


def update_service(pk, data):
    try:
        record = ServiceRecord.objects.get(pk=pk)
    except ServiceRecord.DoesNotExist:
        raise NotFoundError(f"Service record {pk} not found.")
    old_odometer = record.odometer
    for key, value in data.items():
        setattr(record, key, value)
    _fill_next_due(record, old_odometer)
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
    qs = Incident.objects.select_related("vehicle").prefetch_related("updates__author")
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
    van_q = van_number_q(search, "vehicle__")
    if van_q is not None:
        qs = qs.filter(van_q)
    elif search:
        qs = qs.filter(
            Q(vehicle__make__icontains=search)
            | Q(vehicle__model__icontains=search)
            | Q(vehicle__rego__icontains=search)
            | Q(description__icontains=search)
            | Q(updates__text__icontains=search)
            | Q(resolution__icontains=search)
        ).distinct()
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
    van_q = van_number_q(search, "vehicle__")
    if van_q is not None:
        qs = qs.filter(van_q)
    elif search:
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
        if overdue_svc or overdue_rego:
            due_count += 1
    # Washes (done in-house at the warehouse, no cost) have their own Van
    # washes tab, so every service figure here leaves them out.
    services_qs = ServiceRecord.objects.exclude(service_type=WASH_SERVICE_TYPE)
    total_spend = services_qs.aggregate(total=Sum("cost"))["total"] or 0
    recent = services_qs.select_related("vehicle").order_by("-date", "-id")[:5]
    counts = dict(services_qs.order_by().values_list("status").annotate(n=Count("id")))
    in_progress = (
        services_qs.select_related("vehicle")
        .exclude(status=SERVICE_STATUS_DONE)
        .order_by("date", "id")
    )
    month_start = today.replace(day=1)
    month_services = services_qs.filter(date__gte=month_start, date__lte=today).aggregate(t=Sum("cost"))["t"] or 0
    month_fuel = FuelLog.objects.filter(date__gte=month_start, date__lte=today).aggregate(t=Sum("cost"))["t"] or 0
    month_tolls = TollTrip.objects.filter(date__gte=month_start, date__lte=today).aggregate(t=Sum("amount"))["t"] or 0
    return {
        "month_services": month_services,
        "month_fuel": month_fuel,
        "month_tolls": month_tolls,
        "vehicle_count": len(vehicles),
        "service_count": services_qs.count(),
        "due_count": due_count,
        "open_incident_count": Incident.objects.exclude(status="Resolved").count(),
        "total_spend": total_spend,
        "recent_services": recent,
        "status_counts": [{"status": key, "count": counts.get(key, 0)} for key, _ in SERVICE_STATUS_CHOICES],
        "in_progress_services": in_progress,
    }


def alerts():
    today = timezone.localdate()
    rows = []
    for v in Vehicle.objects.all():
        label = str(v)

        def add(title, sub, diff, job=None):
            rows.append(
                {
                    "vehicle": label,
                    "vehicleId": v.pk,
                    "title": title,
                    "sub": sub,
                    "days_or_km_left": diff,
                    "overdue": diff < 0,
                    # The open job already booked for it, if any, so Home can
                    # leave handled items off "Needs doing".
                    "booked": {"id": job["id"], "date": job["date"].isoformat(), "status": job["status"]} if job else None,
                }
            )

        if v.rego_expiry:
            diff = (v.rego_expiry - today).days
            if diff < EXPIRY_DUE_SOON_DAYS:
                add("Registration expires", v.rego_expiry.strftime("%d-%m-%Y"), diff)
        def booked_note(due):
            # A due/overdue item that already has a job open says so, so it
            # doesn't read as forgotten.
            job = due["booked"]
            return f" · {STATUS_WORDS.get(job['status'], job['status']).lower()} {job['date'].strftime('%d-%m-%Y')}" if job else ""

        svc = next_service_due(v)
        if svc and svc["km_left"] < DUE_SOON_KM_THRESHOLD:
            add("Scheduled service due", f"{svc['due_at']:,} km{booked_note(svc)}", svc["km_left"], svc["booked"])
        tyre = next_tyre_due(v)
        if tyre and tyre["km_left"] < DUE_SOON_KM_THRESHOLD:
            add("Tyre replacement due", f"{tyre['due_at']:,} km{booked_note(tyre)}", tyre["km_left"], tyre["booked"])
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
    # Over the whole selected range (not the calendar month), so it lines up
    # with the fuel card statement. Cost includes the card's fees/charges;
    # litres are fuel only (not AdBlue).
    fuel_cost = fuel_qs.aggregate(t=Sum("cost"))["t"] or 0
    fuel_only_cost = fuel_qs.filter(fuel_only_q()).aggregate(t=Sum("cost"))["t"] or 0
    fuel_litres = fuel_qs.filter(fuel_only_q()).aggregate(t=Sum("litres"))["t"] or 0

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
    fuel_litres_by_month = bucket_by_month(fuel_qs.filter(fuel_only_q()), "litres")
    monthly_fuel = [
        {"label": label, "value": fuel_cost_by_month[k], "litres": fuel_litres_by_month[k]}
        for label, k in zip(month_labels, month_keys)
    ]

    def van_label(make, model, year):
        m = re.match(r"\s*(van\s*\d+)", make or "", re.I)
        return re.sub(r"\s+", " ", m.group(1)).title() if m else f"{year or ''} {make} {model}".strip()

    def top_by_vehicle(qs, limit=10):
        rows = (
            qs.values("vehicle__make", "vehicle__model", "vehicle__year")
            .annotate(total=Sum("cost"))
            .filter(total__gt=0)
            .order_by("-total")[:limit]
        )
        return [
            {
                "label": van_label(r["vehicle__make"], r["vehicle__model"], r["vehicle__year"]),
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
            label = van_label(r["vehicle__make"], r["vehicle__model"], r["vehicle__year"])
            combined[label] = combined.get(label, 0) + float(r["total"] or 0)
        for r in incidents_qs.values("vehicle__make", "vehicle__model", "vehicle__year").annotate(total=Sum("cost")):
            label = van_label(r["vehicle__make"], r["vehicle__model"], r["vehicle__year"])
            combined[label] = combined.get(label, 0) + float(r["total"] or 0)
        cost_by_vehicle = sorted(
            [{"label": k, "value": v} for k, v in combined.items() if v > 0],
            key=lambda r: -r["value"],
        )[:10]
        fuel_by_vehicle = top_by_vehicle(fuel_qs)

    # What each van really costs to run: maintenance + fuel card + tolls.
    tolls_qs = TollTrip.objects.all()
    if vehicle:
        tolls_qs = tolls_qs.filter(vehicle_id=vehicle)
    if date_from:
        tolls_qs = tolls_qs.filter(date__gte=date_from)
    if date_to:
        tolls_qs = tolls_qs.filter(date__lte=date_to)
    running = {}
    for key, qs, field in (
        ("maintenance", services_qs, "cost"), ("maintenance", incidents_qs, "cost"),
        ("fuel", fuel_qs, "cost"), ("tolls", tolls_qs, "amount"),
    ):
        for r in qs.values("vehicle").annotate(total=Sum(field)):
            row = running.setdefault(r["vehicle"], {"maintenance": 0.0, "fuel": 0.0, "tolls": 0.0})
            row[key] += float(r["total"] or 0)
    names = {v.pk: str(v) for v in Vehicle.objects.filter(pk__in=running)}
    running_cost = sorted(
        ({"id": pk, "label": names.get(pk, "?"), **row, "total": sum(row.values())} for pk, row in running.items() if sum(row.values()) > 0),
        key=lambda r: -r["total"],
    )

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
        "fuelCost": fuel_cost,  # fuel + card fees/charges
        "fuelOnlyCost": fuel_only_cost,
        "fuelFees": fuel_cost - fuel_only_cost,
        "fuelLitres": fuel_litres,
        "monthlySpend": monthly_spend,
        "monthlyFuel": monthly_fuel,
        "costByVehicle": cost_by_vehicle,
        "fuelByVehicle": fuel_by_vehicle,
        "costByType": cost_by_type,
        "runningCost": running_cost,
        "tollCost": tolls_qs.aggregate(t=Sum("amount"))["t"] or 0,
        **fuel_insights(fuel_qs),
    }


# A van using this much more fuel per 100 km than the fleet average is
# worth a look (tyres, brakes, injectors, or how it's being driven).
FUEL_HIGH_USE_RATIO = 1.15
# More litres than any of the vans' tanks hold in one go.
FUEL_MAX_SINGLE_FILL = 80


def _litres_per_100km(fills):
    """km between a van's lowest and highest odometer reading, against the
    fuel put in after that first reading (the first fill's litres were
    burnt before the period started). Same rule as the Fuel tab."""
    with_odo = sorted((f for f in fills if f.odometer), key=lambda f: f.odometer)
    if len(with_odo) < 2:
        return None, None
    first, last = with_odo[0], with_odo[-1]
    km = last.odometer - first.odometer
    if km <= 0:
        return None, None
    litres = sum(f.litres for f in fills if f is not first and first.date <= f.date <= last.date)
    return float(litres) / km * 100, km


def fuel_insights(fuel_qs):
    """Per-van fuel efficiency, plus fill-ups that look odd enough to ask
    the driver about."""
    by_van, cost_by_van = {}, {}
    for f in fuel_qs.select_related("vehicle").order_by("date", "id"):
        cost_by_van[f.vehicle] = cost_by_van.get(f.vehicle, 0) + f.cost
        if f.is_fuel:
            by_van.setdefault(f.vehicle, []).append(f)

    vans = []
    for v, fills in by_van.items():
        litres = sum(f.litres for f in fills)
        cost = cost_by_van[v]  # fuel + the card's charges, as on the statement
        per100, km = _litres_per_100km(fills)
        vans.append({
            "id": v.pk,
            "label": str(v),
            "rego": v.rego,
            "fills": len(fills),
            "litres": float(litres),
            "cost": float(cost),
            "fuelCost": float(sum(f.cost for f in fills)),
            "fees": float(cost - sum(f.cost for f in fills)),
            "km": km,
            "per100": round(per100, 1) if per100 else None,
            "costPerKm": round(float(cost) / km, 2) if km else None,
        })
    rated = [r["per100"] for r in vans if r["per100"]]
    fleet_avg = round(sum(rated) / len(rated), 1) if rated else None
    for r in vans:
        r["highUse"] = bool(fleet_avg and r["per100"] and r["per100"] > fleet_avg * FUEL_HIGH_USE_RATIO)
    vans.sort(key=lambda r: -(r["per100"] or 0))

    flags = []

    def flag(v, when, kind, text):
        flags.append({"vehicle": v.pk, "vehicleLabel": str(v), "date": when.isoformat(), "kind": kind, "text": text})

    for v, fills in by_van.items():
        per_day = {}
        for f in fills:
            per_day.setdefault(f.date, []).append(f)
            if f.litres > FUEL_MAX_SINGLE_FILL:
                flag(v, f.date, "Big fill-up", f"{f.litres} L in one go — more than the tank holds")
            if "premium" in (f.product or f.notes).lower():
                flag(v, f.date, "Premium diesel", f"{f.litres} L at ${f.price_per_litre}/L — regular diesel is cheaper")
            if "looked wrong" in f.notes:
                flag(v, f.date, "Odometer typo", "Odometer entered at the pump doesn't fit the van's other readings")
        for day, same in per_day.items():
            if len(same) > 1:
                total = sum(f.litres for f in same)
                flag(v, day, "Filled twice in a day", f"{len(same)} fill-ups, {total} L in total")
        missing = [f for f in fills if not f.odometer and "looked wrong" not in f.notes]
        if missing:
            flag(v, missing[-1].date, "No odometer", f"{len(missing)} fill-up{'s' if len(missing) > 1 else ''} with no odometer entered at the pump")
    flags.sort(key=lambda r: r["date"], reverse=True)

    return {"fuelVans": vans, "fuelFleetPer100": fleet_avg, "fuelFlags": flags}

"""The Monday-morning summary email: what's overdue, booked this week,
expiring soon, waiting for an invoice, and last month's fuel. The same data
drives the preview on Reports → Weekly email."""

from datetime import timedelta
from html import escape

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db.models import Sum
from django.utils import timezone

from . import services
from .models import FuelLog, Incident, ServiceRecord, Vehicle, fuel_only_q


def _money(n):
    return f"${n:,.2f}"


def build_summary():
    today = timezone.localdate()
    week_end = today + timedelta(days=7)
    first_this_month = today.replace(day=1)
    last_month_end = first_this_month - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)

    alerts = sorted(services.alerts(), key=lambda a: (not a["overdue"], a["days_or_km_left"]))
    overdue = [a for a in alerts if a["overdue"]]
    due_soon = [a for a in alerts if not a["overdue"]]

    booked = ServiceRecord.objects.select_related("vehicle").filter(
        status="Booked", date__gte=today, date__lte=week_end
    ).exclude(service_type=services.WASH_SERVICE_TYPE).order_by("date")
    awaiting = ServiceRecord.objects.select_related("vehicle").filter(status="Completed, awaiting invoice").order_by("date")
    incidents = Incident.objects.select_related("vehicle").exclude(status="Resolved").order_by("date")

    washes = []
    last = services.last_washed_by_vehicle()
    for v in Vehicle.objects.filter(wash_needed=True):
        d = last.get(v.pk)
        if d is None or (today - d).days >= services.WASH_CYCLE_DAYS:
            washes.append({"vehicle": str(v), "lastWashed": d.strftime("%d-%m-%Y") if d else None})

    fuel_qs = FuelLog.objects.filter(date__gte=last_month_start, date__lte=last_month_end)
    fuel_total = fuel_qs.aggregate(t=Sum("cost"))["t"] or 0
    fuel_only = fuel_qs.filter(fuel_only_q()).aggregate(t=Sum("cost"), l=Sum("litres"))

    return {
        "date": today.strftime("%d-%m-%Y"),
        "overdue": [{"vehicle": a["vehicle"], "what": a["title"], "detail": a["sub"]} for a in overdue],
        "dueSoon": [{"vehicle": a["vehicle"], "what": a["title"], "detail": a["sub"]} for a in due_soon],
        "bookedThisWeek": [{"vehicle": str(s.vehicle), "what": s.service_type, "date": s.date.strftime("%d-%m-%Y"), "issues": s.issues} for s in booked],
        "awaitingInvoice": [{"vehicle": str(s.vehicle), "what": s.service_type, "date": s.date.strftime("%d-%m-%Y")} for s in awaiting],
        "openIncidents": [{"vehicle": str(i.vehicle), "what": f"{i.incident_type} ({i.severity})", "date": i.date.strftime("%d-%m-%Y"), "status": i.status} for i in incidents],
        "washesDue": washes,
        "fuel": {
            "month": last_month_start.strftime("%B %Y"),
            "total": float(fuel_total),
            "fuelOnly": float(fuel_only["t"] or 0),
            "fees": float(fuel_total - (fuel_only["t"] or 0)),
            "litres": float(fuel_only["l"] or 0),
        },
        "recipients": [e for e in settings.WEEKLY_EMAIL_TO if e],
        "emailReady": bool(settings.EMAIL_HOST and settings.WEEKLY_EMAIL_TO),
    }


SECTIONS = [
    ("overdue", "Overdue", lambda r: f"{r['vehicle']} — {r['what']} ({r['detail']})"),
    ("bookedThisWeek", "Booked in this week", lambda r: f"{r['date']} · {r['vehicle']} — {r['what']}" + (f" · issues: {r['issues']}" if r["issues"] else "")),
    ("dueSoon", "Coming up", lambda r: f"{r['vehicle']} — {r['what']} ({r['detail']})"),
    ("awaitingInvoice", "Done, waiting for the invoice", lambda r: f"{r['vehicle']} — {r['what']} (serviced {r['date']})"),
    ("openIncidents", "Open incidents", lambda r: f"{r['date']} · {r['vehicle']} — {r['what']}, {r['status'].lower()}"),
    ("washesDue", "Vans due a wash", lambda r: f"{r['vehicle']} — " + (f"last washed {r['lastWashed']}" if r["lastWashed"] else "no wash logged")),
]


def render(summary):
    """(subject, plain text, html) for the email."""
    subject = f"Fleet summary — week of {summary['date']}"
    fuel = summary["fuel"]
    fuel_line = (
        f"{fuel['month']} fuel card total {_money(fuel['total'])} "
        f"(fuel {_money(fuel['fuelOnly'])} + card fees {_money(fuel['fees'])}, {fuel['litres']:,.0f} L diesel)"
    )
    text = [subject, ""]
    html = [f"<h2 style='font-family:Segoe UI,Arial;color:#185fa5'>{escape(subject)}</h2>"]
    for key, title, fmt in SECTIONS:
        rows = summary[key]
        text.append(f"{title} ({len(rows)})")
        html.append(f"<h3 style='font-family:Segoe UI,Arial;margin:18px 0 6px'>{escape(title)} ({len(rows)})</h3>")
        if rows:
            text += [f"  • {fmt(r)}" for r in rows]
            html.append("<ul style='font-family:Segoe UI,Arial;font-size:14px'>" + "".join(f"<li>{escape(fmt(r))}</li>" for r in rows) + "</ul>")
        else:
            text.append("  Nothing.")
            html.append("<p style='font-family:Segoe UI,Arial;font-size:14px;color:#5b6775'>Nothing.</p>")
        text.append("")
    text += ["Fuel last month", f"  {fuel_line}", "", "Open the app: http://DESKTOP-OB7PD9F:8001"]
    html.append(f"<h3 style='font-family:Segoe UI,Arial;margin:18px 0 6px'>Fuel last month</h3><p style='font-family:Segoe UI,Arial;font-size:14px'>{escape(fuel_line)}</p>")
    html.append("<p style='font-family:Segoe UI,Arial;font-size:13px;color:#5b6775'>Open the app: <a href='http://DESKTOP-OB7PD9F:8001'>http://DESKTOP-OB7PD9F:8001</a></p>")
    return subject, "\n".join(text), "".join(html)


def send():
    summary = build_summary()
    if not summary["emailReady"]:
        raise RuntimeError("Email isn't set up yet: add EMAIL_HOST, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD and WEEKLY_EMAIL_TO to backend/.env.")
    subject, text, html = render(summary)
    msg = EmailMultiAlternatives(subject, text, settings.DEFAULT_FROM_EMAIL, summary["recipients"])
    msg.attach_alternative(html, "text/html")
    msg.send()
    return summary["recipients"]

"""The page behind each van's QR sticker. Drivers scan it with their phone
to report a problem (it becomes an Open incident) or confirm the van was
washed. No login: the secret token in the link is the permission, and the
page shows nothing but that one van."""

from html import escape

from django.http import HttpResponse, HttpResponseNotFound
from django.middleware.csrf import get_token
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from . import activity, services
from .models import Incident, IncidentUpdate, ServiceRecord, Vehicle

PROBLEM_TYPES = ["Breakdown", "Damage", "Accident", "Other"]
SEVERITIES = [("Minor", "Minor: can still drive it"), ("Moderate", "Moderate: needs looking at soon"), ("Major", "Major: not safe to drive")]

STYLE = """
*{box-sizing:border-box}body{margin:0;background:#f4f6f9;color:#16202a;font:16px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif}
header{background:#0f2742;color:#fff;padding:18px 16px}header small{display:block;color:#8fa6bf;font-size:13px}
header b{font-size:20px}main{max-width:520px;margin:0 auto;padding:16px;display:grid;gap:16px}
section{background:#fff;border:1px solid #e1e6ed;border-radius:12px;padding:16px;display:grid;gap:12px}
h2{margin:0;font-size:18px}label{display:grid;gap:4px;font-size:14px;font-weight:600}
input,select,textarea{font:inherit;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;width:100%}
textarea{min-height:110px}button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:14px;background:#185fa5;color:#fff;width:100%}
button.alt{background:#fff;color:#185fa5;border:2px solid #185fa5}.ok{background:#ddf3e5;color:#17703f;border-radius:10px;padding:14px;font-weight:600}
.err{background:#fde7e4;color:#b42318;border-radius:10px;padding:12px}p{margin:0;color:#5b6775;font-size:14px}
"""


def _page(vehicle, body):
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(str(vehicle))}</title>
<style>{STYLE}</style></head><body>
<header><small>Achieve Cafe Provisions · Fleet</small><b>{escape(str(vehicle))}</b><small>{escape(vehicle.rego or '')}</small></header>
<main>{body}</main></body></html>"""
    return HttpResponse(html)


def _forms(request, vehicle, name="", error=""):
    csrf = get_token(request)
    types = "".join(f"<option>{t}</option>" for t in PROBLEM_TYPES)
    sev = "".join(f'<option value="{v}">{escape(label)}</option>' for v, label in SEVERITIES)
    err = f'<div class="err">{escape(error)}</div>' if error else ""
    wash = ""
    if vehicle.wash_needed:
        wash = f"""<section><h2>Washed the van?</h2><p>Tap once when you've washed it today.</p>
<form method="post"><input type="hidden" name="csrfmiddlewaretoken" value="{csrf}"><input type="hidden" name="action" value="wash">
<label>Your name<input name="name" value="{escape(name)}" autocomplete="name"></label>
<button class="alt" type="submit">Van washed today</button></form></section>"""
    return f"""{err}<section><h2>Report a problem</h2><p>Something wrong with the van? Tell the office here.</p>
<form method="post" style="display:grid;gap:12px"><input type="hidden" name="csrfmiddlewaretoken" value="{csrf}"><input type="hidden" name="action" value="problem">
<label>What happened?<select name="type">{types}</select></label>
<label>How bad is it?<select name="severity">{sev}</select></label>
<label>Describe it<textarea name="description" required placeholder="e.g. Warning light on, brakes squealing, scratch on rear door"></textarea></label>
<label>Where are you? (optional)<input name="location"></label>
<label>Your name<input name="name" value="{escape(name)}" autocomplete="name" required></label>
<button type="submit">Send to the office</button></form></section>{wash}"""


@require_http_methods(["GET", "POST"])
def report_page(request, token):
    vehicle = Vehicle.objects.filter(report_token=token).first()
    if not vehicle:
        return HttpResponseNotFound("This QR code isn't valid any more. Ask the office for a new sticker.")

    if request.method == "GET":
        return _page(vehicle, _forms(request, vehicle))

    name = (request.POST.get("name") or "").strip()[:80]
    who = f"Driver {name} (QR sticker)" if name else "Driver (QR sticker)"
    today = timezone.localdate()

    if request.POST.get("action") == "wash":
        if not vehicle.wash_needed:
            return _page(vehicle, _forms(request, vehicle, name, "This van isn't on the wash list."))
        if not ServiceRecord.objects.filter(vehicle=vehicle, service_type=services.WASH_SERVICE_TYPE, date=today).exists():
            record = services.create_service({"vehicle": vehicle, "service_type": services.WASH_SERVICE_TYPE, "date": today, "status": "Invoiced"})
            activity.log(None, "Added", "Wash", activity.describe_service(record), vehicle, who_label=who)
        return _page(vehicle, '<div class="ok">Thanks! The wash is logged for today.</div>')

    description = (request.POST.get("description") or "").strip()
    if not description or not name:
        return _page(vehicle, _forms(request, vehicle, name, "Please describe the problem and give your name."))
    kind = request.POST.get("type") if request.POST.get("type") in PROBLEM_TYPES else "Other"
    severity = request.POST.get("severity") if request.POST.get("severity") in dict(SEVERITIES) else "Minor"
    incident = Incident.objects.create(
        vehicle=vehicle,
        incident_type=kind,
        date=today,
        severity=severity,
        location=(request.POST.get("location") or "").strip()[:255],
        description=description[:2000],
        status="Open",
    )
    IncidentUpdate.objects.create(incident=incident, text=f"Reported by {name} using the van's QR sticker.")
    activity.log(None, "Added", "Incident", activity.describe_incident(incident), vehicle, who_label=who)
    return _page(vehicle, '<div class="ok">Thanks! The office has your report and will follow it up.</div>'
                 '<p style="text-align:center"><a href="">Report something else</a></p>')

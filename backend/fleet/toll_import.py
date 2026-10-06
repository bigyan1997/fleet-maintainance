"""
Reads the monthly E-Toll (Transport for NSW) "Statement/Tax Invoice" PDF and
stores every trip against the van that made it.

The statement has a summary table (one line per tag, then one per number
plate) and a detailed section per tag / plate. A trip is charged to a *tag*
when the tag beeped, or to the *number plate* when it didn't; plate trips
usually carry a "Video Matching Fee" line each, which is what a missing or
flat tag costs.

Each tag's reference on the account ("Van 9  YLS91M") and each plate are
matched to a van by rego. Vehicles on the account that aren't fleet vans
(the owner's cars) are left out; only their total is kept, so the fleet
figure can still be checked against the statement.

Re-uploading a statement replaces it (matched on the invoice number), so it
can't be counted twice.
"""

import io
import re
from collections import defaultdict
from datetime import datetime, time, timedelta
from statistics import median
from decimal import Decimal

from django.core.files.base import ContentFile
from django.db import transaction

from .models import TollStatement, TollTrip, Vehicle


class ImportFileError(Exception):
    pass


MONEY = r"-?\$?([\d,]+\.\d\d)"
TRIP_LINE = re.compile(r"^(\d\d/\d\d/\d{4}) (\d\d:\d\d) (.+?) -- (.+?) ([\d,]+\.\d\d)\*?$")
SECTION_LINE = re.compile(r"^(Tag Number|Licence Plate No): (\S+)")
SECTION_TOTAL = re.compile(r"^Total for (?:Tag|Vehicle) ([\d,]+\.\d\d)")
SUMMARY_TAG = re.compile(r"^(\d{5,}) (.+?) (\d+) ([\d,.]+) ([\d,.]+) ([\d,.]+)$")
SUMMARY_PLATE = re.compile(r"^([A-Z0-9]{4,8}) ([A-Z]{2,3}) (\d+) ([\d,.]+) ([\d,.]+) ([\d,.]+)$")
# The statement names the company that runs each road; these are the names
# drivers know. Anything not listed is shown as the statement has it.
ROAD_NAMES = {
    "shb and sht": "Sydney Harbour Bridge / Tunnel",
    "lct - mre pty limited": "Lane Cove Tunnel",
    "roam tolling pty ltd": "Westlink M7",
    "the hills motorway limited": "M2 Hills Motorway",
    "northconnex company pty ltd": "NorthConnex",
    "airport motorway limited": "Eastern Distributor",
}
VEHICLE_CLASS = re.compile(r" (Car|Truck|Motorcycle|Heavy Vehicle|Light Commercial|Class [A-Z0-9]+)$")


def _money(text):
    return Decimal(text.replace(",", "").replace("$", ""))


def _date(text, fmt):
    return datetime.strptime(text, fmt).date()


def _road(operator):
    name = re.sub(r"\s*\(\d+\)$", "", operator).strip()
    return ROAD_NAMES.get(name.lower(), name)


def pdf_text(raw):
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError

    try:
        return "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(raw)).pages)
    except (PyPdfError, ValueError, OSError) as exc:
        raise ImportFileError("That file couldn't be read. Upload the E-Toll statement PDF.") from exc


def parse_text(text):
    """The statement as plain data: header, summary rows and every trip."""
    def find(pattern, what):
        m = re.search(pattern, text)
        if not m:
            raise ImportFileError(f"This doesn't look like an E-Toll statement (couldn't find the {what}).")
        return m

    period = find(r"Statement Period\s+(\d{1,2} \w{3} \d{4}) - (\d{1,2} \w{3} \d{4})", "statement period")
    issue = re.search(r"Issue Date\s+(\d{1,2} \w{3} \d{4})", text)
    account = re.search(r"Account No\s+(\d+)", text)
    statement = {
        "invoice": find(r"Invoice No\s+(\d+)", "invoice number").group(1),
        "account": account.group(1) if account else "",
        "period_start": _date(period.group(1), "%d %b %Y"),
        "period_end": _date(period.group(2), "%d %b %Y"),
        "issue_date": _date(issue.group(1), "%d %b %Y") if issue else None,
        "total": _money(find(r"Total toll charges\s+" + MONEY, "total toll charges").group(1)),
    }

    references = {}  # tag number -> the name it has on the account
    trips, checks = [], []
    section, running, in_summary = None, Decimal(0), False
    for line in (raw.strip() for raw in text.splitlines()):
        if line.startswith("Summary use of toll charges"):
            in_summary = True
        elif line.startswith("Payments, account fees"):
            in_summary = False
        elif in_summary:
            m = SUMMARY_TAG.match(line)
            if m and not SUMMARY_PLATE.match(line):
                references[m.group(1)] = " ".join(m.group(2).split())
            continue

        m = SECTION_LINE.match(line)
        if m:
            source = "tag" if m.group(1) == "Tag Number" else "plate"
            if section != (source, m.group(2)):  # not a "- continued" header
                section, running = (source, m.group(2)), Decimal(0)
            continue
        m = SECTION_TOTAL.match(line)
        if m and section:
            if _money(m.group(1)) != running:
                checks.append(f"{section[1]}: lines add up to ${running}, statement says ${m.group(1)}")
            section = None
            continue
        m = TRIP_LINE.match(line)
        if m and section:
            detail = VEHICLE_CLASS.sub("", m.group(4)).strip()
            amount = _money(m.group(5))
            running += amount
            trips.append({
                "source": section[0],
                "tag": section[1] if section[0] == "tag" else "",
                "plate": section[1] if section[0] == "plate" else "",
                "date": _date(m.group(1), "%d/%m/%Y"),
                "time": datetime.strptime(m.group(2), "%H:%M").time(),
                "road": _road(m.group(3)),
                "detail": detail,
                "amount": amount,
                "is_fee": "fee" in detail.lower(),
            })

    if not trips:
        raise ImportFileError("No toll trips were found in that file. Upload the full E-Toll statement PDF.")
    listed = sum(t["amount"] for t in trips)
    if listed != statement["total"]:
        checks.append(f"Trips add up to ${listed}, but the statement's total toll charges are ${statement['total']}")
    for trip in trips:
        trip["label"] = references.get(trip["tag"], "") if trip["source"] == "tag" else trip["plate"]
    return {"statement": statement, "trips": trips, "references": references, "checks": checks}


# ── Matching to vans ───────────────────────────────────────────────────────


def _norm(text):
    """Regos compared without spaces and with letter O read as zero (the
    account has YNUO5R for YNU05R)."""
    return re.sub(r"[^A-Z0-9]", "", text.upper()).replace("O", "0")


def van_matcher():
    vans = [(v, _norm(v.rego.split()[0]) if v.rego.strip() else "") for v in Vehicle.objects.all()]

    def match(trip):
        if trip["source"] == "plate":
            plate = _norm(trip["plate"])
            return next((v for v, rego in vans if rego and rego == plate), None)
        reference = _norm(trip["label"])
        found = next((v for v, rego in vans if rego and rego in reference), None)
        if found:
            return found
        number = re.match(r"van\s*(\d+)", trip["label"], re.I)
        return next((v for v, _ in vans if number and str(v) == f"Van {number.group(1)}"), None)

    return match


def _grouped(parsed):
    """Per vehicle on the statement: trips, tolls and fees."""
    match = van_matcher()
    groups = {}
    for trip in parsed["trips"]:
        van = match(trip)
        trip["vehicle"] = van
        key = f"van{van.pk}" if van else f"other:{trip['label'] or trip['tag']}"
        g = groups.setdefault(key, {"vehicle": van.pk if van else None, "label": str(van) if van else (trip["label"] or f"Tag {trip['tag']}"),
                                    "trips": 0, "tolls": Decimal(0), "fees": Decimal(0)})
        if trip["is_fee"]:
            g["fees"] += trip["amount"]
        else:
            g["trips"] += 1
            g["tolls"] += trip["amount"]
    return sorted(groups.values(), key=lambda g: -(g["tolls"] + g["fees"]))


def _split(parsed):
    """(fleet vans, vehicles left out) from the statement's groups."""
    groups = _grouped(parsed)
    return [g for g in groups if g["vehicle"]], [g for g in groups if not g["vehicle"]]


def preview(raw):
    parsed = parse_text(pdf_text(raw))
    s = parsed["statement"]
    fleet, left_out = _split(parsed)
    return {
        "invoice": s["invoice"],
        "periodStart": s["period_start"],
        "periodEnd": s["period_end"],
        "statementTotal": s["total"],
        "total": sum((g["tolls"] + g["fees"] for g in fleet), Decimal(0)),
        "trips": sum(g["trips"] for g in fleet),
        "fees": sum((g["fees"] for g in fleet), Decimal(0)),
        "vehicles": fleet,
        "leftOut": left_out,
        "checks": parsed["checks"],
        "alreadyImported": TollStatement.objects.filter(invoice_number=s["invoice"]).exists(),
    }


@transaction.atomic
def import_statement(raw, file_name, user=None):
    parsed = parse_text(pdf_text(raw))
    s = parsed["statement"]
    _grouped(parsed)  # sets each trip's vehicle
    trips = [t for t in parsed["trips"] if t["vehicle"]]  # fleet vans only
    other_total = sum((t["amount"] for t in parsed["trips"] if not t["vehicle"]), Decimal(0))
    old = TollStatement.objects.filter(invoice_number=s["invoice"]).first()
    if old:
        if old.file:
            old.file.delete(save=False)
        old.delete()
    statement = TollStatement.objects.create(
        invoice_number=s["invoice"], account_number=s["account"], period_start=s["period_start"],
        period_end=s["period_end"], issue_date=s["issue_date"], total=s["total"], other_total=other_total, imported_by=user,
    )
    statement.file.save(f"etoll-{s['period_end']:%Y-%m-%d}.pdf", ContentFile(raw), save=True)
    TollTrip.objects.bulk_create(
        TollTrip(
            statement=statement, vehicle=t["vehicle"], source=t["source"], tag_number=t["tag"], plate=t["plate"],
            label=t["label"], date=t["date"], time=t["time"], road=t["road"], detail=t["detail"],
            amount=t["amount"], is_fee=t["is_fee"],
        )
        for t in trips
    )
    return {
        "id": statement.pk, "trips": sum(1 for t in trips if not t["is_fee"]),
        "total": s["total"] - other_total, "replaced": bool(old),
    }


# ── Analysis ───────────────────────────────────────────────────────────────


def _dollars(amount):
    return f"${amount:,.2f}"


# The same toll point charged again within this many minutes looks like a
# double charge (E-Toll takes disputes for 90 days after the statement).
DOUBLE_CHARGE_MINUTES = 15
# Trips at or after this time are flagged (the runs are done by midday),
# and so is any trip on a Saturday or Sunday.
LATE_FROM = time(12, 0)
# Trips from this time on belong to the next day's run (some vans set off
# late in the evening).
RUN_STARTS = time(18, 0)


def _when(t):
    return datetime.combine(t.date, t.time)


def double_charges(trips):
    """Same van, same toll point, charged again within a few minutes."""
    found = []
    by_van = defaultdict(list)
    for t in trips:
        if not t.is_fee:
            by_van[t.vehicle_id].append(t)
    for van_trips in by_van.values():
        van_trips.sort(key=_when)
        group = []
        for t in van_trips + [None]:
            same = group and t and (t.road, t.detail) == (group[-1].road, group[-1].detail)
            if same and _when(t) - _when(group[-1]) <= timedelta(minutes=DOUBLE_CHARGE_MINUTES):
                group.append(t)
                continue
            if len(group) > 1:
                first = group[0]
                found.append({
                    "vehicle": first.vehicle_id, "label": str(first.vehicle), "date": first.date, "road": first.road,
                    "detail": first.detail, "times": [g.time.strftime("%H:%M") for g in group],
                    "amount": first.amount, "extra": sum((g.amount for g in group[1:]), Decimal(0)),
                })
            group = [t] if t else []
    return sorted(found, key=lambda d: (d["date"], d["label"]), reverse=True)


def odd_time_trips(trips):
    """Per van: trips at or after LATE_FROM, or on a Saturday or Sunday."""
    vans = {}
    for t in trips:
        late, weekend = t.time >= LATE_FROM, t.date.weekday() >= 5
        if t.is_fee or not (late or weekend):
            continue
        v = vans.setdefault(t.vehicle_id, {"vehicle": t.vehicle_id, "label": str(t.vehicle), "trips": 0, "total": Decimal(0),
                                           "late": 0, "weekend": 0, "weekendTotal": Decimal(0), "rows": []})
        v["trips"] += 1
        v["total"] += t.amount
        v["late"] += late
        v["weekend"] += weekend
        v["weekendTotal"] += t.amount if weekend else 0
        v["rows"].append({"date": t.date, "day": t.date.strftime("%a"), "time": t.time.strftime("%H:%M"), "road": t.road,
                          "detail": t.detail, "amount": t.amount, "late": late, "weekend": weekend})
    return sorted(vans.values(), key=lambda v: (-v["weekend"], -v["trips"]))


def regular_runs(trips):
    """Per van: what a usual day costs, the day it repeats most often, the
    toll points it uses most, its dearest days and its one-off trips."""
    by_van = defaultdict(lambda: defaultdict(list))
    for t in trips:
        run_day = t.date + timedelta(days=1) if t.time >= RUN_STARTS else t.date
        by_van[t.vehicle_id][run_day].append(t)

    def minutes(t):  # since the run started, so an evening start sorts first
        return (t.time.hour * 60 + t.time.minute - RUN_STARTS.hour * 60) % 1440

    def stop(t):
        return {"time": t.time.strftime("%H:%M"), "road": t.road, "detail": t.detail, "amount": t.amount}

    runs = []
    for days in by_van.values():
        van = next(iter(days.values()))[0].vehicle
        cost = {day: sum((t.amount for t in ts), Decimal(0)) for day, ts in days.items()}

        # The exact set of tolls a day had; the one that repeats most is the regular run.
        patterns = defaultdict(list)
        for day, ts in days.items():
            patterns[tuple(sorted((t.road, t.detail) for t in ts if not t.is_fee))].append(day)
        _, same_days = max(patterns.items(), key=lambda kv: len(kv[1]))
        common = None
        if len(same_days) >= 3:
            example = sorted((t for t in days[max(same_days)] if not t.is_fee), key=minutes)
            common = {"days": len(same_days), "cost": sum((t.amount for t in example), Decimal(0)), "stops": [stop(t) for t in example]}

        used = defaultdict(lambda: {"days": set(), "trips": 0, "total": Decimal(0)})
        for day, ts in days.items():
            for t in ts:
                if not t.is_fee:
                    u = used[(t.road, t.detail)]
                    u["days"].add(day)
                    u["trips"] += 1
                    u["total"] += t.amount
        points = sorted(used.items(), key=lambda kv: (-len(kv[1]["days"]), -kv[1]["total"]))
        one_offs = []
        if len(days) >= 5:
            once = {point for point, u in used.items() if len(u["days"]) == 1}
            one_offs = [
                {"date": t.date, **stop(t)}
                for ts in days.values() for t in ts if not t.is_fee and (t.road, t.detail) in once
            ]
        runs.append({
            "vehicle": van.pk, "label": str(van), "days": len(days), "total": sum(cost.values(), Decimal(0)),
            "usualCost": Decimal(str(median(cost.values()))).quantize(Decimal("0.01")),
            "common": common,
            "points": [{"road": p[0], "detail": p[1], "days": len(u["days"]), "trips": u["trips"], "total": u["total"]} for p, u in points[:6]],
            "dearest": [{"date": d, "total": c, "trips": sum(1 for t in days[d] if not t.is_fee)}
                        for d, c in sorted(cost.items(), key=lambda kv: -kv[1])[:3]],
            "oneOffs": sorted(one_offs, key=lambda o: (o["date"], o["time"]), reverse=True),
        })
    return sorted(runs, key=lambda r: -r["total"])


def daily_totals(statement, trips):
    """Tolls for each day of the statement period (trips billed late, from
    before the period, are counted separately)."""
    days = {statement.period_start + timedelta(days=n): {"total": Decimal(0), "trips": 0}
            for n in range((statement.period_end - statement.period_start).days + 1)}
    earlier = {"total": Decimal(0), "trips": 0}
    for t in trips:
        bucket = days.get(t.date, earlier)
        bucket["total"] += t.amount
        bucket["trips"] += not t.is_fee
    return [{"date": d, "weekend": d.weekday() >= 5, **v} for d, v in days.items()], earlier


def month_to_month(statement, van_rows):
    """Each van against the statement before this one."""
    previous = TollStatement.objects.filter(period_end__lt=statement.period_end).order_by("-period_end").first()
    if not previous:
        return None
    before = defaultdict(Decimal)
    labels = {}
    for t in previous.trips.select_related("vehicle"):
        before[t.vehicle_id] += t.amount
        labels[t.vehicle_id] = str(t.vehicle)
    now = {v["vehicle"]: v["total"] for v in van_rows}
    labels.update({v["vehicle"]: v["label"] for v in van_rows})
    rows = []
    for pk in labels:
        a, b = now.get(pk, Decimal(0)), before.get(pk, Decimal(0))
        rows.append({
            "vehicle": pk, "label": labels[pk], "now": a, "before": b, "change": a - b,
            "percent": round((a - b) / b * 100) if b else None,
            "jumped": a - b >= 20 and (not b or (a - b) / b >= Decimal("0.25")),
        })
    return {
        "periodStart": previous.period_start, "periodEnd": previous.period_end,
        "rows": sorted(rows, key=lambda r: -r["change"]),
        "now": sum(now.values(), Decimal(0)), "before": sum(before.values(), Decimal(0)),
    }


def analysis(statement):
    """Everything the Tolls page shows for one statement."""
    rows = list(statement.trips.select_related("vehicle").order_by("-date", "-time"))
    vans, roads = {}, defaultdict(lambda: {"trips": 0, "total": Decimal(0)})
    for t in rows:
        v = vans.setdefault(t.vehicle_id, {
            "vehicle": t.vehicle_id, "label": str(t.vehicle), "sub": t.vehicle.subtitle,
            "trips": 0, "tolls": Decimal(0), "fees": Decimal(0), "plateTrips": 0, "rows": [],
        })
        v["rows"].append({"date": t.date, "time": t.time.strftime("%H:%M"), "road": t.road, "detail": t.detail,
                          "amount": t.amount, "isFee": t.is_fee, "byPlate": t.source == "plate"})
        if t.is_fee:
            v["fees"] += t.amount
        else:
            v["trips"] += 1
            v["tolls"] += t.amount
            v["plateTrips"] += t.source == "plate"
            roads[t.road]["trips"] += 1
        roads[t.road]["total"] += t.amount
    van_rows = sorted(vans.values(), key=lambda v: -(v["tolls"] + v["fees"]))
    for v in van_rows:
        v["total"] = v["tolls"] + v["fees"]

    total = sum((v["total"] for v in van_rows), Decimal(0))
    fees = sum((v["fees"] for v in van_rows), Decimal(0))
    trips = sum(v["trips"] for v in van_rows)
    days = (statement.period_end - statement.period_start).days + 1

    doubles = double_charges(rows)
    odd = odd_time_trips(rows)
    daily, earlier = daily_totals(statement, rows)
    compare = month_to_month(statement, van_rows)

    insights = []
    if doubles:
        claim = sum((d["extra"] for d in doubles), Decimal(0))
        insights.append({"tone": "due", "text": (
            f"{len(doubles)} possible double charge{'s' if len(doubles) != 1 else ''}: the same toll point charged again within "
            f"{DOUBLE_CHARGE_MINUTES} minutes, {_dollars(claim)} in all. See Double charges; disputes are open for 90 days."
        )})
    for v in van_rows:
        if v["fees"]:
            insights.append({"tone": "due", "text": (
                f"{v['label']}: {v['plateTrips']} trip{'s' if v['plateTrips'] != 1 else ''} charged by number plate instead of the tag, "
                f"costing {_dollars(v['fees'])} in video matching fees. Check the tag is in the van and beeping, or order a new one."
            )})
    if van_rows and total:
        top = van_rows[0]
        insights.append({"tone": "info", "text": (
            f"{top['label']} is the biggest: {_dollars(top['total'])} over {top['trips']} trips, "
            f"{round(top['total'] / total * 100)}% of the statement."
        )})
    weekend = [v for v in odd if v["weekend"]]
    if weekend:
        insights.append({"tone": "due", "text": (
            f"{sum(v['weekend'] for v in weekend)} trip{'s' if sum(v['weekend'] for v in weekend) != 1 else ''} on a Saturday or Sunday "
            f"({_dollars(sum((v['weekendTotal'] for v in weekend), Decimal(0)))}): "
            + ", ".join(f"{v['label']} ({v['weekend']})" for v in weekend) + ". See Odd times."
        )})
    late = sorted((v for v in odd if v["late"]), key=lambda v: -v["late"])
    if late:
        insights.append({"tone": "warn", "text": (
            f"{sum(v['late'] for v in late)} trips were at or after 12 pm, most by {late[0]['label']} ({late[0]['late']}). See Odd times."
        )})
    jumped = [r for r in (compare["rows"] if compare else []) if r["jumped"]]
    if jumped:
        insights.append({"tone": "warn", "text": "Up a lot on the statement before: " + ", ".join(
            f"{r['label']} (+{_dollars(r['change'])})" for r in jumped) + ". See Month to month."})
    quiet = sorted((str(v) for v in Vehicle.objects.exclude(pk__in=[v["vehicle"] for v in van_rows])), key=lambda n: (len(n), n))
    if quiet:
        insights.append({"tone": "info", "text": f"No toll trips this period: {', '.join(quiet)}."})
    previous = TollStatement.objects.filter(period_end__lt=statement.period_end).order_by("-period_end").first()
    before = previous.total - previous.other_total if previous else 0
    if before:
        change = total - before
        insights.append({"tone": "info", "text": (
            f"{_dollars(abs(change))} {'more' if change > 0 else 'less'} than the statement before "
            f"({_dollars(before)}, {round(abs(change) / before * 100)}% {'up' if change > 0 else 'down'})."
        )})
    if total + statement.other_total != statement.total:
        insights.append({"tone": "warn", "text": (
            f"Trips add up to {_dollars(total + statement.other_total)}, but the statement says {_dollars(statement.total)}."
        )})

    insights.sort(key=lambda i: ["due", "warn", "info"].index(i["tone"]))
    return {
        "statement": {
            "id": statement.pk, "invoice": statement.invoice_number, "account": statement.account_number,
            "periodStart": statement.period_start, "periodEnd": statement.period_end, "issueDate": statement.issue_date,
            "fileUrl": f"/api/tolls/{statement.pk}/file/" if statement.file else "",
        },
        "total": total, "trips": trips, "fees": fees, "perDay": round(total / days, 2) if days else None,
        "statementTotal": statement.total, "otherTotal": statement.other_total,
        "vans": van_rows,
        "roads": sorted(({"road": r, **d} for r, d in roads.items()), key=lambda r: -r["total"]),
        "insights": insights,
        "doubles": doubles,
        "odd": odd,
        "runs": regular_runs(rows),
        "daily": daily,
        "earlier": earlier,
        "compare": compare,
    }

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
import logging
import re
from collections import defaultdict
from datetime import datetime, time, timedelta
from statistics import median
from decimal import Decimal

from django.core.files.base import ContentFile
from django.db import transaction

from . import drive
from .models import TollStatement, TollTrip, Vehicle

logger = logging.getLogger(__name__)


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
        if old.drive_file_id:
            try:
                drive.DriveClient().trash(old.drive_file_id)
            except Exception:
                logger.exception("Drive trash failed for the replaced toll statement %s", old.pk)
        if old.file:
            old.file.delete(save=False)
        old.delete()
    statement = TollStatement.objects.create(
        invoice_number=s["invoice"], account_number=s["account"], period_start=s["period_start"],
        period_end=s["period_end"], issue_date=s["issue_date"], total=s["total"], other_total=other_total, imported_by=user,
    )
    stored = False
    if drive.enabled():
        try:
            client = drive.DriveClient()
            meta = client.upload(drive.ensure_path(client, "Tolls"), drive.toll_pdf_name(statement), raw, "application/pdf")
            TollStatement.objects.filter(pk=statement.pk).update(drive_file_id=meta["id"])
            stored = True
        except Exception:
            logger.exception("Drive upload failed; keeping the toll PDF on disk")
    if not stored:  # no Drive (or it failed): keep it on this server; it moves to Drive later
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
                    "ids": [g.pk for g in group],
                })
            group = [t] if t else []
    return sorted(found, key=lambda d: (d["date"], d["label"]), reverse=True)


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


# A van's day counts as heavy when it cost this many times its usual day,
# and at least this many dollars more.
HEAVY_DAY_RATIO = 1.5
HEAVY_DAY_DOLLARS = 10


# A van whose usual day jumps and stays up (a new route) is judged against
# each part of the month, so the whole second half isn't marked heavy.
SHIFT_RATIO = 1.8
SHIFT_DOLLARS = 15
SHIFT_MIN_DAYS = 6
# ...and nearly every day after it must be at the new level.
SHIFT_STEADY = 0.9


def _median(values):
    return Decimal(str(median(values))).quantize(Decimal("0.01"))


def find_shift(costs):
    """costs: [(date, Decimal)] by date. The date the usual day changed, with
    the usual day before and after, or None."""
    best = None
    for k in range(SHIFT_MIN_DAYS, len(costs) - SHIFT_MIN_DAYS + 1):
        before, after = _median([c for _, c in costs[:k]]), _median([c for _, c in costs[k:]])
        middle = (before + after) / 2
        steady = sum(1 for _, c in costs[k:] if c >= middle) >= len(costs[k:]) * SHIFT_STEADY
        if after >= before * Decimal(str(SHIFT_RATIO)) and after - before >= SHIFT_DOLLARS and steady:
            if best is None or after - before > best["after"] - best["before"]:
                best = {"k": k, "before": before, "after": after}
    if not best:
        return None
    # The change starts on the first day that is at the new level, not on a
    # quiet day that happens to sit next to it.
    k, middle = best["k"], (best["before"] + best["after"]) / 2
    while k < len(costs) - SHIFT_MIN_DAYS and costs[k][1] < middle:
        k += 1
    return {"date": costs[k][0], "before": _median([c for _, c in costs[:k]]), "after": _median([c for _, c in costs[k:]])}


def van_days(trips):
    """Each van's tolls for each day, with its usual (median) day and the
    days that cost a lot more than that."""
    per = defaultdict(lambda: defaultdict(lambda: {"total": Decimal(0), "trips": 0}))
    labels = {}
    for t in trips:
        labels[t.vehicle_id] = str(t.vehicle)
        cell = per[t.vehicle_id][t.date]
        cell["total"] += t.amount
        cell["trips"] += not t.is_fee
    vans, heavy = [], []
    for pk, days in per.items():
        costs = sorted((d, c["total"]) for d, c in days.items())
        shift = find_shift(costs)
        usual_now = shift["after"] if shift else _median([c for _, c in costs])
        cells = {}
        for day, c in days.items():
            usual = shift["before"] if shift and day < shift["date"] else usual_now
            is_heavy = len(days) >= 3 and usual > 0 and c["total"] >= usual * Decimal(str(HEAVY_DAY_RATIO)) and c["total"] - usual >= HEAVY_DAY_DOLLARS
            times = round(float(c["total"] / usual), 1) if usual else None
            cells[day.isoformat()] = {**c, "heavy": is_heavy, "usual": usual, "times": times}
            if is_heavy:
                heavy.append({"vehicle": pk, "label": labels[pk], "date": day, "day": day.strftime("%a"), "total": c["total"],
                              "trips": c["trips"], "usual": usual, "times": times})
        vans.append({"vehicle": pk, "label": labels[pk], "usual": usual_now, "days": len(days), "shift": shift,
                     "total": sum((c["total"] for c in days.values()), Decimal(0)),
                     "heavyDays": sum(1 for c in cells.values() if c["heavy"]), "cells": cells})
    return sorted(vans, key=lambda v: -v["total"]), sorted(heavy, key=lambda h: -(h["total"] - h["usual"]))


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


# E-Toll takes disputes for this long after the statement.
DISPUTE_DAYS = 90
# A tag costing at least this much in fees is urgent (red), else yellow.
TAG_FEES_URGENT = 10


def _clock(hhmm):
    """"23:45" -> "11:45 pm"."""
    h, m = (int(x) for x in hhmm.split(":"))
    return f"{h % 12 or 12}:{m:02d} {'am' if h < 12 else 'pm'}"


def _and(parts):
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]


def todo_items(statement, van_rows, doubles):
    """What needs someone to do something, most important first. Each item
    has a stable key, so ticking it off is remembered."""
    deadline = (statement.issue_date or statement.period_end) + timedelta(days=DISPUTE_DAYS)
    items = []
    for v in van_rows:
        if v["fees"]:
            n = v["plateTrips"]
            items.append({
                "key": f"tag:{v['vehicle']}", "tone": "due" if v["fees"] >= TAG_FEES_URGENT else "warn",
                "vehicle": v["vehicle"], "filter": "tag", "amount": v["fees"],
                "title": f"Fix {v['label']}'s toll tag",
                "text": f"{n} trip{'s were' if n != 1 else ' was'} charged by number plate, costing {_dollars(v['fees'])} in fees. The tag is missing, flat or not beeping.",
            })
    for d in doubles:
        items.append({
            "key": f"double:{d['vehicle']}:{d['date']}:{d['road']}:{d['detail']}", "tone": "due",
            "vehicle": d["vehicle"], "filter": "double", "amount": d["extra"],
            "title": f"Claim back {_dollars(d['extra'])} for {d['label']}",
            "text": (
                f"Charged {len(d['times'])} times at {d['road']}, {d['detail']} on {d['date']:%d-%m}, at "
                f"{' and '.join(_clock(t) for t in d['times'])}. Ring E-Toll on 13 18 65 before {deadline:%d-%m-%Y}."
            ),
        })
    for v in van_rows:
        wk = [r for r in v["rows"] if r["weekend"]]
        if wk:
            names = {r["day"] for r in wk}
            what = "Sundays" if names == {"Sun"} else "Saturdays" if names == {"Sat"} else "weekends"
            dates = sorted({r["date"] for r in wk})
            times = sorted(r["time"] for r in wk)
            items.append({
                "key": f"weekend:{v['vehicle']}", "tone": "warn", "vehicle": v["vehicle"], "filter": "weekend",
                "amount": sum((r["amount"] for r in wk), Decimal(0)),
                "title": f"Ask about {v['label']} on {what}",
                "text": (
                    f"{len(wk)} trip{'s' if len(wk) != 1 else ''} on {_and([f'{d:%a %d-%m}' for d in dates])}, "
                    f"between {_clock(times[0])} and {_clock(times[-1])} ({_dollars(sum((r['amount'] for r in wk), Decimal(0)))})."
                    if times[0] != times[-1] else
                    f"{len(wk)} trip on {dates[0]:%a %d-%m} at {_clock(times[0])} ({_dollars(wk[0]['amount'])})."
                ),
            })
    done = set(statement.done or [])
    for item in items:
        item["done"] = item["key"] in done
    return sorted(items, key=lambda i: (i["done"], i["tone"] != "due", -i["amount"]))


def analysis(statement):
    """Everything the Tolls page shows for one statement."""
    rows = list(statement.trips.select_related("vehicle").order_by("-date", "-time"))
    doubles = double_charges(rows)
    double_ids = {pk for d in doubles for pk in d.pop("ids")}
    vans, roads = {}, defaultdict(lambda: {"trips": 0, "total": Decimal(0)})
    for t in rows:
        v = vans.setdefault(t.vehicle_id, {
            "vehicle": t.vehicle_id, "label": str(t.vehicle), "sub": t.vehicle.subtitle,
            "trips": 0, "tolls": Decimal(0), "fees": Decimal(0), "plateTrips": 0, "rows": [],
            "weekend": 0, "late": 0, "doubles": 0,
        })
        # Why a trip is flagged; its row is highlighted on the van's list.
        weekend = not t.is_fee and t.date.weekday() >= 5
        late = not t.is_fee and t.time >= LATE_FROM
        double = t.pk in double_ids
        v["weekend"] += weekend
        v["late"] += late
        v["doubles"] += double
        v["rows"].append({"date": t.date, "day": t.date.strftime("%a"), "time": t.time.strftime("%H:%M"), "road": t.road,
                          "detail": t.detail, "amount": t.amount, "isFee": t.is_fee, "byPlate": t.source == "plate",
                          "weekend": weekend, "late": late, "double": double})
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

    daily, earlier = daily_totals(statement, rows)
    grid, heavy = van_days(rows)
    compare = month_to_month(statement, van_rows)

    grid_by = {g["vehicle"]: g for g in grid}
    for v in van_rows:
        g = grid_by[v["vehicle"]]
        v["usual"], v["heavyDays"], v["shift"] = g["usual"], g["heavyDays"], g["shift"]
        v["doubleExtra"] = sum((d["extra"] for d in doubles if d["vehicle"] == v["vehicle"]), Decimal(0))

    quiet = sorted((str(v) for v in Vehicle.objects.exclude(pk__in=[v["vehicle"] for v in van_rows])), key=lambda n: (len(n), n))
    checks = []
    if total + statement.other_total != statement.total:
        checks.append(f"Trips add up to {_dollars(total + statement.other_total)}, but the statement says {_dollars(statement.total)}.")

    return {
        "statement": {
            "id": statement.pk, "invoice": statement.invoice_number, "account": statement.account_number,
            "periodStart": statement.period_start, "periodEnd": statement.period_end, "issueDate": statement.issue_date,
            "fileUrl": f"/api/tolls/{statement.pk}/file/" if (statement.file or statement.drive_file_id) else "",
        },
        "total": total, "trips": trips, "fees": fees, "perDay": round(total / days, 2) if days else None,
        "claim": sum((d["extra"] for d in doubles), Decimal(0)),
        "statementTotal": statement.total, "otherTotal": statement.other_total,
        "todo": todo_items(statement, van_rows, doubles),
        "quiet": quiet,
        "checks": checks,
        "vans": van_rows,
        "doubles": doubles,
        "roads": sorted(({"road": r, **d} for r, d in roads.items()), key=lambda r: -r["total"]),
        "runs": regular_runs(rows),
        "daily": daily,
        "earlier": earlier,
        "grid": grid,
        "heavy": heavy,
        "compare": compare,
    }

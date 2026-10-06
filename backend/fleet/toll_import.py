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
from datetime import datetime
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

    insights = []
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
    }

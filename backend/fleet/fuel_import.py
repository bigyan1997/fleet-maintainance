"""Monthly fuel card statement import (Metro Petroleum / WEX Motorpass).

Reads the tab-separated MPDATA<ddmmyy>.TXT file that comes with each
statement (the PDF has the same data but isn't machine-friendly). Each card
section is matched to a van, and every line becomes a FuelLog once the user
has checked the preview — fill-ups, and the card's other charges (AdBlue,
roadside assist, fees) with their `product` set, so each van's total matches
the statement to the cent.
"""

import re
from bisect import bisect_right
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.db import transaction

from . import sheets_sync, signals
from .models import FUEL_PRODUCT_WORDS, FuelLog, Vehicle

CARD_RE = re.compile(r"^\d{4} \d{4}$")
DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
STATEMENT_DATE_RE = re.compile(r"STATEMENT TO (\d{2} [A-Z]{3} \d{2})")
# Readings further than this per day from the previous good one are typos
# (e.g. 200,009 instead of 20,009) — the busiest van does ~500 km a day.
MAX_KM_PER_DAY = 1500
# Statement product -> what the app calls it. Anything else is tidied up
# ("ROADSIDE ASSIST" -> "Roadside assist").
PRODUCT_NAMES = {"DIESEL": "Diesel", "PREMIUM DIESEL": "Premium diesel", "ADBLUE BULK": "AdBlue"}


class ImportFileError(Exception):
    pass


def _money(text):
    text = (text or "").strip().replace(",", "")
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def _product_name(raw):
    raw = re.sub(r"\s*\(.*?\)", "", raw).strip().upper()  # drop "(Input Taxed)"
    return PRODUCT_NAMES.get(raw) or raw.capitalize()


def _is_fuel(product):
    return any(word in product.lower() for word in FUEL_PRODUCT_WORDS)


def _norm(text):
    return re.sub(r"[^A-Z0-9]", "", (text or "").upper())


def parse_statement(raw):
    """Turn the TXT file's text into {statementDate, cards: [...], skipped}."""
    text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
    if "VEHICLE REPORT AND STATEMENT" not in text:
        raise ImportFileError(
            "That doesn't look like the Metro fuel card data file. Upload the MPDATA….TXT file that comes with the statement."
        )
    m = STATEMENT_DATE_RE.search(text)
    statement_date = datetime.strptime(m.group(1), "%d %b %y").date() if m else None

    lines = text.splitlines()
    try:
        start = next(i for i, line in enumerate(lines) if line.startswith("Vehicle\tCard No."))
    except StopIteration:
        raise ImportFileError("Couldn't find the transactions in that file.")

    cards, card = [], None
    for line in lines[start + 1:]:
        cols = line.split("\t")
        if len(cols) >= 2 and not line.startswith("\t") and CARD_RE.match(cols[1].strip()):
            label = cols[0].strip()
            card = {"card": cols[1].strip(), "label": label, "rego": label.split(" ")[0], "rows": [], "charges": []}
            cards.append(card)
            continue
        fields = [c.strip() for c in line.lstrip("\t").split("\t")]
        if card is None or not DATE_RE.match(fields[0]) or len(fields) < 11:
            continue
        date_s, supplier, _abn, docket, cust_ref, odo, product, litres, _nett, _gst, gross = fields[:11]
        litres, gross = _money(litres) or Decimal("0"), _money(gross)
        if gross is None:
            continue
        name = _product_name(product)
        fuel = bool(litres) and _is_fuel(name)
        (card["rows"] if fuel else card["charges"]).append({
            "date": datetime.strptime(date_s, "%d/%m/%Y").date().isoformat(),
            "station": supplier,
            "docket": docket,
            "custRef": cust_ref,
            "product": name,
            "litres": str(litres),
            "cost": str(gross),
            "odometer": int(odo.replace(",", "")) if fuel and odo.replace(",", "").isdigit() else None,
            "odometerBad": False,
        })

    if not cards:
        raise ImportFileError("No fuel cards found in that file.")
    for c in cards:
        _check_odometers(c["rows"])
    charges = [ch for c in cards for ch in c["charges"]]
    return {
        "statementDate": statement_date.isoformat() if statement_date else None,
        "cards": cards,
        "charges": {"count": len(charges), "total": str(sum(Decimal(ch["cost"]) for ch in charges))},
    }


def _check_odometers(rows):
    """Flag readings that can't be right, so they don't drag the van's
    odometer (and service-due alerts) off course. Keeps the longest run of
    readings that only go up, then drops any that jump implausibly far."""
    with_odo = [r for r in rows if r["odometer"]]
    for r in rows:
        r["odometerBad"] = False
    # Longest non-decreasing subsequence, keeping the smallest tail at each length.
    tails, tail_idx, prev = [], [], [None] * len(with_odo)
    for i, r in enumerate(with_odo):
        k = bisect_right(tails, r["odometer"])
        prev[i] = tail_idx[k - 1] if k else None
        if k == len(tails):
            tails.append(r["odometer"])
            tail_idx.append(i)
        else:
            tails[k] = r["odometer"]
            tail_idx[k] = i
    keep = set()
    i = tail_idx[-1] if tail_idx else None
    while i is not None:
        keep.add(i)
        i = prev[i]
    last = None
    for i, r in enumerate(with_odo):
        if i not in keep:
            r["odometerBad"] = True
            continue
        if last:
            days = max(1, (datetime.fromisoformat(r["date"]) - datetime.fromisoformat(last["date"])).days)
            if r["odometer"] - last["odometer"] > MAX_KM_PER_DAY * days:
                r["odometerBad"] = True
                continue
        last = r


def match_vehicle(card, vehicles):
    """Fuel card number first (saved on the van after the first import),
    then the rego on the card or typed in at the pump."""
    digits = re.sub(r"\D", "", card["card"])
    for v in vehicles:
        if digits and re.sub(r"\D", "", v.fuel_card_number).endswith(digits):
            return v, "card"
    candidates = {_norm(card["rego"])} | {_norm(r["custRef"]) for r in card["rows"]}
    candidates = {c for c in candidates if len(c) >= 5 and not c.isdigit()}
    for v in vehicles:
        rego = _norm(v.rego)
        if any(c in rego for c in candidates):
            return v, "rego"
    return None, None


def preview(raw):
    data = parse_statement(raw)
    vehicles = list(Vehicle.objects.all())
    for card in data["cards"]:
        vehicle, how = match_vehicle(card, vehicles)
        card["vehicle"] = vehicle.pk if vehicle else None
        card["matchedBy"] = how
        _mark_duplicates(card)
    return data


def _mark_duplicates(card):
    """Already in the log — a fill-up with the same van, day and litres
    (logged by hand, or this statement imported before), or a charge with the
    same day, product and amount."""
    fills, charges = set(), set()
    if card["vehicle"]:
        for d, litres, cost, product in FuelLog.objects.filter(vehicle_id=card["vehicle"]).values_list(
            "date", "litres", "cost", "product"
        ):
            fills.add((d.isoformat(), litres))
            charges.add((d.isoformat(), product, cost))
    for r in card["rows"]:
        r["duplicate"] = (r["date"], Decimal(r["litres"])) in fills
    for ch in card["charges"]:
        ch["duplicate"] = (ch["date"], ch["product"], Decimal(ch["cost"])) in charges


def _note(row, statement_date):
    parts = [row["station"].title()]
    if row["odometerBad"] and row["odometer"]:
        parts.append(f"statement odometer {row['odometer']:,} km looked wrong, not used")
    stamp = datetime.fromisoformat(statement_date).strftime("%d-%m-%Y") if statement_date else ""
    parts.append(f"imported from fuel statement {stamp}".strip())
    return " · ".join(parts)


def import_statement(raw, assignments):
    """Create FuelLogs for every line not already logged. `assignments` maps
    card number -> vehicle id (the user can override the automatic match or
    leave a card out with None). Returns counts."""
    data = parse_statement(raw)
    vehicles = {v.pk: v for v in Vehicle.objects.all()}
    created = charges = duplicates = 0
    touched_cards = 0
    signals.suspended = True  # one mirror push at the end, not one per row
    try:
        with transaction.atomic():
            for card in data["cards"]:
                vehicle = vehicles.get(assignments.get(card["card"]))
                if not vehicle:
                    continue
                card["vehicle"] = vehicle.pk
                _mark_duplicates(card)
                for r in card["rows"] + card["charges"]:
                    if r["duplicate"]:
                        duplicates += 1
                        continue
                    FuelLog.objects.create(
                        vehicle=vehicle,
                        date=r["date"],
                        litres=Decimal(r["litres"]),
                        cost=Decimal(r["cost"]),
                        product=r["product"],
                        odometer=None if r["odometerBad"] else r["odometer"],
                        invoice_number=r["docket"],
                        notes=_note(r, data["statementDate"]),
                    )
                    created += 1
                    charges += r in card["charges"]
                good = [r["odometer"] for r in card["rows"] if r["odometer"] and not r["odometerBad"]]
                fields = []
                if good and max(good) > vehicle.odometer:
                    vehicle.odometer = max(good)
                    fields.append("odometer")
                if not vehicle.fuel_card_number:
                    vehicle.fuel_card_number = card["card"]
                    fields.append("fuel_card_number")
                if fields:
                    vehicle.save(update_fields=[*fields, "updated_at"])
                touched_cards += 1
    finally:
        signals.suspended = False
    if created and sheets_sync.configured():
        transaction.on_commit(lambda: sheets_sync.push_model("Vehicle"))
    return {"created": created - charges, "charges": charges, "duplicates": duplicates, "cards": touched_cards}

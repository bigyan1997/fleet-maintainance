---
name: fuel-invoice-import
description: "The monthly Metro/WEX fuel statement import (Fuel → Import statement), in real use since 2026-09-30, and its data quirks"
metadata:
  node_type: memory
  type: project
  modified: 2026-10-01T03:07:50.762Z
---

Fuel supplier: **Metro Petroleum card (WEX Motorpass)**, account 146 687 306. A statement arrives monthly (period ends ~8th) as a PDF plus `MPDATA<ddmmyy>.TXT`; the importer reads only the TXT (tab-separated, 11 fields per transaction line). Code: `fleet/fuel_import.py`, `FuelImport.jsx`. Samples are in `samples/` (gitignored, since they hold card numbers).

What it does: matches each card to a van (by fuel card number, else rego on the card or typed at the pump) and imports every line with `FuelLog.product`. Fees, roadside assist and AdBlue are imported as charges, so each van's total matches the statement to the cent; litres, $/L and L/100km count diesel only. Odd odometer readings (not monotonic, or more than 1,500 km/day) are not used and are noted instead. Duplicates (same van, date and litres, or for charges same date, product and cost) are skipped, so re-uploading adds nothing.

State: statement to 08-09-2026 imported for real (148 rows, all 11 fuel cards saved on the vans). The Fuel tab opens on the latest statement period (latest fuel date minus one month, + 1 day).

Known quirks: drivers type junk pump refs (12345); Van 6's card header says FWF886 but the van is FWF88G; Van 3 (FYT15L) often has blank odometers and had one 200,009 typo.

**How to apply:** if a new statement fails, compare its TXT layout to the sample first. Test imports inside a rolled-back transaction (see [[live-data-testing]]). See [[open-items]].

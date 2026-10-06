---
name: toll-statement-import
description: Tolls tab imports the monthly E-Toll statement PDF; fleet vans only; non-fleet vehicles left out on request
metadata:
  type: project
---

Since 2026-10-06 the app has a 7th tab, **Tolls** (between Fuel and Reports): "Import statement" takes the monthly E-Toll (Transport for NSW) Statement/Tax Invoice PDF (account 2457457, period ends ~28th, same layout every month). Code: `fleet/toll_import.py` (pypdf), `TollsView.jsx`; sample `samples/toll_280926.pdf` (gitignored).

The user asked to leave out vehicles on the toll account that aren't fleet vans (Discovery CZ78BV, Audi Q5 CLC32W, "Dad" YCZ83Y): anything not matching a van's rego is dropped and only its total is kept, so vans + left out = statement total.

Quirks: the account lists Van 5's plate as YNUO5R (letter O) for rego YNU05R; Van 8's rego is stored as "DG42KJ (was YKG52J)". First statement (29-08 to 28-09-2026): 415 van trips, $2,795.21; Van 11 and Van 7 tags not being read ($20.30 and $2.75 video matching fees). Tolls are not yet in Home's "spent this month" or Reports.

Analysis added the same day (user chose all six ideas): Double charges (same toll point within 15 min), Odd times (the user's own rules: any trip at or after 12 pm, or on a Saturday or Sunday), Regular runs, Day by day, Month to month, plus tolls in Home's "spent this month" and "Full running cost by van" in Reports -> Spending. Screens were checked with headless Chrome via puppeteer-core in the scratchpad (session cookie made in the Django shell; Vite 5174 + runserver 8011).

**How to apply:** if a new statement fails, compare its text (`toll_import.pdf_text`) with the sample first. Related: [[fuel-invoice-import]], [[ui-style-preference]] (a 7th tab was added without a mock-up; the user had asked to "find a way").

Files: the toll PDF itself is kept in Google Drive (Tolls/ folder) once Drive is connected on the server; otherwise on the server's disk, and it moves to Drive by itself later. Same for photos (Incidents|Services/<van>/, named by date) and van documents (Documents/<van>/). See NOTES.md ("PDFs and documents in Drive too").
---
name: open-items
description: "What's still open or waiting on the user for the fleet app, and decisions already made (as of 2026-10-01). Check before assuming done."
metadata:
  node_type: memory
  type: project
  modified: 2026-10-01T03:08:33.047Z
---

Data facts as of 2026-10-01 (re-check before quoting):
- 11 vans, every service interval 10,000 km (Van 2 was 8,000 and Van 3 was 40,000; changed at the user's OK). Van 3 has no scheduled service logged, so it shows no next service.
- Rego expiry entered for all 11 vans; insurance expiry for none. Home shows "Insurance date missing for 11 vans" until they're filled in (Vans → Rego & insurance dates).
- 10 drivers, 6 vans have a usual driver. Mechanics: Canterbury Toyota, Driven Mobile Mechanic, Frank Tyres, Metro, Service Central, Zero (the user added most of them).
- Fuel: one Metro/WEX statement imported (to 08-09-2026), 148 rows (113 fill-ups + 35 fees/charges), all 11 vans have a fuel card number. The next statement is due around 08-10.
- 35 finished services have no cost (from the legacy sheet), so spending totals are understated.
- 3 copied VINs from the legacy sheet are still shared (one on 4 vans, two on 2 each). Offered to list them for fixing; not picked.
- Washes: take-home vans (1, 2, 4, 9, 10, 11) are "No need"; Vans 5–8 have no wash logged.
- 2 old services still name Frank Tyres / Canterbury Toyota / Marrickville Auto Body only in their notes (the mechanic field is empty). The user only asked to move Service Central / Driven / Metro.

Waiting on the user:
- OK on the proposed van renames (stored make/model like "Van 3- Mercedez" / "Hi-ACE SWLB" and Van 8's rego "DG42KJ (was YKG52J)"). These change real data, so wait for a yes. Display is already tidied: "Van 4" + "Toyota HiAce SLWB · YKG89N" via Vehicle.short_name/subtitle.
- Task Scheduler: tick "Run whether user is logged on or not" on "Fleet Maintenance keep-alive" (needs their Windows password). Still Interactive on 2026-10-01, so after a reboot the app only returns once someone logs in. See [[live-server-deploy]].
- Insurance dates for all vans.

Decided / removed (don't re-pitch):
- The SaaS-style redesign (sidebar, Today feed, Jobs board) was rejected and the classic layout restored, then simplified (see [[ui-style-preference]]). Redesign proposal: (link omitted); simplicity proposal: (link omitted) (all 14 changes built).
- Removed at the user's request: the weekly summary email, the Team page (activity page + logins/password management), and anything that says "Claude" in the app. Everyone shares ONE login (the shared office Google account) by choice. Activity is still recorded and shown per van as Change history.
- Reading mechanic invoices from photos/PDFs: discussed and declined. Only the fuel statement import reads files.
- Not picked from the 2026-10-01 suggestions: trimming unused service types (only Van wash was removed from the "What" list, because "a van wash is not a service"), the all-washed button, a fuel statement reminder, a phone icon.

Home rules agreed 2026-10-01:
- "Needs doing" lists only things needing action. A due/overdue service or tyre change that's already booked leaves the list and comes back only if the booked date passes while still Booked.
- Each service's invoice arrives about a month after the work, so "Waiting for invoices" (right column) is normal. An invoice counts as late only after 45 days; then it appears in Needs doing.
- The middle box is "Booked & at the mechanic".

Remote access: Tailscale runs on this PC as bigyan-desktop (its Tailscale address, the company tailnet); its names are in DJANGO_EXTRA_HOSTS in .env. QR sticker links default to http://DESKTOP-OB7PD9F:8001; phones may not resolve that name, so a fixed LAN IP (router reservation) may be needed.

**Why:** these were raised but not closed, or decided, so later sessions don't redo or re-ask them. See [[user-profile]].

- 2026-10-06: PUSHED (Tolls tab + redesign, Drive for photos, toll PDFs and documents, notes, CLAUDE.md and a cleaned copy of this memory in docs/claude-memory/). Still to do by the user on the orders PC: connect Drive there, by copying backend/secrets/drive-token.json from the dev PC, or by putting FLEET_DRIVE_TOKEN_FILE=<full path to NPD's token> in the orders PC's backend/.env (the user does this; I must not read NPD's token, the safety classifier blocks it). Until then files are saved on the orders PC's disk with a yellow note and move to Drive by themselves afterwards. Then import the toll PDF at http://100.66.249.69:8002 (the dev PC's database is a separate, older copy). Unanswered: keep the 12 pm "after 12 pm" flag or move it later; ignore late Sunday-night starts? Task Scheduler tick on the orders PC ("Run whether user is logged on or not") is also still unconfirmed.

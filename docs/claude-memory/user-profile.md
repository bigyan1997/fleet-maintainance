---
name: user-profile
description: Who the user is and how they like to work on the Fleet Maintenance app
metadata:
  node_type: memory
  type: user
  modified: 2026-09-30T03:24:19.850Z
---

Bigyan Karki, at Achieve Cafe Provisions. Owns two internal tools on this PC: Fleet Maintenance (this repo) and NPD Tracker. Not a developer — writes short, casual messages with typos and often ends with "do you get what I mean". They and their boss are the only users of the fleet app, and both use one shared login (the shared office Google account) on purpose: don't suggest separate accounts.

How they like to work:
- When a request is ambiguous, restate it in one plain-English line with a concrete example, then build — they reply "yes"/"lets go" rather than answering either/or questions, so pick a sensible default and say which.
- Show results in terms of what they'll see on screen (tabs, buttons, colours), not code.
- The live app is on the orders PC and only changes when something is pushed (it auto-deploys in about 10 minutes; see [[live-server-deploy]]). Push to GitHub ONLY when they say "push"; until then show changes with screenshots or the local copy (http://localhost:5174 on the dev PC) and say it isn't pushed yet.
- Times and dates are Australian (Sydney, AEST/AEDT incl. daylight saving) everywhere: server, screens, defaults like "today". Asked 2026-10-01.
- They test on the real app and send screenshots; tell them to press Ctrl + F5 after an update. Steer them to the orders PC address (http://orders-hostcomputer:8002 over Tailscale), never to an IP that can change.
- Before building a bigger change, give a short recommendation or picture first (they ask "what do you think" / "give me your proper suggestion"); for small fixes just do it.
- Label every figure on screen with what it includes (e.g. "Fuel | Card fees | Total (as on statement)", "Diesel only (AdBlue not included)") and add totals rows — asked 2026-09-30 after two different Van 7 fuel numbers ($409 vs $422) confused them. Money checked against a statement is shown to the cent.
- Dates everywhere are dd-mm-yyyy; they like "3 days ago" style helpers next to dates.

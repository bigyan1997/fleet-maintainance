---
name: ui-style-preference
description: "User rejected the \"company app\" redesign (navy sidebar, Today page, Jobs board); wants the classic blue top bar + tabs, kept simple"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-09-30T06:59:48.290Z
---

On 2026-09-30 I rebuilt the fleet app as a SaaS-style app (dark navy sidebar, Today "needs attention" feed, kanban Jobs board, + New menu, big stat tiles) because they asked for it to "look like a real world application used by company". After trying it they said "i dont like these all design, lets go back to before once but make it more simple and easy to use". The classic look was restored: blue TopBar, a row of quick-action buttons, one row of tabs, and the original Dashboard.

**Why:** they value familiarity and simplicity over a polished-looking redesign. Big layout changes cost them re-learning, and a busy feed felt worse than the plain tables they knew.

On 2026-10-01 they also had the Weekly email tab and the Team page removed, and asked that nothing in the app says "Claude". They then approved a picture-first simplicity proposal: tabs Home · Vans · Services · Washes · Fuel · Reports, only Log wash + Log service beside them, short van names, plain status words (Booked · At mechanic · Waiting for invoice · Done), filters folded under "Filters ▾", no number-box arrows, Home with Needs doing (left) and Booked & at the mechanic + Waiting for invoices (right).

On 2026-10-08 a four-tab, plain-words redesign was built and the user rejected it after trying it ("dont like it, change it to the ones we had before"): the seven-tab layout stays. See [[simplify-plan]].

**How to apply:**
- Add new features inside the existing tabs and pop-ups. Don't introduce new navigation paradigms.
- Keep the app lean: build what they ask for, not extra pages. Never put "Claude" in any user-facing text.
- Before any big visual change, show a quick screenshot or mockup and get a yes first. Their "make it look professional" wording turned out to mean polish, not a new structure.
- See [[user-profile]] and [[open-items]].

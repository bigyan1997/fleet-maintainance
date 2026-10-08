---
name: simplify-plan
description: The 2026-10-08 "simplify the whole app" redesign (4 tabs, plain words, short forms) was built and then REJECTED by the user; kept in a git stash only
metadata:
  type: project
---

On 2026-10-08 I proposed (picture first) and then built a full simplification: four tabs Home / Vans / Jobs / Money, a one-sentence Home with a To do list, 3-question forms, a single "Add a statement" drop box, a Money overview, plain-words boxes on Fuel and Tolls, and word swaps (Incident -> Problem, Heavy day -> Costly day, ...). The user checked it locally and said "nah dont like it change it to the ones we had before".

Reverted the same day to the pushed version (seven tabs: Home, Vans, Services, Washes, Fuel, Tolls, Reports, with Log wash + Log service). The rejected work is saved as `git stash` entry "Simplification 2026-10-08 ..." (stash@{0} at the time) in the dev repo, only in case they change their mind (`git stash list`, `git stash show -p`). It was never committed or pushed.

**Kept on purpose:** insurance is NOT tracked (their earlier, separate decision "we are not doing the insurance, leave insurance"): no insurance warnings, field, column or Home reminder; the DB column and the Sheet column stay. A test covers it.

**Why it was rejected:** unknown; they gave no reason. Both of their redesigns (2026-09-30 SaaS-style, 2026-10-08 simplification) were rejected after being built, so they prefer the familiar layout and small changes.

**How to apply:** do not re-propose a tab restructure or a big redesign. If they ask for "simpler", offer small, separate changes one at a time, ask which, and show a picture first. If they liked only parts (e.g. the plain-words summaries on Fuel and Tolls), ask before bringing them back. See [[ui-style-preference]].

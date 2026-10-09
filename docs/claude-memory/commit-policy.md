---
name: commit-policy
description: "Commit/push conventions for this repo — no AI attribution, push straight to main, never commit secrets"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-09-30T01:11:40.908Z
---

Commit without any "Co-Authored-By: Claude" or "Generated with Claude Code" lines, and push directly to `main` (solo public repo; `gh` CLI isn't installed, so no PRs). Only commit/push when the user says "push".

**Why:** NOTES.md records a no-AI-attribution policy (same as NPD Tracker), which overrides the default attribution reminder; the repo is public.

**How to apply:** before every commit, check the staged list has no backend/.env, backend/secrets/*, backend/media/*, backend/logs/*, samples/*, frontend/dist or backend/staticfiles; update NOTES.md's status section when a feature lands. See [[google-sheets-setup]].

Reaffirmed 2026-10-06: "dont push anything until i say now". Commit locally if useful, but no `git push` until the user says push. Because the real app is on the orders PC (see [[live-server-deploy]]), unpushed work is not visible to them there; show it with a picture or screenshots from this PC instead.

Update 2026-10-06 (evening): the user said "push to github" after holding it all day, and everything was pushed (commit b72a3f4). The hold is over; the rule is still: push only when told.

Lesson 2026-10-09: someone at the office (a Claude session on the orders PC) can push to main between my pushes (it removed insurance on 07-10 while I was working). Always `git fetch` before trusting `git status`, and expect a rebase conflict on NOTES.md/USAGE.md/shared screens; resolve by keeping the office's wording for what it already did and mine for the rest, then re-run the tests and build before pushing.


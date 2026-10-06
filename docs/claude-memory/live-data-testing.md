---
name: live-data-testing
description: "How to test against the real fleet database without leaving junk behind, plus Windows shell quirks"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-09-30T01:11:45.830Z
---

**Update 2026-10-06:** the real data now lives in the orders PC's own Postgres. This dev PC's database (DB_HOST=127.0.0.1; its pg_hba.conf only allows local connections) is a separate, older copy, so nothing done here reaches the real app's data, and the real data can't be inspected from here. Anything the user must see (e.g. a toll statement import) has to be done through the app at http://100.66.249.69:8002. Testing here is now safe, but still roll back or clean up to keep the copy tidy.


There is only one database and it's the real one (both users are editing it live). Test writes inside `transaction.atomic()` and raise to roll back; if a test must go through the API, record the created IDs and clean up in a `finally`, and restore any field you change.

**Why:** on 2026-09-30 a test script crashed before cleanup and left two fake washes in the real data for a minute; a real wash logged by the user at the same time had to be told apart by created_at before deleting.

**How to apply:**
- Before deleting anything "test", list candidates with created_at and delete only by explicit ID.
- Printing non-ASCII (✕, ·, —) from `manage.py shell` on this Windows console crashes with cp1252 UnicodeEncodeError — keep test output ASCII or `.encode('ascii','replace')`.
- Git Bash heredocs here mangle backslashes (`\\n` became a real newline inside Python string literals) — for code containing backslashes, use the Edit tool or `chr(92)` instead of inline heredoc text. See [[live-server-deploy]].

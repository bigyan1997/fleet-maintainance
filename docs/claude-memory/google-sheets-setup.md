---
name: google-sheets-setup
description: "Google service account, key location, and the two sheet IDs used by import and mirror"
metadata:
  node_type: memory
  type: reference
  modified: 2026-09-30T01:11:38.053Z
---

- Service account: fleet-management@fleet-maintenance-500122.iam.gserviceaccount.com (Google Cloud project fleet-maintenance-500122). This project's own key — NOT NPD Tracker's; reading NPD's secrets folder is blocked by the safety classifier, don't try.
- Key file: backend/secrets/service-account.json (gitignored).
- Legacy sheet (import source, Viewer): (id: FLEET_LEGACY_SHEET_ID in the server's .env) "Fleet Maintenance DB". One-time import already run — `import_from_sheet` refuses a non-empty DB.
- Mirror sheet (Editor): (id: FLEET_SHEET_ID in the server's .env) "Fleet Management v2", tabs rewritten on every change; `python manage.py sync_sheet` forces a full rewrite.
- GitHub: https://github.com/bigyan1997/fleet-maintainance (public). See [[commit-policy]].

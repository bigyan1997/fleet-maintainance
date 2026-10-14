---
name: this-is-the-orders-pc
description: "Working on the orders PC (the live server on :8002): what is different from the dev PC, hand deploy, backups, sign-in gap"
metadata:
  type: project
---

Claude Code is also used on the **orders PC**, in the folder that serves the live app on port 8002. Most other notes here were written on the dev PC, so where they say "this PC" they mean the dev PC. Install this note only on the orders PC.

On the orders PC the database is the real one and `backend/.env` has the real `FLEET_SHEET_ID`, so follow [[live-data-testing]] strictly (roll back or clean up by ID) and keep the working tree clean: uncommitted changes pause auto-deploy.

**Changes made on the orders PC don't auto-deploy** (auto-deploy only acts when GitHub is ahead, and after a push from here HEAD already equals GitHub). After the owner says push: build the frontend to `dist-next` (`npm run build -- --outDir dist-next --emptyOutDir`), swap it into `dist`, migrate, `collectstatic --noinput`, then stop waitress on 8002 (`run_server.bat` restarts it).

**Never run a plain `npx vite build` there.** It writes straight into the live `frontend/dist`, and the page goes blank (the new file names 404) until collectstatic and a restart. This happened on 2026-10-14 while pushing the new look; the owner saw a blank page.

**Previewing without touching live data:** the app's Postgres role cannot create databases. What works: `manage.py dumpdata` from the live database (read-only) and `loaddata` into a sqlite file, with a settings module outside the repo that imports the real settings and overrides DATABASES, an empty FLEET_SHEET_ID, a missing FLEET_DRIVE_TOKEN_FILE and its own MEDIA_ROOT; `runserver 8011` with that module, and Vite on 5174 from a git worktree beside the repo (node_modules as a junction) so the live folder stays clean. Start it from Bash, not PowerShell (`$env:X=''` deletes the variable, so the real sheet ID leaks in). Login is by email, so a preview user needs an email.

**Backups (2026-10-14):** scheduled task "Fleet Maintenance Backup" (8 pm, `backup.vbs` -> `manage.py backup_database`) copies the database to `backend/logs/backups/` and Drive `Backups/`, 30 days kept, log `backend/logs/backup.log`. The task was made by hand, not by the repo.

**Sign-in gap:** every task on the orders PC runs only while the Windows user is signed in. On 2026-10-14 the owner tried the password fix, found it needs the Microsoft account password (the screen PIN does not work), was offered a no-password (S4U) version, and said "ok leave it then". Don't re-pitch unless they raise it.

Machine details and passwords are in the gitignored `DEPLOYMENT_NOTES.md` on that PC. See [[live-server-deploy]].

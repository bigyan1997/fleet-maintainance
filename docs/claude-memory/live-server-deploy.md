---
name: live-server-deploy
description: "How the always-on fleet app is served on this PC (hidden, watchdog-restarted) and how to redeploy after a change"
metadata:
  node_type: memory
  type: project
  modified: 2026-10-01T01:52:58.871Z
---

**Update 2026-10-06:** the real server is now the **orders PC**, port **8002**: http://100.66.249.69:8002 (Tailscale), set up in commit d4f250a ("Serve from the orders PC on port 8002, NPD-style keep-alive and auto-deploy"). Its `auto_deploy.ps1` (task "Fleet Maintenance Auto Deploy") checks GitHub main every 5 minutes, then runs npm ci/build and migrate itself, so a change reaches it only after a **push**, about 5-10 minutes later. The 8001 setup below is on this dev PC (and may be outdated). Always pull before pushing, because the orders PC setup commits to main too. auto_deploy.ps1 does `git fetch` + `git merge --ff-only` (it skips the update if tracked files were edited by hand there), then tests, build, migrate, restart, and rolls back on failure. Everything in the repo (NOTES.md, CLAUDE.md, docs/) therefore arrives on the orders PC by itself. auto_deploy.ps1 does `git fetch` + `git merge --ff-only` (it skips the update if tracked files were edited by hand there), then tests, build, migrate, restart, and rolls back on failure. Everything in the repo (NOTES.md, CLAUDE.md, docs/) therefore arrives on the orders PC by itself.

Older notes: the real app both users use is NOT the dev server. It's waitress on 0.0.0.0:8001 started by `run_server.bat` (collectstatic then waitress). Since 2026-10-01 it runs **hidden** (no console window) and is kept alive by `keep-alive.ps1` (repo root), launched through `keep-alive.vbs` so no window flashes:
- Scheduled task **"Fleet Maintenance keep-alive"** (user fleet): every 2 minutes forever plus at logon, allowed on battery. It (re)starts the app if port 8001 isn't listening or doesn't answer, and leaves a copy alone for 3 minutes while it starts up. Restarts are logged to `backend/logs/keep-alive.log` (gitignored).
- The Startup-folder shortcut "Fleet Maintenance Server.lnk" now runs `wscript keep-alive.vbs` (it used to open run_server.bat minimised).
- Laptop power: sleep/hibernate set to never on AC and battery. Lid action was set to "do nothing", but powercfg couldn't confirm it on this machine.
- Gap: the task runs only while fleet is logged in, until the user ticks "Run whether user is logged on or not" in Task Scheduler and types the Windows password (asked 2026-10-01). Check `(Get-ScheduledTask 'Fleet Maintenance keep-alive').Principal.LogonType` before assuming.

NPD Tracker runs separately on 8000 from `C:\Users\fleet\npd-tracker` (v1 folder) with the old minimised-window setup; the watchdog only matches fleet's processes. Dev servers (8011 Django / 5174 Vite) may also be running.

Boss opens it over the LAN at http://DESKTOP-OB7PD9F:8001 (preferred; the Wi-Fi IP is DHCP, currently the LAN address, and the user sometimes bookmarks the IP). Remote access works at http://bigyan-desktop:8001 over Tailscale (DJANGO_EXTRA_HOSTS in backend/.env). The firewall rule "Fleet Maintenance (8001)" exists. App addresses are clean paths (/services, /vans/29) since 2026-10-01; old /#/ links are upgraded on load.

**Why:** changes aren't visible to the user or boss until the 8001 server serves them, and the user asked for the site to be "always on no matter what".

**How to apply:** after any code change: run `npx vite build` in frontend/ (if the frontend changed) and any migrations. Then restart 8001: stop every process whose command line matches `fleet-maintenance\run_server.bat` or `waitress-serve.*:8001`, then `Start-ScheduledTask 'Fleet Maintenance keep-alive'` (starts it hidden). Do NOT `Start-Process run_server.bat` with a visible window. Poll until 8001 listens (~5–15 s) and confirm the served JS contains the new text. See [[user-profile]].

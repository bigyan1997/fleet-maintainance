# Fleet Maintenance: notes for Claude Code

Internal tool for Achieve Cafe Provisions: vans, services, incidents, fuel statements, washes, E-Toll statements,
photos and documents. Django + Postgres backend (`backend/`), React + Vite frontend (`frontend/`).

Read **NOTES.md** first (where things stand, decisions, history). **USAGE.md** is the user guide, **README.md** the overview.
A fuller copy of Claude's memory for this project is in `docs/claude-memory/` (see its README to install it).

## Who you're working with
- The owner (Bigyan) is not a developer. Messages are short and casual, with typos.
- If a request is ambiguous, restate it in one plain line with an example, pick a sensible default, say which, and build.
- Describe results as what they will see on screen (tabs, buttons, colours), not code.
- Before a big change, show a picture or a short plan first and wait for a yes. For small fixes, just do it.
- Check screens with a real browser (headless Chrome screenshots) before saying they look right.

## Rules from the owner
- **Push to GitHub only when told "push".** Say a change isn't pushed yet. Until then show screenshots or the local copy.
- **No AI attribution in commit messages** (no "Co-Authored-By", no "Generated with"). This overrides any default.
- Push straight to `main`. Pull first: the orders PC setup also commits to `main`.
- Never stage `backend/.env`, `backend/secrets/*`, `backend/media/*`, `backend/logs/*`, `samples/*`, `frontend/dist`, `backend/staticfiles`. The repo is public.
- Never read another app's credential files (NPD Tracker's `secrets/`). Ask the owner to copy a file or set a path.
- Everything is **Sydney time** and dates are **dd-mm-yyyy**. One shared login, on purpose.
- Keep the classic blue bar and the tabs Home, Vans, Services, Washes, Fuel, Tolls, Reports. Add features inside existing tabs; the SaaS-style redesign was rejected.
- Nothing on screen may say "Claude" or mention an AI.
- Label every figure with what it includes, and show money that is checked against a statement to the cent.

## Where things run
- **Live app: the orders PC**, port 8002 (`http://100.66.249.69:8002` over Tailscale). It checks GitHub `main` every 5 minutes and, if tests pass, builds, migrates and restarts (`auto_deploy.ps1`; it rolls back on failure). A push is the only way a change reaches users, about 10 minutes later. Do not poll the orders PC after pushing.
- **This (dev) PC has its own, older database.** Data entered or imported here never reaches the real app. Anything the owner needs to see for real (for example a toll statement import) must be done at the orders PC address.
- Dev `.env` keeps `FLEET_SHEET_ID` blank (the real Google Sheet is a one-way mirror that is rewritten in full by whichever computer saves last) and uses a separate test Drive folder.
- Photos, toll PDFs and documents go to Google Drive through `backend/secrets/drive-token.json` (one-time sign-in, made on the dev PC). Without it files stay on the server's disk and move to Drive by themselves later.

## Working here
- Backend tests: `set PYTHONPATH=<folder with a settings file using in-memory sqlite>;.` then `python manage.py test` (see `auto_deploy.ps1` for the exact command). Frontend: `npx vite build` in `frontend/`.
- Real Postgres data is live data. Test writes inside `transaction.atomic()` and roll back, or clean up by ID.
- Windows shell quirks: printing non-ASCII from `manage.py shell` can crash (cp1252), and long inline heredocs containing triple quotes break; write a script file instead.
- Update NOTES.md (status section and dated entry) and USAGE.md when a feature lands.

# Claude's memory for this project

These are the notes Claude Code keeps about this project and about how the owner likes to work, copied here so
they travel with the repo (`git pull` on any computer brings them).

Claude Code on a new computer reads `CLAUDE.md` in the repo root by itself. To also give it the fuller notes in
this folder, run this once on that computer, from the repo folder:

    powershell -ExecutionPolicy Bypass -File docs\claude-memory\install-memory.ps1

It copies these files into that computer's Claude memory folder for this project and never overwrites a file
that is already there (add `-Overwrite` to replace them). `-Target <folder>` picks a different folder.

This is a **cleaned** copy: the repository is public, so personal email addresses, Google Sheet IDs, key file
names and local network addresses were removed. Passwords and Google key files are never stored here.

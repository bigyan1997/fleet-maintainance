"""Nightly copy of the whole database.

`manage.py backup_database` (run each evening by the scheduled task
"Fleet Maintenance Backup", through backup.vbs) writes one pg_dump file per
day to backend/logs/backups/ and puts a copy in Google Drive under
"<root>/Backups". Copies older than KEEP_DAYS are removed from both places,
but only after today's copy has been made and checked, so a run of failures
can never empty the folder. Photos and PDFs are not in the file: they already
live in Drive.

To get the data back:  pg_restore --clean --if-exists -d <database> <file>
"""
import glob
import os
import shutil
import subprocess
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.utils import timezone

from . import drive

KEEP_DAYS = 30
DRIVE_FOLDER = "Backups"
PREFIX = "BACKUP-"


class BackupError(Exception):
    pass


def local_folder():
    return settings.BASE_DIR / "logs" / "backups"


def backup_name(day=None):
    """BACKUP-14102026.dump, the same day-month-year style as the other Drive files."""
    return f"{PREFIX}{day or timezone.localdate():%d%m%Y}.dump"


def find_tool(name):
    """pg_dump / pg_restore: on the PATH, or in the newest PostgreSQL install."""
    found = shutil.which(name)
    if found:
        return found
    installs = sorted(glob.glob(rf"C:\Program Files\PostgreSQL\*\bin\{name}.exe"), reverse=True)
    if not installs:
        raise BackupError(f"{name} was not found on this computer.")
    return installs[0]


def _run(args, password):
    result = subprocess.run(args, capture_output=True, text=True, env={**os.environ, "PGPASSWORD": password})
    if result.returncode != 0:
        raise BackupError(f"{Path(args[0]).stem} failed: {(result.stderr or '').strip()[-500:]}")
    return result.stdout


def dump_database(dest):
    """Write the database to `dest` and read the file back to prove it opens."""
    db = settings.DATABASES["default"]
    if "postgresql" not in db["ENGINE"]:
        raise BackupError("Only a Postgres database can be backed up this way.")
    partial = dest.with_suffix(".partial")
    _run(
        [find_tool("pg_dump"), "--format=custom", "--no-owner", "--no-privileges", f"--file={partial}",
         f"--host={db['HOST']}", f"--port={db['PORT']}", f"--username={db['USER']}", db["NAME"]],
        db["PASSWORD"],
    )
    tables = _run([find_tool("pg_restore"), "--list", str(partial)], "").count(" TABLE DATA ")
    if not tables:
        partial.unlink(missing_ok=True)
        raise BackupError("the backup file has no tables in it.")
    partial.replace(dest)
    return tables


def prune_local(folder, cutoff):
    removed = 0
    for path in folder.glob(f"{PREFIX}*.dump"):
        if path.stat().st_mtime < cutoff.timestamp():
            path.unlink()
            removed += 1
    return removed


def send_to_drive(path, cutoff):
    """Upload today's file (replacing an earlier one from the same day) and
    bin the copies older than the cutoff. Returns how many were binned."""
    client = drive.DriveClient()
    folder_id = drive.ensure_path(client, DRIVE_FOLDER)
    existing = [f for f in client.list_files(folder_id) if f["name"].startswith(PREFIX)]
    client.upload(folder_id, path.name, path.read_bytes(), "application/octet-stream")
    removed = 0
    for f in existing:
        if f["name"] == path.name:
            client.trash(f["id"])
        elif drive.parse_time(f.get("createdTime")) < cutoff:
            client.trash(f["id"])
            removed += 1
    return removed


def run():
    """Make today's backup. Returns one line describing what happened."""
    folder = local_folder()
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / backup_name()
    tables = dump_database(dest)
    cutoff = timezone.now() - timedelta(days=KEEP_DAYS)
    prune_local(folder, cutoff)
    summary = f"{dest.name}: {tables} tables, {dest.stat().st_size / 1024:,.0f} KB"
    if not drive.enabled():
        return summary + ". Saved on this computer only: Google Drive isn't connected."
    try:
        removed = send_to_drive(dest, cutoff)
    except Exception as exc:  # the local copy is still good; say so rather than fail
        raise BackupError(f"{summary}. Saved on this computer, but the copy to Google Drive failed: {exc}")
    return summary + f". Copied to Google Drive ({DRIVE_FOLDER})" + (f", {removed} old copy(ies) removed." if removed else ".")

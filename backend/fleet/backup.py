"""Nightly copy of the whole database.

`manage.py backup_database` (run each evening by the scheduled task
"Fleet Maintenance Backup", through backup.vbs) writes one pg_dump file per
day to backend/logs/backups/ and puts a copy in Google Drive under
"<root>/Backups". Only the last KEEP_DAILY days are kept one by one, plus the
newest copy of each of the KEEP_WEEKS weeks before that; the rest are removed
from both places, but only after today's copy has been made and checked, so a
run of failures can never empty the folder. Photos and PDFs are not in the file: they already
live in Drive.

To get the data back:  pg_restore --clean --if-exists -d <database> <file>
"""
import glob
import os
import re
import shutil
import subprocess
from datetime import date, datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.utils import timezone

from . import drive

KEEP_DAILY = 7  # every one of the last 7 days
KEEP_WEEKS = 4  # then the newest of each week, for 4 more weeks
DRIVE_FOLDER = "Backups"
PREFIX = "BACKUP-"


class BackupError(Exception):
    pass


def local_folder():
    return settings.BASE_DIR / "logs" / "backups"


def backup_name(day=None):
    """BACKUP-2026-10-14.dump: year first, so the files sort with the newest last."""
    return f"{PREFIX}{day or timezone.localdate():%Y-%m-%d}.dump"


def date_from_name(name):
    """The day a backup was made, from either naming style (BACKUP-2026-10-14 or
    the older BACKUP-14102026); None if the name has no date."""
    m = re.match(rf"{PREFIX}(\d{{4}})-(\d{{2}})-(\d{{2}})", name)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    m = re.match(rf"{PREFIX}(\d{{2}})(\d{{2}})(\d{{4}})", name)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    return None


def to_remove(items, today):
    """Which backups to delete. `items` is [(key, day)]. Kept: the last
    KEEP_DAILY days, and the newest copy of each of the KEEP_WEEKS weeks
    before them. Anything older than that goes."""
    newest_in_week = {}
    for key, day in items:
        age = (today - day).days
        if KEEP_DAILY <= age < KEEP_DAILY + KEEP_WEEKS * 7:
            week = day.isocalendar()[:2]
            if week not in newest_in_week or day > newest_in_week[week][1]:
                newest_in_week[week] = (key, day)
    newest_first = sorted(newest_in_week.values(), key=lambda kd: kd[1], reverse=True)
    weekly_keepers = {key for key, _ in newest_first[:KEEP_WEEKS]}
    return [key for key, day in items if (today - day).days >= KEEP_DAILY and key not in weekly_keepers]


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


def prune_local(folder, today):
    items = []
    for path in folder.glob(f"{PREFIX}*.dump"):
        day = date_from_name(path.name) or datetime.fromtimestamp(path.stat().st_mtime).date()
        items.append((path, day))
    gone = to_remove(items, today)
    for path in gone:
        path.unlink()
    return len(gone)


def send_to_drive(path, today):
    """Upload today's file (replacing an earlier one from the same day) and
    bin the copies the keep rule no longer wants. Returns how many were binned."""
    client = drive.DriveClient()
    folder_id = drive.ensure_path(client, DRIVE_FOLDER)
    existing = [f for f in client.list_files(folder_id) if f["name"].startswith(PREFIX)]
    client.upload(folder_id, path.name, path.read_bytes(), "application/octet-stream")
    removed = 0
    older = []
    for f in existing:
        if f["name"] == path.name:
            client.trash(f["id"])
        else:
            day = date_from_name(f["name"]) or drive.parse_time(f.get("createdTime")).astimezone(timezone.get_current_timezone()).date()
            older.append((f["id"], day))
    for key in to_remove(older, today):
        client.trash(key)
        removed += 1
    return removed


def run():
    """Make today's backup. Returns one line describing what happened."""
    folder = local_folder()
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / backup_name()
    tables = dump_database(dest)
    today = timezone.localdate()
    prune_local(folder, today)
    summary = f"{dest.name}: {tables} tables, {dest.stat().st_size / 1024:,.0f} KB"
    if not drive.enabled():
        return summary + ". Saved on this computer only: Google Drive isn't connected."
    try:
        removed = send_to_drive(dest, today)
    except Exception as exc:  # the local copy is still good; say so rather than fail
        raise BackupError(f"{summary}. Saved on this computer, but the copy to Google Drive failed: {exc}")
    return summary + f". Copied to Google Drive ({DRIVE_FOLDER})" + (f", {removed} old copy(ies) removed." if removed else ".")

"""What is quietly going wrong behind the scenes, in plain words, for the one
amber line on Home: Google Drive not connected (files wait on this PC) and
backups that have stopped. Nothing is returned when everything is fine."""

import re
import time
from datetime import date, datetime

from django.conf import settings
from django.utils import timezone

from . import drive

BACKUP_STALE_DAYS = 2  # a backup runs every evening; older than this and something stopped
DRIVE_COPY_STALE_DAYS = 3
_DRIVE_CHECK_EVERY = 600  # seconds: the sign-in is tested at most every 10 minutes
_drive_cache = {"at": 0.0, "reason": None}


def backup_log_path():
    return settings.BASE_DIR / "logs" / "backup.log"


def drive_problem():
    """None when Drive is connected and its sign-in works, else a short reason."""
    if time.monotonic() - _drive_cache["at"] < _DRIVE_CHECK_EVERY and _drive_cache["at"]:
        return _drive_cache["reason"]
    if not drive.enabled():
        reason = "isn't connected"
    else:
        try:
            drive._get_credentials()
            reason = None
        except Exception:
            reason = "sign-in has expired"
    _drive_cache.update(at=time.monotonic(), reason=reason)
    return reason


def waiting_files():
    """Files saved on this PC's disk that haven't reached Google Drive yet."""
    from .models import Attachment, DriverFile, FuelStatementFile, TollStatement

    return (
        Attachment.objects.filter(drive_file_id__isnull=True).exclude(file="").count()
        + DriverFile.objects.filter(drive_file_id__isnull=True).exclude(file="").count()
        + TollStatement.objects.filter(drive_file_id="").exclude(file="").count()
        + FuelStatementFile.objects.filter(drive_file_id="").exclude(file="").count()
    )


def backup_history(path=None):
    """(last good backup day, last day a copy reached Drive, whether the last run failed),
    read from the backup log; None when this PC has never run a backup."""
    path = path or backup_log_path()
    if not path.exists():
        return None
    last_good = last_drive = None
    last_failed = False
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        m = re.match(r"(\d{4})-(\d{2})-(\d{2}) \d{2}:\d{2}:\d{2}\s+(.*)", line)
        if not m:
            continue
        day, message = date(int(m.group(1)), int(m.group(2)), int(m.group(3))), m.group(4)
        last_failed = message.startswith("FAILED")
        if "tables" in message and "FAILED" not in message.split(":")[0]:
            last_good = day
        if "Copied to Google Drive" in message:
            last_drive = day
    return last_good, last_drive, last_failed


def _dmy(d):
    return f"{d:%d-%m-%Y}"


def _ago(today, d):
    n = (today - d).days
    return "today" if n == 0 else "yesterday" if n == 1 else f"{n} days ago"


def problems(today=None, log_path=None):
    """A list of {"kind", "text"} lines, empty when all is well."""
    today = today or timezone.localdate()
    history = backup_history(log_path)
    last_good, last_drive, last_failed = history if history else (None, None, False)
    out = []

    reason = drive_problem()
    if reason:
        waiting = waiting_files()
        text = f"Google Drive {reason}"
        if waiting:
            text += f": {waiting} file{'s are' if waiting != 1 else ' is'} waiting on this PC"
        if last_drive:
            text += f". Last backup copied to Drive: {_dmy(last_drive)}"
        out.append({"kind": "drive", "text": text + "."})

    if history:  # backups are set up on this PC (it has a log), so check they are still running
        if last_good is None or (today - last_good).days > BACKUP_STALE_DAYS or last_failed:
            when = f"Last good backup: {_dmy(last_good)} ({_ago(today, last_good)})" if last_good else "No good backup yet"
            out.append({"kind": "backup", "text": f"Backup problem{' (the last run failed)' if last_failed else ''}. {when}."})
        elif not reason and (last_drive is None or (today - last_drive).days > DRIVE_COPY_STALE_DAYS):
            out.append({"kind": "backup", "text": "Backups are being saved on this PC but not copied to Google Drive" + (f" since {_dmy(last_drive)}." if last_drive else " yet.")})
    return out

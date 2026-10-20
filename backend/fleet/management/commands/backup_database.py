from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from fleet import backup


class Command(BaseCommand):
    help = (
        "Save a copy of the whole database to backend/logs/backups/ and to Google Drive "
        f"(Backups folder), keeping the last {backup.KEEP_DAILY} days and one a week for {backup.KEEP_WEEKS} more weeks. Run every evening by the "
        "scheduled task 'Fleet Maintenance Backup'. Log: backend/logs/backup.log"
    )

    def handle(self, *args, **options):
        try:
            message, failed = backup.run(), False
        except backup.BackupError as exc:
            message, failed = f"FAILED: {exc}", True
        log = settings.BASE_DIR / "logs" / "backup.log"
        log.parent.mkdir(parents=True, exist_ok=True)
        with log.open("a", encoding="utf-8") as fh:
            fh.write(f"{timezone.localtime():%Y-%m-%d %H:%M:%S}  {message}\n")
        if failed:
            raise CommandError(message)
        self.stdout.write(self.style.SUCCESS(message))

from django.core.management.base import BaseCommand

from fleet import drive


class Command(BaseCommand):
    help = (
        "Move photos, documents and toll PDFs that were saved on this server's disk "
        "(while Google Drive wasn't connected) into Google Drive. They also move by "
        "themselves the next time someone opens them, so this is only a shortcut."
    )

    def handle(self, *args, **options):
        if not drive.enabled():
            self.stdout.write(self.style.WARNING("Google Drive isn't connected on this server (no drive-token.json)."))
            return
        total = 0
        while True:
            moved = drive.move_local_files(limit=50, force=True)
            total += moved
            if not moved:
                break
        self.stdout.write(self.style.SUCCESS(f"Moved {total} file(s) to Google Drive."))

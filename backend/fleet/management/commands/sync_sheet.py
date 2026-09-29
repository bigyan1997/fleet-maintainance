from django.core.management.base import BaseCommand, CommandError

from fleet import sheets_sync


class Command(BaseCommand):
    help = "Rewrite every tab of the Google Sheets mirror (FLEET_SHEET_ID) from Postgres."

    def handle(self, *args, **options):
        if not sheets_sync.configured():
            raise CommandError("FLEET_SHEET_ID is not set in .env.")
        sheets_sync.push_all_sync()
        self.stdout.write(self.style.SUCCESS(f"Mirrored {', '.join(sheets_sync.TABS)}."))

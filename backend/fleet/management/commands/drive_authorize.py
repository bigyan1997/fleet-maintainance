from django.core.management.base import BaseCommand, CommandError
from google_auth_oauthlib.flow import InstalledAppFlow

from fleet import drive


class Command(BaseCommand):
    help = (
        "One-time Google sign-in that lets the app keep issue and damage photos "
        "in the shared Google account's Drive. Opens a browser: sign in as the "
        "account that should own the photos, then click Allow."
    )

    def handle(self, *args, **options):
        secrets = drive.client_secrets_path()
        if not secrets.exists():
            raise CommandError(
                f"OAuth client file not found at {secrets}. Download it from Google Cloud Console "
                "(APIs & Services > Credentials > Create OAuth client, type 'Desktop app')."
            )
        flow = InstalledAppFlow.from_client_secrets_file(str(secrets), drive.SCOPES)
        # prompt=consent guarantees a refresh token even if this account authorized before.
        credentials = flow.run_local_server(port=0, access_type="offline", prompt="consent")
        if not credentials.refresh_token:
            raise CommandError("Google didn't return a refresh token. Please run this again.")

        path = drive.token_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(credentials.to_json(), encoding="utf-8")
        drive.reset_credentials()

        root = drive.DriveClient().root_folder_id()
        self.stdout.write(self.style.SUCCESS(f"Done. Photos folder: {drive.folder_url(root)}"))
        self.stdout.write("New photos now go to Google Drive (no restart needed).")

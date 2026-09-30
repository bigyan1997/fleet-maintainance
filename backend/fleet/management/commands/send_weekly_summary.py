from django.core.management.base import BaseCommand, CommandError

from fleet import weekly


class Command(BaseCommand):
    help = "Email the weekly fleet summary (run every Monday morning by Windows Task Scheduler). --preview prints it instead."

    def add_arguments(self, parser):
        parser.add_argument("--preview", action="store_true", help="Print the email instead of sending it.")

    def handle(self, *args, preview=False, **options):
        if preview:
            subject, text, _ = weekly.render(weekly.build_summary())
            self.stdout.write(text.encode("ascii", "replace").decode())
            return
        try:
            sent_to = weekly.send()
        except RuntimeError as exc:
            raise CommandError(str(exc))
        self.stdout.write(f"Sent to {', '.join(sent_to)}")

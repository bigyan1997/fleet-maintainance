from django.apps import AppConfig


class FleetConfig(AppConfig):
    name = 'fleet'

    def ready(self):
        from . import signals  # noqa: F401 — registers the Sheets mirror receivers

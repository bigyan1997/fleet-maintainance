"""Queue a Sheets mirror push after any committed change to fleet data."""

from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from . import sheets_sync
from .models import FuelLog, Incident, IncidentUpdate, ServiceRecord, Vehicle

# Set by bulk jobs (the legacy import) that push once at the end instead of
# once per row.
suspended = False


@receiver([post_save, post_delete], sender=Vehicle)
@receiver([post_save, post_delete], sender=ServiceRecord)
@receiver([post_save, post_delete], sender=Incident)
@receiver([post_save, post_delete], sender=IncidentUpdate)
@receiver([post_save, post_delete], sender=FuelLog)
def mirror_change(sender, **kwargs):
    if suspended:
        return
    name = sender.__name__
    transaction.on_commit(lambda: sheets_sync.push_model(name))

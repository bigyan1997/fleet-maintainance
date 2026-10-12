from django.db import migrations, models


def fill_from_trips(apps, schema_editor):
    """A van whose toll trips show exactly one tag number gets that number."""
    Vehicle = apps.get_model("fleet", "Vehicle")
    TollTrip = apps.get_model("fleet", "TollTrip")
    for v in Vehicle.objects.filter(toll_tag_number=""):
        tags = set(TollTrip.objects.filter(vehicle=v, source="tag").exclude(tag_number="").values_list("tag_number", flat=True))
        if len(tags) == 1:
            Vehicle.objects.filter(pk=v.pk).update(toll_tag_number=tags.pop())


class Migration(migrations.Migration):
    dependencies = [("fleet", "0018_vehicle_off_road")]

    operations = [
        migrations.AddField(
            model_name="vehicle",
            name="toll_tag_number",
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.RunPython(fill_from_trips, migrations.RunPython.noop),
    ]

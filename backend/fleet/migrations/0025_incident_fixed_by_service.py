import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("fleet", "0024_fines")]

    operations = [
        migrations.AddField(
            model_name="incident",
            name="fixed_by_service",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="fixes_incidents", to="fleet.servicerecord"),
        ),
    ]

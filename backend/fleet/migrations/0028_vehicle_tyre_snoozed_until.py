from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('fleet', '0027_vehicle_service_snoozed_until'),
    ]

    operations = [
        migrations.AddField(
            model_name='vehicle',
            name='tyre_snoozed_until',
            field=models.DateField(blank=True, null=True),
        ),
    ]

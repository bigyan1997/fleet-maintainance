from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("fleet", "0017_fuel_statement")]

    operations = [
        migrations.AddField(
            model_name="vehicle",
            name="off_road",
            field=models.BooleanField(default=False),
        ),
    ]

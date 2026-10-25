import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("fleet", "0023_stock")]

    operations = [
        migrations.CreateModel(
            name="Fine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField()),
                ("time", models.TimeField(blank=True, null=True)),
                ("kind", models.CharField(default="Other", max_length=30)),
                ("amount", models.DecimalField(decimal_places=2, default=0, max_digits=9)),
                ("name_driver_by", models.DateField(blank=True, null=True)),
                ("pay_by", models.DateField(blank=True, null=True)),
                ("named_on", models.DateField(blank=True, null=True)),
                ("paid_on", models.DateField(blank=True, null=True)),
                ("reference", models.CharField(blank=True, max_length=60)),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("driver", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="fines", to="fleet.driver")),
                ("vehicle", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="fines", to="fleet.vehicle")),
            ],
            options={"ordering": ["-date", "-id"]},
        ),
        migrations.AddIndex(model_name="fine", index=models.Index(fields=["vehicle", "date"], name="fleet_fine_vehicle_b3dc32_idx")),
        migrations.AddField(
            model_name="attachment",
            name="fine",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="attachments", to="fleet.fine"),
        ),
        migrations.AlterField(
            model_name="attachment",
            name="kind",
            field=models.CharField(
                choices=[("Invoice", "Invoice"), ("Quote", "Quote"), ("Registration", "Registration"), ("Insurance", "Insurance"),
                         ("Photo", "Photo"), ("Issue photo", "Issue photo"), ("Fine notice", "Fine notice"), ("Other", "Other")],
                default="Other", max_length=20,
            ),
        ),
    ]

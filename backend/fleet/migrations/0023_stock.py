import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("fleet", "0022_typed_km_readings")]

    operations = [
        migrations.CreateModel(
            name="StockItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100)),
                ("quantity", models.PositiveIntegerField(default=0)),
                ("order_below", models.PositiveIntegerField(default=2)),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="StockMove",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("change", models.IntegerField()),
                ("quantity_after", models.PositiveIntegerField()),
                ("note", models.CharField(blank=True, max_length=200)),
                ("who_label", models.CharField(blank=True, max_length=150)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="moves", to="fleet.stockitem")),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
    ]

from django.contrib import admin

from .models import FuelLog, Incident, ServiceRecord, Vehicle


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ["__str__", "rego", "vin", "odometer", "rego_expiry"]
    search_fields = ["make", "model", "rego", "vin", "vehicle_number"]


@admin.register(ServiceRecord)
class ServiceRecordAdmin(admin.ModelAdmin):
    list_display = ["vehicle", "service_type", "date", "odometer", "cost"]
    list_filter = ["service_type"]
    search_fields = ["vehicle__make", "vehicle__model", "vehicle__rego", "notes"]


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    list_display = ["vehicle", "incident_type", "date", "severity", "status", "cost"]
    list_filter = ["incident_type", "severity", "status"]
    search_fields = ["vehicle__make", "vehicle__model", "vehicle__rego", "description"]


@admin.register(FuelLog)
class FuelLogAdmin(admin.ModelAdmin):
    list_display = ["vehicle", "date", "litres", "cost", "odometer"]
    search_fields = ["vehicle__make", "vehicle__model", "vehicle__rego", "invoice_number"]

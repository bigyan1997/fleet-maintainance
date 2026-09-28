from rest_framework import serializers

from . import services
from .models import FuelLog, Incident, ServiceRecord, Vehicle


class VehicleSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()
    statusBadge = serializers.SerializerMethodField()
    nextServiceDue = serializers.SerializerMethodField()
    nextTyreDue = serializers.SerializerMethodField()

    class Meta:
        model = Vehicle
        fields = [
            "id", "make", "model", "year", "rego", "vin", "vehicle_number",
            "fuel_card_number", "fuel_type", "odometer", "rego_expiry",
            "insurance_expiry", "service_interval_km", "tyre_interval_km",
            "label", "statusBadge", "nextServiceDue", "nextTyreDue",
        ]

    def get_label(self, obj):
        return str(obj)

    def get_statusBadge(self, obj):
        return services.vehicle_status_badge(obj)

    def get_nextServiceDue(self, obj):
        return services.next_service_due(obj)

    def get_nextTyreDue(self, obj):
        return services.next_tyre_due(obj)


class ServiceRecordSerializer(serializers.ModelSerializer):
    vehicleLabel = serializers.CharField(source="vehicle.__str__", read_only=True)

    class Meta:
        model = ServiceRecord
        fields = [
            "id", "vehicle", "vehicleLabel", "service_type", "date",
            "odometer", "cost", "next_due", "notes",
        ]


class IncidentSerializer(serializers.ModelSerializer):
    vehicleLabel = serializers.CharField(source="vehicle.__str__", read_only=True)

    class Meta:
        model = Incident
        fields = [
            "id", "vehicle", "vehicleLabel", "incident_type", "date",
            "severity", "location", "description", "cost", "status", "notes",
        ]


class FuelLogSerializer(serializers.ModelSerializer):
    vehicleLabel = serializers.CharField(source="vehicle.__str__", read_only=True)
    pricePerLitre = serializers.SerializerMethodField()

    class Meta:
        model = FuelLog
        fields = [
            "id", "vehicle", "vehicleLabel", "date", "litres", "cost",
            "pricePerLitre", "odometer", "invoice_number", "notes",
        ]

    def get_pricePerLitre(self, obj):
        return obj.price_per_litre

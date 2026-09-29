from django.utils import timezone
from rest_framework import serializers

from . import services
from .models import FuelLog, Incident, IncidentUpdate, ServiceRecord, Vehicle


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
            "odometer", "cost", "next_due", "notes", "status",
        ]


class IncidentUpdateSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()

    class Meta:
        model = IncidentUpdate
        fields = ["id", "text", "author", "created_at"]

    def get_author(self, obj):
        return obj.author.get_username() if obj.author else ""


class IncidentSerializer(serializers.ModelSerializer):
    vehicleLabel = serializers.CharField(source="vehicle.__str__", read_only=True)
    updates = IncidentUpdateSerializer(many=True, read_only=True)
    # The whole log as one block of text, for Export / CSV.
    notes = serializers.SerializerMethodField()
    # Optional: appended to the log as a new dated entry on save.
    new_update = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Incident
        fields = [
            "id", "vehicle", "vehicleLabel", "incident_type", "date",
            "severity", "location", "description", "cost", "status", "notes",
            "updates", "new_update", "resolution", "resolved_date",
        ]

    def get_notes(self, obj):
        return "\n".join(str(u) for u in obj.updates.all())

    def _add_update(self, incident, text):
        if text.strip():
            request = self.context.get("request")
            user = request.user if request and request.user.is_authenticated else None
            IncidentUpdate.objects.create(incident=incident, text=text.strip(), author=user)

    def create(self, validated_data):
        text = validated_data.pop("new_update", "")
        incident = super().create(validated_data)
        self._add_update(incident, text)
        return incident

    def update(self, instance, validated_data):
        text = validated_data.pop("new_update", "")
        incident = super().update(instance, validated_data)
        self._add_update(incident, text)
        return incident

    def validate(self, attrs):
        if attrs.get("status") == "Resolved":
            if not (attrs.get("resolution") or "").strip():
                raise serializers.ValidationError({"resolution": "Say what was done before marking this resolved."})
            attrs.setdefault("resolved_date", None)
            attrs["resolved_date"] = attrs["resolved_date"] or timezone.localdate()
        elif "status" in attrs:
            attrs["resolved_date"] = None  # reopened: no longer resolved
        return attrs


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

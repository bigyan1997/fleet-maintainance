from django.utils import timezone
from rest_framework import serializers

from . import services
from .models import ActivityLog, Attachment, Driver, FuelLog, Incident, IncidentUpdate, Mechanic, ServiceRecord, Vehicle


class VehicleSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()
    statusBadge = serializers.SerializerMethodField()
    nextServiceDue = serializers.SerializerMethodField()
    nextTyreDue = serializers.SerializerMethodField()
    lastWashed = serializers.SerializerMethodField()
    openJob = serializers.SerializerMethodField()
    driverName = serializers.CharField(source="driver.name", read_only=True, default="")

    class Meta:
        model = Vehicle
        fields = [
            "id", "make", "model", "year", "rego", "vin", "vehicle_number",
            "fuel_card_number", "fuel_type", "odometer", "rego_expiry",
            "insurance_expiry", "service_interval_km", "tyre_interval_km",
            "wash_needed", "driver", "driverName", "report_token", "label", "statusBadge", "nextServiceDue", "nextTyreDue", "lastWashed", "openJob",
        ]

        read_only_fields = ["report_token"]

    def get_label(self, obj):
        return str(obj)

    def get_statusBadge(self, obj):
        return services.vehicle_status_badge(obj)

    def get_nextServiceDue(self, obj):
        return services.next_service_due(obj)

    def get_nextTyreDue(self, obj):
        return services.next_tyre_due(obj)

    def get_openJob(self, obj):
        return services.open_job(obj)

    def get_lastWashed(self, obj):
        # The list view passes one precomputed map in context rather than a
        # query per vehicle; single-vehicle views fall back to computing it.
        washes = self.context.get("last_washed")
        if washes is None:
            washes = services.last_washed_by_vehicle()
        return washes.get(obj.pk)


class ServiceRecordSerializer(serializers.ModelSerializer):
    vehicleLabel = serializers.CharField(source="vehicle.__str__", read_only=True)
    mechanicName = serializers.CharField(source="mechanic.name", read_only=True, default="")

    class Meta:
        model = ServiceRecord
        fields = [
            "id", "vehicle", "vehicleLabel", "service_type", "date",
            "odometer", "cost", "next_due", "issues", "notes", "status", "mechanic", "mechanicName",
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
    isFuel = serializers.BooleanField(source="is_fuel", read_only=True)

    class Meta:
        model = FuelLog
        fields = [
            "id", "vehicle", "vehicleLabel", "date", "product", "isFuel", "litres", "cost",
            "pricePerLitre", "odometer", "invoice_number", "notes",
        ]

    def get_pricePerLitre(self, obj):
        return obj.price_per_litre


class DriverSerializer(serializers.ModelSerializer):
    vans = serializers.SerializerMethodField()

    class Meta:
        model = Driver
        fields = ["id", "name", "phone", "notes", "active", "vans"]

    def get_vans(self, obj):
        return [{"id": v.pk, "label": str(v)} for v in obj.vehicles.all()]


class AttachmentSerializer(serializers.ModelSerializer):
    vehicleLabel = serializers.CharField(source="vehicle.__str__", read_only=True)
    uploadedBy = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()
    linkedTo = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = [
            "id", "original_name", "content_type", "size", "kind", "vehicle", "vehicleLabel",
            "service", "incident", "uploadedBy", "created_at", "url", "linkedTo",
        ]

    def get_uploadedBy(self, obj):
        return obj.uploaded_by.get_username() if obj.uploaded_by else ""

    def get_url(self, obj):
        return f"/api/attachments/{obj.pk}/file/"

    def get_linkedTo(self, obj):
        if obj.service_id:
            return f"{obj.service.service_type} {obj.service.date:%d-%m-%Y}"
        if obj.incident_id:
            return f"{obj.incident.incident_type} {obj.incident.date:%d-%m-%Y}"
        return ""


class ActivityLogSerializer(serializers.ModelSerializer):
    vehicleLabel = serializers.SerializerMethodField()

    class Meta:
        model = ActivityLog
        fields = ["id", "who_label", "action", "kind", "summary", "vehicle", "vehicleLabel", "created_at"]

    def get_vehicleLabel(self, obj):
        return str(obj.vehicle) if obj.vehicle_id else ""


class MechanicSerializer(serializers.ModelSerializer):
    jobs = serializers.IntegerField(read_only=True, default=0)
    spend = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, default=0)
    lastJob = serializers.DateField(read_only=True, default=None)

    class Meta:
        model = Mechanic
        fields = ["id", "name", "phone", "address", "notes", "active", "jobs", "spend", "lastJob"]

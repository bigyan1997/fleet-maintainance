from django.utils import timezone
from rest_framework import serializers

from . import services
from . import drive
from .models import Fine, StockItem, StockMove, ActivityLog, Attachment, Driver, DriverFile, FuelLog, Incident, IncidentUpdate, Mechanic, ServiceRecord, Vehicle


class VehicleSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()
    statusBadge = serializers.SerializerMethodField()
    nextServiceDue = serializers.SerializerMethodField()
    nextTyreDue = serializers.SerializerMethodField()
    odometerAsOf = serializers.SerializerMethodField()
    lastFillUp = serializers.SerializerMethodField()
    lastWashed = serializers.SerializerMethodField()
    openJob = serializers.SerializerMethodField()
    driverName = serializers.CharField(source="driver.name", read_only=True, default="")
    subtitle = serializers.CharField(read_only=True)

    class Meta:
        model = Vehicle
        fields = [
            "id", "make", "model", "year", "rego", "vin", "vehicle_number",
            "fuel_card_number", "toll_tag_number", "fuel_type", "odometer", "rego_expiry",
            "insurance_expiry", "service_interval_km", "tyre_interval_km",
            "wash_needed", "off_road", "driver", "driverName", "report_token", "label", "subtitle", "statusBadge", "nextServiceDue", "nextTyreDue", "odometerAsOf", "lastFillUp", "lastWashed", "openJob",
        ]

        read_only_fields = ["report_token"]

    def _real_date(self, value, what):
        # A half-typed year (the browser reads "2" as 0002) must never be saved.
        if value and not 2000 <= value.year <= 2099:
            raise serializers.ValidationError(f"That {what} has the year {value.year}. Check the date.")
        return value

    def validate_rego_expiry(self, value):
        return self._real_date(value, "rego expiry")

    def validate_insurance_expiry(self, value):
        return self._real_date(value, "insurance expiry")

    def get_label(self, obj):
        return str(obj)

    def get_statusBadge(self, obj):
        return services.vehicle_status_badge(obj)

    def get_nextServiceDue(self, obj):
        return services.next_service_due(obj)

    def get_nextTyreDue(self, obj):
        return services.next_tyre_due(obj)

    def get_lastFillUp(self, obj):
        # The km typed at the pump on the newest fill-up that has one.
        row = obj.fuel_logs.filter(odometer__isnull=False).order_by("-date", "-id").values("date", "odometer").first()
        return {"date": row["date"].isoformat(), "km": row["odometer"]} if row else None

    def get_odometerAsOf(self, obj):
        # The date of the newest believable km reading (fill-up or finished
        # service), so a km that is out of date can be flagged.
        reading = services.latest_reading(obj)
        return reading[0].isoformat() if reading else None

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
    vehicleSub = serializers.CharField(source="vehicle.subtitle", read_only=True)
    mechanicName = serializers.CharField(source="mechanic.name", read_only=True, default="")

    class Meta:
        model = ServiceRecord
        fields = [
            "id", "vehicle", "vehicleLabel", "vehicleSub", "service_type", "date",
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
    vehicleSub = serializers.CharField(source="vehicle.subtitle", read_only=True)
    updates = IncidentUpdateSerializer(many=True, read_only=True)
    # The whole log as one block of text, for Export / CSV.
    notes = serializers.SerializerMethodField()
    # Optional: appended to the log as a new dated entry on save.
    new_update = serializers.CharField(write_only=True, required=False, allow_blank=True)
    fixedByLabel = serializers.SerializerMethodField()

    class Meta:
        model = Incident
        fields = [
            "id", "vehicle", "vehicleLabel", "vehicleSub", "incident_type", "date",
            "severity", "location", "description", "cost", "status", "notes",
            "updates", "new_update", "resolution", "resolved_date", "fixed_by_service", "fixedByLabel",
        ]

    def get_fixedByLabel(self, obj):
        s = obj.fixed_by_service
        return f"{s.service_type} {s.date:%d-%m-%Y}" if s else ""

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
        service = attrs.get("fixed_by_service")
        if service:
            vehicle = attrs.get("vehicle") or (self.instance.vehicle if self.instance else None)
            if vehicle and service.vehicle_id != vehicle.pk:
                raise serializers.ValidationError({"fixed_by_service": "Pick a service job for the same van as the incident."})
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
    vehicleSub = serializers.CharField(source="vehicle.subtitle", read_only=True)
    pricePerLitre = serializers.SerializerMethodField()
    isFuel = serializers.BooleanField(source="is_fuel", read_only=True)

    class Meta:
        model = FuelLog
        fields = [
            "id", "vehicle", "vehicleLabel", "vehicleSub", "date", "product", "isFuel", "litres", "cost",
            "pricePerLitre", "odometer", "invoice_number", "notes", "statement",
        ]
        read_only_fields = ["statement"]

    def get_pricePerLitre(self, obj):
        return obj.price_per_litre


class DriverSerializer(serializers.ModelSerializer):
    vans = serializers.SerializerMethodField()
    licenceStatus = serializers.CharField(source="licence_status", read_only=True)
    licenceDaysLeft = serializers.IntegerField(source="licence_days_left", read_only=True)
    licenceFileCount = serializers.SerializerMethodField()
    licenceDownload = serializers.SerializerMethodField()

    class Meta:
        model = Driver
        fields = [
            "id", "name", "phone", "notes", "active", "vans",
            "date_of_birth", "date_joined", "licence_number", "licence_class", "licence_state", "licence_expiry",
            "demerit_points", "points_checked", "licenceStatus", "licenceDaysLeft", "updated_at",
            "licenceFileCount", "licenceDownload",
        ]
        read_only_fields = ["updated_at"]

    def get_vans(self, obj):
        return [{"id": v.pk, "label": str(v)} for v in obj.vehicles.all()]

    def get_licenceFileCount(self, obj):
        return len(obj.files.all())

    def get_licenceDownload(self, obj):
        from .licence_pdf import download_mode

        return download_mode(obj.files.all())

    def _real_date(self, value, what, earliest=1930):
        # A half-typed year (the browser reads "2" as 0002) must never be saved.
        if value and not earliest <= value.year <= 2099:
            raise serializers.ValidationError(f"That {what} has the year {value.year}. Check the date.")
        return value

    def validate_date_of_birth(self, value):
        value = self._real_date(value, "date of birth")
        if value and value > timezone.localdate():
            raise serializers.ValidationError("That date of birth is in the future. Check the date.")
        return value

    def validate_date_joined(self, value):
        return self._real_date(value, "date joined", 1980)

    def validate_licence_expiry(self, value):
        return self._real_date(value, "licence expiry", 2000)

    def validate_points_checked(self, value):
        return self._real_date(value, "points checked date", 2000)

    def validate_demerit_points(self, value):
        if value is not None and value > 30:
            raise serializers.ValidationError("That's more demerit points than a licence can hold. Check the number.")
        return value


class DriverFileSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    thumb = serializers.SerializerMethodField()

    class Meta:
        model = DriverFile
        fields = ["id", "driver", "original_name", "content_type", "size", "created_at", "url", "thumb"]

    def get_url(self, obj):
        return f"/api/driver-files/{obj.pk}/file/"

    def get_thumb(self, obj):
        return f"{self.get_url(obj)}?thumb=1" if obj.drive_file_id else self.get_url(obj)


class AttachmentSerializer(serializers.ModelSerializer):
    vehicleLabel = serializers.CharField(source="vehicle.__str__", read_only=True)
    uploadedBy = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()
    linkedTo = serializers.SerializerMethodField()
    thumb = serializers.SerializerMethodField()
    driveFolderUrl = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = [
            "id", "original_name", "content_type", "size", "kind", "vehicle", "vehicleLabel",
            "service", "incident", "fine", "uploadedBy", "created_at", "url", "linkedTo", "thumb", "driveFolderUrl",
        ]

    def get_uploadedBy(self, obj):
        return obj.uploaded_by.get_username() if obj.uploaded_by else ""

    def get_url(self, obj):
        return f"/api/attachments/{obj.pk}/file/"

    def get_thumb(self, obj):
        # Drive photos have a small cached preview; local files are shown as they are.
        return f"/api/attachments/{obj.pk}/file/?thumb=1" if obj.drive_file_id else self.get_url(obj)

    def get_driveFolderUrl(self, obj):
        job = obj.service or obj.incident
        return drive.folder_url(job.drive_folder_id) if job and obj.drive_file_id else ""

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


class StockItemSerializer(serializers.ModelSerializer):
    status = serializers.CharField(read_only=True)

    class Meta:
        model = StockItem
        fields = ["id", "name", "quantity", "order_below", "notes", "status", "updated_at"]
        read_only_fields = ["updated_at"]


class StockMoveSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockMove
        fields = ["id", "change", "quantity_after", "note", "who_label", "created_at"]


class FineSerializer(serializers.ModelSerializer):
    vehicleLabel = serializers.CharField(source="vehicle.__str__", read_only=True)
    driverName = serializers.CharField(source="driver.name", read_only=True, default="")
    status = serializers.CharField(read_only=True)
    deadline = serializers.DateField(read_only=True)
    daysLeft = serializers.SerializerMethodField()
    noticeCount = serializers.SerializerMethodField()

    class Meta:
        model = Fine
        fields = [
            "id", "vehicle", "vehicleLabel", "date", "time", "kind", "amount", "name_driver_by", "pay_by",
            "driver", "driverName", "named_on", "paid_on", "reference", "notes",
            "status", "deadline", "daysLeft", "noticeCount",
        ]

    def get_daysLeft(self, obj):
        return (obj.deadline - timezone.localdate()).days if obj.deadline else None

    def get_noticeCount(self, obj):
        return len(obj.attachments.all())

    def validate_amount(self, value):
        if value < 0:
            raise serializers.ValidationError("The amount can't be negative.")
        return value

    def validate(self, attrs):
        for field in ("date", "name_driver_by", "pay_by", "named_on", "paid_on"):
            value = attrs.get(field)
            if value and not 2000 <= value.year <= 2099:
                raise serializers.ValidationError({field: f"That date has the year {value.year}. Check the date."})
        return attrs

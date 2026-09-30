from django.conf import settings
from django.db import models
from django.utils import timezone


FUEL_TYPE_CHOICES = [
    ("Unleaded 91", "Unleaded 91"),
    ("Unleaded 95", "Unleaded 95"),
    ("Unleaded 98", "Unleaded 98"),
    ("Diesel", "Diesel"),
    ("Premium diesel", "Premium diesel"),
    ("LPG", "LPG"),
    ("Electric", "Electric"),
    ("Hybrid", "Hybrid"),
]

SERVICE_TYPE_CHOICES = [
    ("Refrigeration unit", "Refrigeration unit"),
    ("Scheduled service", "Scheduled service"),
    ("Tyre rotation", "Tyre rotation"),
    ("Tyre replacement", "Tyre replacement"),
    ("Brake service", "Brake service"),
    ("Repair / parts", "Repair / parts"),
    ("Registration", "Registration"),
    ("Insurance", "Insurance"),
    ("Fuel log", "Fuel log"),
    ("Van wash", "Van wash"),
]

# A service job's progress, booking through to paid-up. Everything but
# "Invoiced" counts as in progress on the dashboard.
SERVICE_STATUS_CHOICES = [
    ("Booked", "Booked"),
    ("In service", "In service"),
    ("Completed, awaiting invoice", "Completed, awaiting invoice"),
    ("Invoiced", "Invoiced"),
]
SERVICE_STATUS_DONE = "Invoiced"

INCIDENT_TYPE_CHOICES = [
    ("Accident", "Accident"),
    ("Breakdown", "Breakdown"),
    ("Damage", "Damage"),
    ("Other", "Other"),
]

SEVERITY_CHOICES = [
    ("Minor", "Minor"),
    ("Moderate", "Moderate"),
    ("Major", "Major"),
]

INCIDENT_STATUS_CHOICES = [
    ("Open", "Open"),
    ("In progress", "In progress"),
    ("Resolved", "Resolved"),
]

DEFAULT_SERVICE_INTERVAL_KM = 10000


class Vehicle(models.Model):
    make = models.CharField(max_length=100)
    model = models.CharField(max_length=100)
    year = models.PositiveIntegerField(null=True, blank=True)
    rego = models.CharField("Rego / plate", max_length=20, blank=True, db_index=True)
    vin = models.CharField("VIN", max_length=17, blank=True, db_index=True)
    vehicle_number = models.CharField(max_length=50, blank=True)
    fuel_card_number = models.CharField(max_length=50, blank=True)
    fuel_type = models.CharField(max_length=20, choices=FUEL_TYPE_CHOICES, blank=True)
    odometer = models.PositiveIntegerField(default=0)
    rego_expiry = models.DateField(null=True, blank=True)
    insurance_expiry = models.DateField(null=True, blank=True)
    service_interval_km = models.PositiveIntegerField(default=DEFAULT_SERVICE_INTERVAL_KM)
    tyre_interval_km = models.PositiveIntegerField(null=True, blank=True)
    # False for vans a driver takes home after each run — they're not washed
    # by us, so the dashboard doesn't nag about them.
    wash_needed = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Mirror bookkeeping — set once this vehicle has been pushed to the
    # Sheets mirror, same pattern as NPD's Product.sheet_row_synced_at.
    sheet_row_synced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["make", "model"]

    def __str__(self):
        label = f"{self.year or ''} {self.make} {self.model}".strip()
        return label or f"Vehicle #{self.pk}"


class ServiceRecord(models.Model):
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="services")
    service_type = models.CharField(max_length=32, choices=SERVICE_TYPE_CHOICES)
    date = models.DateField()
    odometer = models.PositiveIntegerField(null=True, blank=True)
    cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    next_due = models.CharField(max_length=100, blank=True)  # free text — a km figure or a date
    # What's wrong / needs checking, written when booking so it can be passed
    # on to the mechanic. `notes` is what was actually done.
    issues = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=32, choices=SERVICE_STATUS_CHOICES, default="Booked", db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-id"]
        indexes = [models.Index(fields=["vehicle", "date"])]


class Incident(models.Model):
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="incidents")
    incident_type = models.CharField(max_length=16, choices=INCIDENT_TYPE_CHOICES)
    date = models.DateField()
    severity = models.CharField(max_length=16, choices=SEVERITY_CHOICES)
    location = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=16, choices=INCIDENT_STATUS_CHOICES, default="Open")
    # Running notes while Open / In progress live in IncidentUpdate (a dated log).
    resolution = models.TextField(blank=True)  # what was done — required once Resolved
    resolved_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-id"]
        indexes = [models.Index(fields=["vehicle", "date"])]


class IncidentUpdate(models.Model):
    """One dated entry in an incident's follow-up log."""

    incident = models.ForeignKey(Incident, on_delete=models.CASCADE, related_name="updates")
    text = models.TextField()
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)  # not auto_now_add, so migrated notes keep their date

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        stamp = timezone.localtime(self.created_at).strftime("%d-%m-%Y %H:%M")
        who = self.author.get_username() if self.author else ""
        return f"{stamp} {who}: {self.text}" if who else f"{stamp}: {self.text}"


class FuelLog(models.Model):
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="fuel_logs")
    date = models.DateField()
    litres = models.DecimalField(max_digits=8, decimal_places=2)
    cost = models.DecimalField(max_digits=10, decimal_places=2)
    odometer = models.PositiveIntegerField(null=True, blank=True)
    invoice_number = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-id"]
        indexes = [models.Index(fields=["vehicle", "date"])]

    @property
    def price_per_litre(self):
        if self.litres:
            return round(self.cost / self.litres, 3)
        return None

import re
import secrets

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


def new_report_token():
    return secrets.token_urlsafe(16)


class Driver(models.Model):
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=30, blank=True)
    notes = models.TextField(blank=True)
    active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


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
    driver = models.ForeignKey(Driver, on_delete=models.SET_NULL, null=True, blank=True, related_name="vehicles")
    # Secret part of the van's QR-sticker link, so drivers can report a
    # problem or a wash without logging in (and without seeing anything else).
    report_token = models.CharField(max_length=32, unique=True, default=new_report_token)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Mirror bookkeeping — set once this vehicle has been pushed to the
    # Sheets mirror, same pattern as NPD's Product.sheet_row_synced_at.
    sheet_row_synced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["make", "model"]

    # Display only: the stored make/model keep their legacy spelling.
    MODEL_SPELLING = [
        (re.compile(r"hi-?ace", re.I), "HiAce"),
        (re.compile(r"\bswlb\b", re.I), "SLWB"),
        (re.compile(r"i-?load", re.I), "iLoad"),
    ]

    @property
    def short_name(self):
        """ "Van 4" from a make like "Van 4- Toyota"; vans without a number
        keep their full make + model."""
        m = re.match(r"\s*(van\s*\d+)", self.make, re.I)
        if m:
            return re.sub(r"\s+", " ", m.group(1)).title()
        return f"{self.make} {self.model}".strip() or f"Vehicle #{self.pk}"

    @property
    def subtitle(self):
        """ "Toyota HiAce SLWB · YKG89N": brand, model and plate."""
        brand = re.sub(r"^\s*van\s*\d+\s*[-:]?\s*", "", self.make, flags=re.I)
        brand = re.sub(r"\s*\b(19|20)\d\d\b", "", brand).strip()
        brand = {"Mercedez": "Mercedes-Benz"}.get(brand, brand)
        model = self.model
        for pattern, fixed in self.MODEL_SPELLING:
            model = pattern.sub(fixed, model)
        plate = re.sub(r"\s*\(.*\)", "", self.rego or "").strip()
        return " · ".join(p for p in [f"{brand} {model}".strip(), plate] if p)

    def __str__(self):
        return self.short_name


class Mechanic(models.Model):
    """A mechanic or workshop that services the vans."""

    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=30, blank=True)
    address = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


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
    mechanic = models.ForeignKey(Mechanic, on_delete=models.SET_NULL, null=True, blank=True, related_name="services")
    # Google Drive folder holding photos of the issues (see drive.py).
    drive_folder_id = models.CharField(max_length=128, blank=True, default="")

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
    # Google Drive folder holding photos of the damage (see drive.py).
    drive_folder_id = models.CharField(max_length=128, blank=True, default="")

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


# Words that make a fuel-card line fuel for the tank. Anything else on the
# statement (AdBlue, roadside assist, card/management fees) is a charge: it
# counts towards cost, but not litres, fill-ups or L/100km.
FUEL_PRODUCT_WORDS = ("diesel", "unleaded", "petrol", "lpg", "ulp", "e10")


def fuel_only_q(prefix=""):
    """Fuel-log rows that are actual fuel. Hand-logged rows have no product
    and are always fuel."""
    q = models.Q(**{f"{prefix}product": ""})
    for word in FUEL_PRODUCT_WORDS:
        q |= models.Q(**{f"{prefix}product__icontains": word})
    return q


class FuelLog(models.Model):
    vehicle = models.ForeignKey(Vehicle, on_delete=models.PROTECT, related_name="fuel_logs")
    date = models.DateField()
    litres = models.DecimalField(max_digits=8, decimal_places=2)
    cost = models.DecimalField(max_digits=10, decimal_places=2)
    # What the fuel card statement calls the line ("Diesel", "Premium diesel",
    # "AdBlue", "Card fee"...). Blank for fuel logged by hand.
    product = models.CharField(max_length=40, blank=True)
    odometer = models.PositiveIntegerField(null=True, blank=True)
    invoice_number = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-id"]
        indexes = [models.Index(fields=["vehicle", "date"])]

    @property
    def is_fuel(self):
        product = self.product.lower()
        return not product or any(word in product for word in FUEL_PRODUCT_WORDS)

    @property
    def price_per_litre(self):
        if self.litres and self.is_fuel:
            return round(self.cost / self.litres, 3)
        return None


# Photos of what's wrong with a van (a service's issues, an incident's
# damage). Kept in Google Drive when it's set up; see drive.py.
ISSUE_PHOTO = "Issue photo"

ATTACHMENT_KIND_CHOICES = [
    ("Invoice", "Invoice"),
    ("Quote", "Quote"),
    ("Registration", "Registration"),
    ("Insurance", "Insurance"),
    ("Photo", "Photo"),
    ("Issue photo", "Issue photo"),
    ("Other", "Other"),
]


def attachment_path(instance, filename):
    return f"attachments/{timezone.now():%Y/%m}/{secrets.token_hex(6)}-{filename}"


class Attachment(models.Model):
    """A file kept with a van, a service or an incident: the mechanic's
    invoice, rego papers, a photo of the damage."""

    file = models.FileField(upload_to=attachment_path, blank=True)  # empty when kept in Google Drive
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100, blank=True)
    size = models.PositiveIntegerField(default=0)
    kind = models.CharField(max_length=20, choices=ATTACHMENT_KIND_CHOICES, default="Other")
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name="attachments")
    service = models.ForeignKey(ServiceRecord, on_delete=models.CASCADE, null=True, blank=True, related_name="attachments")
    incident = models.ForeignKey(Incident, on_delete=models.CASCADE, null=True, blank=True, related_name="attachments")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    drive_file_id = models.CharField(max_length=128, null=True, blank=True, unique=True)
    drive_modified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]


def toll_statement_path(instance, filename):
    return f"toll_statements/{secrets.token_hex(6)}-{filename}"


class TollStatement(models.Model):
    """One monthly E-Toll statement (see toll_import.py)."""

    invoice_number = models.CharField(max_length=40, unique=True)
    account_number = models.CharField(max_length=40, blank=True)
    period_start = models.DateField()
    period_end = models.DateField()
    issue_date = models.DateField(null=True, blank=True)
    total = models.DecimalField(max_digits=10, decimal_places=2)  # "Total toll charges" on the statement
    # Part of `total` that belongs to vehicles that aren't fleet vans (left out).
    other_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    file = models.FileField(upload_to=toll_statement_path, blank=True)
    imported_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    imported_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period_end"]


class TollTrip(models.Model):
    """A line of a toll statement: a trip, or a fee charged with one."""

    statement = models.ForeignKey(TollStatement, on_delete=models.CASCADE, related_name="trips")
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name="toll_trips")
    source = models.CharField(max_length=5)  # "tag", or "plate" when the tag wasn't read
    tag_number = models.CharField(max_length=20, blank=True)
    plate = models.CharField(max_length=12, blank=True)
    label = models.CharField(max_length=80, blank=True)  # the tag's name on the account, or the plate
    date = models.DateField()
    time = models.TimeField()
    road = models.CharField(max_length=80)
    detail = models.CharField(max_length=120)
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    is_fee = models.BooleanField(default=False)

    class Meta:
        ordering = ["-date", "-time"]
        indexes = [models.Index(fields=["vehicle", "date"])]


class ActivityLog(models.Model):
    """Who added, changed or deleted what — one line per change."""

    who = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    who_label = models.CharField(max_length=150, blank=True)  # kept if the user is deleted; "Driver (QR)" for sticker reports
    action = models.CharField(max_length=20)  # Added / Changed / Deleted / Imported
    kind = models.CharField(max_length=30)  # Service, Fuel, Wash, Incident, Van, Driver, Document, Budget, User
    summary = models.CharField(max_length=300)
    vehicle = models.ForeignKey(Vehicle, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]


BUDGET_CATEGORY_CHOICES = [("fuel", "Fuel card"), ("maintenance", "Maintenance")]


class Budget(models.Model):
    category = models.CharField(max_length=20, choices=BUDGET_CATEGORY_CHOICES, unique=True)
    monthly_amount = models.DecimalField(max_digits=10, decimal_places=2)
    updated_at = models.DateTimeField(auto_now=True)

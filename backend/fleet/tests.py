import json
import tempfile
from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from . import drive
from .models import ISSUE_PHOTO, Attachment, Incident, ServiceRecord, Vehicle

JPEG = b"\xff\xd8\xff\xe0fake-jpeg"


class FakeDrive:
    """Stands in for DriveClient: one folder per create_folder, files kept in memory."""

    def __init__(self):
        self.folders, self.files, self.trashed, self.uploads = {}, {}, [], 0

    def root_folder_id(self):
        return "root-folder"

    def get_or_create_folder(self, name, parent_id):
        found = [k for k, v in self.folders.items() if v == (name, parent_id)]
        return found[0] if found else self.create_folder(name, parent_id)

    def create_folder(self, name, parent_id):
        folder_id = f"folder{len(self.folders) + 1}"
        self.folders[folder_id] = (name, parent_id)
        return folder_id

    def path(self, folder_id):
        name, parent = self.folders[folder_id]
        return f"{self.path(parent)}/{name}" if parent in self.folders else name

    def folder_is_live(self, folder_id):
        return folder_id in self.folders

    def upload(self, folder_id, name, content, mime_type):
        self.uploads += 1
        meta = {"id": f"file{self.uploads}", "name": name, "mimeType": mime_type, "parents": [folder_id],
                "size": str(len(content)), "modifiedTime": "2026-10-06T01:00:00Z"}
        self.files[meta["id"]] = (meta, content)
        return meta

    def list_images(self, folder_id):
        return [m for m, _ in self.files.values() if folder_id in m["parents"]]

    def download(self, file_id):
        return self.files[file_id][1]

    def thumbnail(self, file_id, size):
        return b"thumb"

    def trash(self, file_id):
        self.trashed.append(file_id)
        self.files.pop(file_id, None)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class IssuePhotoTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(get_user_model().objects.create_user("office"))
        self.van = Vehicle.objects.create(make="Toyota", model="HiAce", rego="ABC123")
        self.service = ServiceRecord.objects.create(vehicle=self.van, service_type="Brake service", date=date(2026, 10, 7))
        self.incident = Incident.objects.create(vehicle=self.van, incident_type="Damage", date=date(2026, 10, 5), severity="Minor")

    def upload(self, **job):
        photo = SimpleUploadedFile("brakes.jpg", JPEG, content_type="image/jpeg")
        return self.api.post("/api/attachments/", {"file": photo, "kind": ISSUE_PHOTO, **job}, format="multipart")

    def test_without_drive_photo_is_kept_on_disk(self):
        with mock.patch.object(drive, "enabled", return_value=False):
            res = self.upload(service=self.service.pk)
        self.assertEqual(res.status_code, 201)
        att = Attachment.objects.get()
        self.assertTrue(att.file)
        self.assertIsNone(att.drive_file_id)
        self.assertEqual(self.api.get(res.data["url"]).status_code, 200)

    def test_service_photo_goes_to_its_drive_folder(self):
        fake = FakeDrive()
        with mock.patch.object(drive, "enabled", return_value=True), mock.patch.object(drive, "DriveClient", return_value=fake):
            res = self.upload(service=self.service.pk)
            self.assertEqual(res.status_code, 201)
            att = Attachment.objects.get()
            self.assertFalse(att.file)
            self.assertEqual(att.drive_file_id, "file1")
            self.service.refresh_from_db()
            self.assertEqual(fake.path(self.service.drive_folder_id), f"Services/{self.van}")
            self.assertEqual(att.original_name, "07-10-2026.jpg")
            # A second photo the same day gets its own name.
            self.assertEqual(self.upload(service=self.service.pk).data["original_name"], "07-10-2026 (2).jpg")
            self.assertTrue(res.data["driveFolderUrl"].endswith(self.service.drive_folder_id))

            # Full size comes from Drive, the tile from Drive's preview.
            self.assertEqual(self.api.get(res.data["url"]).content, JPEG)
            self.assertEqual(self.api.get(res.data["thumb"]).content, b"thumb")

            # Removing it sends it to Drive's Bin.
            self.assertEqual(self.api.delete(f"/api/attachments/{att.pk}/").status_code, 204)
            self.assertEqual(fake.trashed, ["file1"])
            self.assertEqual(Attachment.objects.count(), 1)

    def test_incident_photo_and_drive_sync(self):
        fake = FakeDrive()
        with mock.patch.object(drive, "enabled", return_value=True), mock.patch.object(drive, "DriveClient", return_value=fake):
            self.assertEqual(self.upload(incident=self.incident.pk).status_code, 201)
            self.incident.refresh_from_db()
            folder = self.incident.drive_folder_id
            self.assertEqual(fake.path(folder), f"Incidents/{self.van}")

            # Photos dropped into the van folder in Drive join the incident
            # with that date; other dates stay out; one deleted in Drive goes.
            fake.upload(folder, "05-10-2026 (2).jpg", JPEG, "image/jpeg")
            fake.upload(folder, "01-09-2026.jpg", JPEG, "image/jpeg")
            fake.files.pop("file1")
            names = [d["original_name"] for d in self.api.get("/api/attachments/", {"incident": self.incident.pk}).data]
            self.assertEqual(names, ["05-10-2026 (2).jpg"])

    def test_drive_failure_keeps_photo_on_disk(self):
        broken = mock.Mock(side_effect=RuntimeError("Drive down"))
        with mock.patch.object(drive, "enabled", return_value=True), mock.patch.object(drive, "DriveClient", broken):
            self.assertEqual(self.upload(service=self.service.pk).status_code, 201)
        att = Attachment.objects.get()
        self.assertTrue(att.file)
        self.assertIsNone(att.drive_file_id)


TOLL_TEXT = """
Statement/Tax Invoice
28/09/2026 Total toll charges -$31.94
Account No
2457457
Issue Date
01 Oct 2026
Statement Period
29 Aug 2026 - 28 Sep 2026
Invoice No
100077951923
Summary use of toll charges for this period
Tag Reference LPN State Total Trips Total Tolls $ Total Fees $ ___TOTAL $
6123405 Van 9  YLS91M 2 9.14 0 9.14
10780800 CZ78BV  Discov 1 4.55 0 4.55
YNUO5R NSW 2 17.15 1.10 18.25
Payments, account fees and adjustments
26/09/2026 Pre-Paid Account Top-up 300.00
Detailed statement
Tag Number: 10780800 Total Trips: 1
08/09/2026 16:48 SHB and SHT (100) -- Sydney Harbour Bridge (South) 4.55
Total for Tag 4.55
Licence Plate No: YNUO5R Total Trips: 2
21/09/2026 09:46 M5 South West Motorway (105) -- Henry Lawson Drive Car 6.06
21/09/2026 09:46 M5 South West Motorway (105) -- Video Matching Fee Car 0.55
Page 3 of 14
Detailed statement
Licence Plate No: YNUO5R - continued Total Trips: 2
15/09/2026 08:28 WestConnex (140) -- KGR (M5W ML) - Princes Hwy Car 11.09
15/09/2026 08:28 WestConnex (140) -- Video Matching Fee Car 0.55
Total for Vehicle 18.25
Tag Number: 6123405 Total Trips: 2
28/09/2026 09:50 WestConnex (140) -- Silverwater Rd-Homebush Bay Dr 3.78
25/09/2026 09:43 WestConnex (140) -- Silverwater Rd-Concord/Strath 5.36
Total for Tag 9.14
"""


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class TollImportTests(TestCase):
    def setUp(self):
        from . import toll_import

        self.toll_import = toll_import
        self.api = APIClient()
        self.api.force_authenticate(get_user_model().objects.create_user("office"))
        self.van9 = Vehicle.objects.create(make="Van 9", model="HiAce", rego="YLS91M")
        self.van5 = Vehicle.objects.create(make="Van 5", model="HiAce", rego="YNU05R")
        Vehicle.objects.create(make="Van 1", model="HiAce", rego="FRL47Y")

    def post(self, **extra):
        pdf = SimpleUploadedFile("toll.pdf", b"%PDF-fake", content_type="application/pdf")
        with mock.patch.object(self.toll_import, "pdf_text", return_value=TOLL_TEXT):
            return self.api.post("/api/toll-import/", {"file": pdf, **extra}, format="multipart")

    def test_preview_matches_vans_and_leaves_other_vehicles_out(self):
        data = self.post().data
        self.assertEqual(data["checks"], [])
        self.assertEqual(str(data["total"]), "27.39")
        self.assertEqual(str(data["statementTotal"]), "31.94")
        # The plate YNUO5R (letter O) is Van 5's YNU05R.
        self.assertEqual([(v["vehicle"], v["trips"], str(v["fees"])) for v in data["vehicles"]],
                         [(self.van5.pk, 2, "1.10"), (self.van9.pk, 2, "0")])
        self.assertEqual([v["label"] for v in data["leftOut"]], ["CZ78BV Discov"])

    def test_import_analysis_and_reimport(self):
        self.assertEqual(self.post(confirm="1").status_code, 201)
        self.assertEqual(self.post(confirm="1").data["replaced"], True)  # same invoice: replaced, not doubled
        data = self.api.get("/api/tolls/").data
        current = data["current"]
        self.assertEqual((str(current["total"]), current["trips"], str(current["fees"]), str(current["otherTotal"])),
                         ("27.39", 4, "1.10", "4.55"))
        self.assertEqual([v["label"] for v in current["vans"]], ["Van 5", "Van 9"])
        self.assertEqual(current["roads"][0]["road"], "WestConnex")
        self.assertEqual([(t["title"], t["tone"], t["filter"]) for t in current["todo"]], [("Fix Van 5's toll tag", "warn", "tag")])
        self.assertIn("2 trips were charged by number plate", current["todo"][0]["text"])
        self.assertEqual(current["quiet"], ["Van 1"])
        self.assertNotIn("Discov", str(current))
        self.assertEqual((str(current["claim"]), str(current["fees"])), ("0", "1.10"))
        self.assertEqual(len(current["daily"]), 31)
        self.assertIsNone(current["compare"])
        self.assertEqual([r["label"] for r in current["runs"]], ["Van 5", "Van 9"])

        self.assertEqual(self.api.delete(f"/api/tolls/{current['statement']['id']}/").status_code, 204)
        self.assertIsNone(self.api.get("/api/tolls/").data["current"])

    def test_wrong_file_is_refused(self):
        pdf = SimpleUploadedFile("other.pdf", b"%PDF-fake", content_type="application/pdf")
        with mock.patch.object(self.toll_import, "pdf_text", return_value="Some other document"):
            res = self.api.post("/api/toll-import/", {"file": pdf}, format="multipart")
        self.assertEqual(res.status_code, 400)

    def test_double_charges_odd_times_and_running_cost(self):
        from datetime import time

        from . import services
        from .models import TollStatement, TollTrip

        st = TollStatement.objects.create(invoice_number="1", period_start=date(2026, 9, 1), period_end=date(2026, 9, 30), total=30)
        def trip(day, at, detail="Hammondville (Main)"):
            return TollTrip.objects.create(statement=st, vehicle=self.van9, source="tag", date=date(2026, 9, day),
                                           time=time(*at), road="M5 South West Motorway", detail=detail, amount=6)
        trip(3, (11, 14)); trip(3, (11, 19))      # Thursday, 5 minutes apart: a double charge
        trip(3, (12, 0), "River Road")            # at 12 pm: flagged as late
        trip(5, (9, 0)); trip(7, (9, 0))          # Saturday: flagged as weekend; Monday morning: fine
        a = self.toll_import.analysis(st)
        self.assertEqual([(d["label"], d["times"], float(d["extra"])) for d in a["doubles"]], [("Van 9", ["11:14", "11:19"], 6.0)])
        self.assertEqual((float(a["claim"]), a["vans"][0]["late"], a["vans"][0]["weekend"], a["vans"][0]["doubles"]), (6.0, 1, 1, 2))
        # To do: claim the double charge first (red), then ask about the Saturday trip (yellow).
        self.assertEqual([(t["title"], t["tone"]) for t in a["todo"]],
                         [("Claim back $6.00 for Van 9", "due"), ("Ask about Van 9 on Saturdays", "warn")])
        self.assertIn("before 29-12-2026", a["todo"][0]["text"])  # no issue date: 90 days from the period end
        # 3 trips ($18) on the 3rd against a usual $6 day: a heavy day.
        self.assertEqual([(h["label"], str(h["date"]), h["trips"], h["times"]) for h in a["heavy"]], [("Van 9", "2026-09-03", 3, 3.0)])
        self.assertTrue(a["grid"][0]["cells"]["2026-09-03"]["heavy"])
        self.assertFalse(a["grid"][0]["cells"]["2026-09-07"]["heavy"])
        row = next(r for r in services.analytics()["runningCost"] if r["id"] == self.van9.pk)
        self.assertEqual((row["tolls"], row["total"]), (30.0, 30.0))

    def test_ticking_off_a_to_do_item_is_remembered(self):
        self.post(confirm="1")
        current = self.api.get("/api/tolls/").data["current"]
        key = current["todo"][0]["key"]
        sid = current["statement"]["id"]
        self.api.post(f"/api/tolls/{sid}/done/", {"key": key, "done": True}, format="json")
        again = self.api.get("/api/tolls/").data["current"]["todo"]
        self.assertEqual([t["done"] for t in again], [True])
        self.api.post(f"/api/tolls/{sid}/done/", {"key": key, "done": False}, format="json")
        self.assertEqual([t["done"] for t in self.api.get("/api/tolls/").data["current"]["todo"]], [False])

    def test_a_van_whose_run_changed_is_judged_in_two_parts(self):
        from datetime import time

        from .models import TollStatement, TollTrip

        st = TollStatement.objects.create(invoice_number="2", period_start=date(2026, 9, 1), period_end=date(2026, 9, 30), total=0)
        for day in range(1, 31):
            amount = 10 if day < 15 else 50
            if day in (8, 9, 22):  # one dearer day in each part of the month
                amount += 30
            TollTrip.objects.create(statement=st, vehicle=self.van9, source="tag", date=date(2026, 9, day), time=time(8, 0),
                                    road="WestConnex", detail="Church St", amount=amount)
        a = self.toll_import.analysis(st)
        self.assertEqual(str(a["vans"][0]["shift"]["date"]), "2026-09-15")
        # Days 15-21 cost $50, five times the old usual day, but are not heavy: $50 is the new usual.
        self.assertEqual(sorted(str(h["date"]) for h in a["heavy"]), ["2026-09-08", "2026-09-09", "2026-09-22"])


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PdfAndDocumentDriveTests(TestCase):
    """Toll PDFs and van documents go to Drive too, and files saved on disk
    earlier move there once Drive is connected."""

    def setUp(self):
        from . import toll_import

        self.toll_import = toll_import
        self.api = APIClient()
        self.api.force_authenticate(get_user_model().objects.create_user("office"))
        self.van = Vehicle.objects.create(make="Van 9", model="HiAce", rego="YLS91M")
        self.service = ServiceRecord.objects.create(vehicle=self.van, service_type="Brake service", date=date(2026, 10, 7))
        self.fake = FakeDrive()
        self.on = mock.patch.object(drive, "enabled", return_value=True)
        self.client_patch = mock.patch.object(drive, "DriveClient", return_value=self.fake)

    def toll_post(self):
        pdf = SimpleUploadedFile("toll.pdf", b"%PDF-1.4 toll", content_type="application/pdf")
        with mock.patch.object(self.toll_import, "pdf_text", return_value=TOLL_TEXT):
            return self.api.post("/api/toll-import/", {"file": pdf, "confirm": "1"}, format="multipart")

    def test_a_document_goes_to_drive_under_documents_and_stays_when_the_job_syncs(self):
        with self.on, self.client_patch:
            pdf = SimpleUploadedFile("invoice.pdf", b"%PDF-1.4 invoice", content_type="application/pdf")
            res = self.api.post("/api/attachments/", {"file": pdf, "kind": "Invoice", "service": self.service.pk}, format="multipart")
            self.assertEqual(res.status_code, 201)
            att = Attachment.objects.get()
            self.assertEqual((att.file.name, att.drive_file_id, att.original_name), ("", "file1", "invoice.pdf"))
            self.assertEqual(self.fake.path(self.fake.files["file1"][0]["parents"][0]), f"Documents/{self.van}")
            # A real PDF comes back, not a picture of its first page.
            got = self.api.get(res.data["url"])
            self.assertEqual((got.content, got["Content-Type"]), (b"%PDF-1.4 invoice", "application/pdf"))
            # Opening the job's photos must not drop the invoice just because it isn't in the photo folder.
            self.service.drive_folder_id = self.fake.create_folder("x", "root-folder")
            self.service.save()
            self.api.get("/api/attachments/", {"service": self.service.pk})
            self.assertEqual(Attachment.objects.count(), 1)

    def test_toll_pdf_goes_to_the_tolls_folder_and_is_served_and_trashed(self):
        Vehicle.objects.create(make="Van 5", model="HiAce", rego="YNU05R")
        with self.on, self.client_patch:
            self.assertEqual(self.toll_post().status_code, 201)
            st = self.toll_import.TollStatement.objects.get()
            self.assertEqual((st.file.name, st.drive_file_id), ("", "file1"))
            meta = self.fake.files["file1"][0]
            self.assertEqual((self.fake.path(meta["parents"][0]), meta["name"]), ("Tolls", "E-Toll statement 29-08-2026 to 28-09-2026.pdf"))
            current = self.api.get("/api/tolls/").data["current"]["statement"]
            self.assertEqual(self.api.get(current["fileUrl"]).content, b"%PDF-1.4 toll")
            self.assertEqual(self.toll_post().data["replaced"], True)  # re-import replaces: the old PDF goes to the Bin
            self.assertEqual(self.fake.trashed, ["file1"])
            sid = self.api.get("/api/tolls/").data["current"]["statement"]["id"]
            self.assertEqual(self.api.delete(f"/api/tolls/{sid}/").status_code, 204)
            self.assertEqual(self.fake.trashed, ["file1", "file2"])

    def test_files_saved_on_disk_earlier_move_to_drive_once_it_is_connected(self):
        with mock.patch.object(drive, "enabled", return_value=False):
            pdf = SimpleUploadedFile("rego.pdf", b"%PDF-1.4 rego", content_type="application/pdf")
            self.api.post("/api/attachments/", {"file": pdf, "kind": "Registration", "vehicle": self.van.pk}, format="multipart")
            photo = SimpleUploadedFile("dent.jpg", JPEG, content_type="image/jpeg")
            self.api.post("/api/attachments/", {"file": photo, "kind": ISSUE_PHOTO, "service": self.service.pk}, format="multipart")
            self.toll_post()
        self.assertEqual(Attachment.objects.exclude(file="").count(), 2)
        with self.on, self.client_patch:
            self.assertEqual(drive.move_local_files(force=True), 3)
            self.assertEqual(Attachment.objects.exclude(file="").count(), 0)
            names = sorted(a.original_name for a in Attachment.objects.all())
            self.assertEqual(names, ["07-10-2026.jpg", "rego.pdf"])  # the photo is renamed by the job's date
            self.assertEqual(self.toll_import.TollStatement.objects.get().file.name, "")
            self.assertEqual(drive.move_local_files(force=True), 0)  # nothing left to move

    def test_links_say_whether_drive_is_connected(self):
        with mock.patch.object(drive, "enabled", return_value=False):
            self.assertIs(self.api.get("/api/links/").data["drive"], False)
        with self.on:
            self.assertIs(self.api.get("/api/links/").data["drive"], True)


class InsuranceIgnoredTests(TestCase):
    """Insurance dates are not tracked: they never warn and never change a van's status."""

    def test_an_expired_insurance_date_is_ignored_but_rego_still_counts(self):
        from datetime import timedelta

        from django.utils import timezone

        from . import services

        today = timezone.localdate()
        van = Vehicle.objects.create(make="Van 3", model="HiAce", rego="ABC123", insurance_expiry=today - timedelta(days=30), rego_expiry=today + timedelta(days=400))
        self.assertEqual(services.vehicle_status_badge(van), "ok")
        self.assertEqual(services.alerts(), [])
        self.assertEqual(services.dashboard_summary()["due_count"], 0)
        van.rego_expiry = today - timedelta(days=1)
        van.save()
        self.assertEqual(services.vehicle_status_badge(van), "attention")
        self.assertEqual([a["title"] for a in services.alerts()], ["Registration expires"])


FUEL_TEXT = "\n".join([
    "METRO PETROLEUM CARD",
    "VEHICLE REPORT AND STATEMENT TO 08 SEP 26",
    "Vehicle\tCard No.\teGrant\tDate\tSupplier\tABN\tOur Ref\tCust Ref\tOdometer\tProduct\tLitres\tNett\tGST\tGross",
    "",
    "AAA111 HIACE\t1111 2222",
    "\t\t\t10/08/2026\tMETRO SYDENHAM\t99610577896\t1\tAAA111\t182000\tDIESEL\t40.00\t80.00\t8.00\t88.00",
    "\t\t\t07/09/2026\tMETRO SYDENHAM\t99610577896\t2\tAAA111\t183361\tDIESEL\t30.00\t60.00\t6.00\t66.00",
    "BBB222 HIACE\t3333 4444",
    "\t\t\t04/09/2026\tMETRO SYDENHAM\t99610577896\t3\tBBB222\t56101\tDIESEL\t35.00\t70.00\t7.00\t77.00",
    "CCC333 HIACE\t5555 6666",
    "\t\t\t10/08/2026\tMETRO SYDENHAM\t99610577896\t4\tCCC333\t100000\tDIESEL\t35.00\t70.00\t7.00\t77.00",
    "\t\t\t05/09/2026\tMETRO SYDENHAM\t99610577896\t5\tCCC333\t2000000\tDIESEL\t35.00\t70.00\t7.00\t77.00",
    "\t\t\t07/09/2026\tMETRO SYDENHAM\t99610577896\t6\tCCC333\t\tDIESEL\t20.00\t40.00\t4.00\t44.00",
    "DDD444 HIACE\t7777 8888",
    "\t\t\t05/09/2026\tMETRO SYDENHAM\t99610577896\t7\tDDD444\t\tDIESEL\t20.00\t40.00\t4.00\t44.00",
    "EEE555 HIACE\t9999 0000",
    "\t\t\t05/09/2026\tMETRO SYDENHAM\t99610577896\t8\tEEE555\t150000\tDIESEL\t20.00\t40.00\t4.00\t44.00",
])


class FuelStatementOdometerTests(TestCase):
    """A fuel statement moves each van's km to its newest believable reading,
    and the next-service reminder (last service km + interval) follows it."""

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(get_user_model().objects.create_user("office"))
        # Van A: 188,000 is a guess typed when a service was booked. Its last real service was at 175,000.
        self.a = Vehicle.objects.create(make="Van 1", model="HiAce", rego="AAA111", odometer=188000, service_interval_km=10000)
        ServiceRecord.objects.create(vehicle=self.a, service_type="Scheduled service", date=date(2026, 8, 1), odometer=175000, status="Invoiced")
        ServiceRecord.objects.create(vehicle=self.a, service_type="Scheduled service", date=date(2026, 10, 7), odometer=188000, status="Booked")
        # Van B: serviced on 30-09 at 61,218, after its last fill-up (56,101 on 04-09), so the service km is the newest reading.
        self.b = Vehicle.objects.create(make="Van 2", model="HiAce", rego="BBB222", odometer=61218, service_interval_km=10000)
        ServiceRecord.objects.create(vehicle=self.b, service_type="Scheduled service", date=date(2026, 9, 30), odometer=61218, status="Invoiced")
        # Van C: a typo reading and a latest fill-up with no km at all.
        self.c = Vehicle.objects.create(make="Van 3", model="HiAce", rego="CCC333", odometer=90000, service_interval_km=10000)
        # Van D: nobody ever types the km at the pump. Van E: a reading 100,000 km above its last service.
        self.d = Vehicle.objects.create(make="Van 4", model="HiAce", rego="DDD444", odometer=40000, service_interval_km=10000)
        self.e = Vehicle.objects.create(make="Van 5", model="HiAce", rego="EEE555", odometer=50000, service_interval_km=10000)
        ServiceRecord.objects.create(vehicle=self.e, service_type="Scheduled service", date=date(2026, 8, 1), odometer=50000, status="Invoiced")

    def upload(self, **extra):
        file = SimpleUploadedFile("MPDATA080926.TXT", FUEL_TEXT.encode(), content_type="text/plain")
        return self.api.post("/api/fuel-import/", {"file": file, **extra}, format="multipart")

    def test_preview_says_what_each_vans_km_will_become(self):
        cards = {c["label"].split()[0]: c["odometer"] for c in self.upload().data["cards"]}
        self.assertEqual({k: cards["AAA111"][k] for k in ("before", "after", "date", "changed", "lower")},
                         {"before": 188000, "after": 183361, "date": "2026-09-07", "changed": True, "lower": True})
        self.assertFalse(cards["BBB222"]["changed"])  # the service at 61,218 is newer than the fill-up
        self.assertEqual((cards["CCC333"]["after"], cards["CCC333"]["changed"]), (100000, True))  # the 2,000,000 typo is ignored

    def test_import_updates_km_and_the_next_service_reminder(self):
        from . import services

        before = services.next_service_due(self.a)["km_left"]
        assignments = json.dumps({"1111 2222": self.a.pk, "3333 4444": self.b.pk, "5555 6666": self.c.pk, "7777 8888": self.d.pk, "9999 0000": self.e.pk})
        result = self.upload(assignments=assignments).data
        self.assertEqual(sorted((o["label"], o["before"], o["after"]) for o in result["odometers"]),
                         [("Van 1", 188000, 183361), ("Van 3", 90000, 100000)])
        for v in (self.a, self.b, self.c, self.d, self.e):
            v.refresh_from_db()
        self.assertEqual((self.a.odometer, self.b.odometer, self.c.odometer), (183361, 61218, 100000))
        self.assertEqual((self.d.odometer, self.e.odometer), (40000, 50000))  # nothing usable on the statement: left alone
        # Van A: last service at 175,000 + 10,000 = due at 185,000, so 1,639 km to go. With the guessed km it looked 3,000 km overdue.
        self.assertEqual((before, services.next_service_due(self.a)["km_left"]), (-3000, 1639))
        # Van B: its own last service km (61,218) is what the reminder counts from.
        self.assertEqual(services.next_service_due(self.b), {"due_at": 71218, "km_left": 10000, "booked": None})

    def test_anything_odd_about_the_km_is_flagged(self):
        flags = {c["label"].split()[0]: [(f[0], f[1]) for f in c["odometer"]["flags"]] for c in self.upload().data["cards"]}
        text = lambda key: " | ".join(x[1] for x in flags[key])
        self.assertEqual(flags["BBB222"], [])  # a clean van has no flags
        self.assertIn("lower than the km in the app", text("AAA111"))
        self.assertIn("1 km reading on this statement looked wrong", text("CCC333"))
        self.assertIn("km is from 10-08-2026, but it was last filled up on 07-09-2026", text("CCC333"))  # Van 3's newest fill-up has no km
        self.assertIn("No km was typed at the pump", text("DDD444"))
        self.assertEqual(flags["EEE555"][0][0], "red")  # 150,000 km in 35 days can't be right
        self.assertIn("Every km reading on this statement looks wrong", text("EEE555"))
        # after importing, the same warnings come back in the result
        assignments = json.dumps({"1111 2222": self.a.pk, "7777 8888": self.d.pk, "9999 0000": self.e.pk})
        result = self.upload(assignments=assignments).data
        self.assertEqual(sorted(f["label"] for f in result["odometerFlags"]), ["Van 1", "Van 4", "Van 5"])
        self.e.refresh_from_db()
        self.assertEqual(self.e.odometer, 50000)

    def test_each_van_says_when_its_km_was_last_confirmed(self):
        from .serializers import VehicleSerializer

        asof = {v["rego"]: v["odometerAsOf"] for v in VehicleSerializer(Vehicle.objects.all(), many=True).data}
        self.assertEqual(asof["BBB222"], "2026-09-30")  # the service at 61,218
        self.assertEqual(asof["AAA111"], "2026-08-01")  # the 188,000 on the booked job is only a guess, so the last real reading counts
        self.assertIsNone(asof["DDD444"])  # nothing but a number typed in by hand



class VanMonthsTests(TestCase):
    """Reports: each van's fuel and tolls, month by month."""

    def test_each_van_month_by_month(self):
        from datetime import time, timedelta

        from django.utils import timezone

        from . import services
        from .models import FuelLog, TollStatement, TollTrip

        today = timezone.localdate()
        last_day_of_last_month = today.replace(day=1) - timedelta(days=1)
        van = Vehicle.objects.create(make="Van 1", model="HiAce", rego="AAA111")
        FuelLog.objects.create(vehicle=van, date=today, litres=50, cost=100, product="")  # diesel
        FuelLog.objects.create(vehicle=van, date=today, litres=0, cost=10, product="Card fee")  # a card charge: dollars, no litres
        FuelLog.objects.create(vehicle=van, date=last_day_of_last_month, litres=30, cost=60, product="")
        st = TollStatement.objects.create(invoice_number="9", period_start=last_day_of_last_month, period_end=today, total=0)
        for day, amount, fee in ((today, "5.00", False), (today, "0.55", True), (last_day_of_last_month, "3.00", False)):
            TollTrip.objects.create(statement=st, vehicle=van, source="tag", date=day, time=time(8, 0), road="WestConnex", detail="Church St", amount=amount, is_fee=fee)

        data = services.analytics()["vanMonths"]
        this_key, last_key = today.strftime("%Y-%m"), last_day_of_last_month.strftime("%Y-%m")
        self.assertEqual([m["key"] for m in data["months"]][-2:], [last_key, this_key])
        fuel = data["fuel"][0]
        self.assertEqual((fuel["label"], fuel["months"][this_key], fuel["months"][last_key]), ("Van 1", {"cost": 110.0, "litres": 50.0}, {"cost": 60.0, "litres": 30.0}))
        self.assertEqual(fuel["total"], {"cost": 170.0, "litres": 80.0})
        toll = data["tolls"][0]
        self.assertEqual((toll["months"][this_key], toll["months"][last_key]), ({"cost": 5.55, "trips": 1.0}, {"cost": 3.0, "trips": 1.0}))
        self.assertEqual(toll["total"], {"cost": 8.55, "trips": 2.0})


class FuelStatementPeriodTests(TestCase):
    """Fuel statements overlap by a day (late-posted fill-ups). Each statement shows exactly its own lines."""

    HEADER = "Vehicle\tCard No.\teGrant\tDate\tSupplier\tABN\tOur Ref\tCust Ref\tOdometer\tProduct\tLitres\tNett\tGST\tGross"
    ROW = "\t\t\t{d}\tMETRO SYDENHAM\t99610577896\t{n}\tAAA111\t{odo}\tDIESEL\t{l}\t0.00\t0.00\t{c}"

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(get_user_model().objects.create_user("office"))
        self.van = Vehicle.objects.create(make="Van 1", model="HiAce", rego="AAA111")

    def statement(self, to, rows):
        text = "\n".join(["METRO PETROLEUM CARD", f"VEHICLE REPORT AND STATEMENT TO {to}", self.HEADER, "", "AAA111 HIACE\t1111 2222"] + rows)
        file = SimpleUploadedFile("MPDATA.TXT", text.encode(), content_type="text/plain")
        res = self.api.post("/api/fuel-import/", {"file": file, "assignments": json.dumps({"1111 2222": self.van.pk})}, format="multipart")
        self.assertEqual(res.status_code, 201)

    def test_a_statement_shows_exactly_its_own_lines(self):
        from .models import FuelLog

        self.statement("08 SEP 26", [self.ROW.format(d="10/08/2026", n=1, odo=182000, l="40.00", c="88.00"), self.ROW.format(d="07/09/2026", n=2, odo=183361, l="30.00", c="66.00")])
        FuelLog.objects.create(vehicle=self.van, date=date(2026, 9, 20), litres=10, cost=30)  # logged by hand between the two statements
        # The next statement lists a fill-up dated 08-09, the day the last one ended.
        self.statement("08 OCT 26", [self.ROW.format(d="08/09/2026", n=3, odo=183500, l="20.00", c="50.00"), self.ROW.format(d="05/10/2026", n=4, odo=184000, l="30.00", c="60.00")])

        listed = self.api.get("/api/fuel-statements/").data
        self.assertEqual([(str(s["date"]), s["lines"], float(s["total"])) for s in listed], [("2026-10-08", 2, 110.0), ("2026-09-08", 2, 154.0)])

        def costs(statement):
            rows = self.api.get("/api/fuel-logs/", {"statement": statement, "page_size": 100}).data["results"]
            return sorted(float(r["cost"]) for r in rows)

        self.assertEqual(costs("2026-09-08"), [66.0, 88.0])  # not the 50.00 dated 08-09
        self.assertEqual(costs("2026-10-08"), [30.0, 50.0, 60.0])  # its own two lines, plus the one logged by hand in between

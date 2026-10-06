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

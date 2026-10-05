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
        self.folders, self.files, self.trashed = {}, {}, []

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
        meta = {"id": f"file{len(self.files) + 1}", "name": name, "mimeType": mime_type, "parents": [folder_id],
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

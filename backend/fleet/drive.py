"""
Issue photos (services) and damage photos (incidents) kept in Google Drive,
the same way NPD Tracker keeps its product photos:

    Fleet Maintenance Photos/
        Incidents/
            <Van>/
                INC-VAN6-06102026.jpg, INC-VAN6-06102026 (2).jpg   (incident, van, date)
        Services/
            <Van>/
                SER-VAN6-07102026.jpg                              (service, van, date)

The Drive is the achievecafeprovisions@gmail.com account's. A personal
account can't take files from a service account (no storage quota), so the
app acts as that account through an OAuth refresh token, written once by
`manage.py drive_authorize` (FLEET_DRIVE_TOKEN_FILE).

PDFs and other documents go to Drive too:

    Fleet Maintenance Photos/
        Tolls/            TOL-29082026-28092026.pdf
        Fines/<Van>/      FIN-VAN4-14102026.jpg  (a photo of the fine notice)
        Fuel/             FUE-08102026.txt, FUE-08102026.pdf (statement to 08-10-2026)
        Documents/<Van>/  DOC-VAN6-12102026 - <original file name>
        Licences/<Name>/  Sam Example - licence.jpg, Sam Example - licence (2).jpg   (licence photos)

Drive is the source of truth for photos: a photo dropped into a van's folder in the
Drive app, named with a job's date, shows up on that job the next time it's
opened, and photos deleted in Drive disappear from the app. Without a token (dev, tests) photos are stored on local disk like
any other attachment.
"""

import io
import re
import logging
import time as _time
import threading
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.utils import timezone
from google.auth.transport.requests import AuthorizedSession, Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseUpload

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/drive"]
FOLDER_MIME = "application/vnd.google-apps.folder"
FILE_FIELDS = "id,name,mimeType,size,parents,createdTime,modifiedTime,thumbnailLink"
# Shown to the browser as-is; anything else (iPhone HEIC…) goes via Drive's preview.
BROWSER_SAFE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/bmp"}
THUMB_SIZE = 400

_credentials = None
_lock = threading.Lock()
_folder_lock = threading.Lock()  # two uploads at once mustn't make two folders
_root_id = None


def token_path():
    path = Path(settings.FLEET_DRIVE_TOKEN_FILE)
    return path if path.is_absolute() else settings.BASE_DIR / path


def client_secrets_path():
    path = Path(settings.FLEET_DRIVE_CLIENT_SECRETS)
    return path if path.is_absolute() else settings.BASE_DIR / path


def enabled():
    return token_path().exists()


def reset_credentials():
    """Drop cached credentials/folder ids after signing in again."""
    global _credentials, _root_id
    _credentials = _root_id = None


def folder_url(folder_id):
    return f"https://drive.google.com/drive/folders/{folder_id}" if folder_id else ""


def root_folder_url():
    """Link to the top Drive folder ("Fleet Maintenance Photos"), or "" when
    Drive is off or can't be reached. The folder id is looked up once."""
    if not enabled():
        return ""
    try:
        return folder_url(_root_id or DriveClient().root_folder_id())
    except Exception:
        return ""


def parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def _get_credentials():
    global _credentials
    with _lock:
        if _credentials is None:
            _credentials = Credentials.from_authorized_user_file(str(token_path()), SCOPES)
        if not _credentials.valid:
            _credentials.refresh(Request())
        return _credentials


def _q(value):
    return value.replace("\\", "\\\\").replace("'", "\\'")


class DriveClient:
    """One per request/thread: the googleapiclient service isn't thread-safe."""

    def __init__(self):
        self.credentials = _get_credentials()
        self.files = build("drive", "v3", credentials=self.credentials, cache_discovery=False).files()

    def _find_folder(self, name, parent_id):
        found = self.files.list(
            q=f"name = '{_q(name)}' and '{parent_id}' in parents and mimeType = '{FOLDER_MIME}' and trashed = false",
            fields="files(id)",
            pageSize=1,
        ).execute().get("files", [])
        return found[0]["id"] if found else None

    def create_folder(self, name, parent_id):
        body = {"name": name, "mimeType": FOLDER_MIME, "parents": [parent_id]}
        return self.files.create(body=body, fields="id").execute()["id"]

    def get_or_create_folder(self, name, parent_id):
        return self._find_folder(name, parent_id) or self.create_folder(name, parent_id)

    def root_folder_id(self):
        global _root_id
        if _root_id is None:
            _root_id = self.get_or_create_folder(settings.FLEET_DRIVE_ROOT_FOLDER, "root")
        return _root_id

    def folder_is_live(self, folder_id):
        try:
            return not self.files.get(fileId=folder_id, fields="trashed").execute().get("trashed")
        except HttpError as exc:
            if exc.resp.status == 404:
                return False
            raise

    def list_images(self, folder_id):
        return self.list_files(folder_id, " and mimeType contains 'image/'")

    def list_files(self, folder_id, extra=""):
        q = f"'{folder_id}' in parents and trashed = false" + extra
        out, token = [], None
        while True:
            page = self.files.list(q=q, fields=f"nextPageToken,files({FILE_FIELDS})", pageSize=1000, pageToken=token).execute()
            out += page.get("files", [])
            token = page.get("nextPageToken")
            if not token:
                return out

    def upload(self, folder_id, name, content, mime_type):
        media = MediaIoBaseUpload(io.BytesIO(content), mimetype=mime_type or "application/octet-stream", resumable=False)
        return self.files.create(body={"name": name, "parents": [folder_id]}, media_body=media, fields=FILE_FIELDS).execute()

    def get_meta(self, file_id):
        return self.files.get(fileId=file_id, fields=FILE_FIELDS).execute()

    def download(self, file_id):
        return self.files.get_media(fileId=file_id).execute()

    def thumbnail(self, file_id, size):
        """Drive's rendered preview (also works for HEIC). Stored links
        expire after a few hours, so a fresh one is asked for each time."""
        link = self.get_meta(file_id).get("thumbnailLink")
        if not link:
            return None
        response = AuthorizedSession(self.credentials).get(link.rsplit("=", 1)[0] + f"=s{size}", timeout=30)
        return response.content if response.status_code == 200 else None

    def trash(self, file_id):
        """Trash, not delete: recoverable from Drive's Bin for 30 days."""
        try:
            self.files.update(fileId=file_id, body={"trashed": True}, fields="id").execute()
        except HttpError as exc:
            if exc.resp.status != 404:
                raise


# ── Job folders ────────────────────────────────────────────────────────────


def section_name(job):
    return "Incidents" if hasattr(job, "incident_type") else "Services"


def van_code(vehicle):
    """"Van 6" -> "VAN6" (letters and digits only, for file names)."""
    return re.sub(r"[^A-Za-z0-9]", "", str(vehicle)).upper()


def date_name(job):
    """INC-VAN6-12102026 for an incident, SER-VAN6-12102026 for a service."""
    prefix = "INC" if hasattr(job, "incident_type") else "SER"
    return f"{prefix}-{van_code(job.vehicle)}-{job.date:%d%m%Y}"


def old_date_name(job):
    """How photos were named before 12-10-2026 (just the date); still recognised."""
    return f"{job.date:%d-%m-%Y}"


def ensure_folder(client, job):
    """The van's folder under Incidents/ or Services/, created (or re-created,
    if someone deleted it in Drive) on first use. Stored on the job as
    drive_folder_id."""
    with _folder_lock:
        job.refresh_from_db(fields=["drive_folder_id"])
        if job.drive_folder_id and client.folder_is_live(job.drive_folder_id):
            return job.drive_folder_id
        section = client.get_or_create_folder(section_name(job), client.root_folder_id())
        folder_id = client.get_or_create_folder(str(job.vehicle), section)
        type(job).objects.filter(pk=job.pk).update(drive_folder_id=folder_id)
        job.drive_folder_id = folder_id
        return folder_id


def photo_name(client, folder_id, job, original_name):
    """INC-VAN6-06102026.jpg, then INC-VAN6-06102026 (2).jpg and so on for
    more photos that day (SER- for a service)."""
    ext = ("." + original_name.rsplit(".", 1)[-1].lower()) if "." in original_name else ""
    taken = {f["name"].lower() for f in client.list_images(folder_id)}
    base, n = date_name(job), 1
    name = f"{base}{ext}"
    while name.lower() in taken:
        n += 1
        name = f"{base} ({n}){ext}"
    return name


def ensure_path(client, *names):
    """A folder under the root, e.g. ensure_path(client, "Documents", "Van 9")."""
    with _folder_lock:
        folder = client.root_folder_id()
        for name in names:
            folder = client.get_or_create_folder(name, folder)
        return folder


def fine_name(client, folder_id, fine, original_name):
    """FIN-VAN4-14102026.jpg, then FIN-VAN4-14102026 (2).jpg for more pages."""
    ext = ("." + original_name.rsplit(".", 1)[-1].lower()) if "." in original_name else ""
    taken = {f["name"].lower() for f in client.list_images(folder_id)}
    base, n = f"FIN-{van_code(fine.vehicle)}-{fine.date:%d%m%Y}", 1
    name = f"{base}{ext}"
    while name.lower() in taken:
        n += 1
        name = f"{base} ({n}){ext}"
    return name


def upload_for(client, *, vehicle, job, kind, filename, content, content_type, fine=None):
    """Put a file where it belongs in Drive: issue/damage photos in their
    van's Incidents/Services folder (named by date), everything else in
    Documents/<van>. Returns (Drive's file info, the name it was given)."""
    from .models import ISSUE_PHOTO

    if fine is not None:
        folder = ensure_path(client, "Fines", str(vehicle))
        name = fine_name(client, folder, fine, filename)
    elif job is not None and kind == ISSUE_PHOTO:
        folder = ensure_folder(client, job)
        name = photo_name(client, folder, job, filename)
    else:
        folder = ensure_path(client, "Documents", str(vehicle))
        name = f"DOC-{van_code(vehicle)}-{timezone.localdate():%d%m%Y} - {filename}"
    return client.upload(folder, name, content, content_type), name


def upload_driver_file(client, driver, filename, content, content_type):
    """A licence photo or scan: Licences/<name>/<name> - licence.jpg, then
    "(2)" for the next one (front, back). Returns (Drive's file info, the name it was given)."""
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    folder = ensure_path(client, "Licences", driver.name)
    taken = {f["name"].lower() for f in client.list_images(folder)}
    base = f"{driver.name} - licence"
    name, n = f"{base}{ext}", 1
    while name.lower() in taken:
        n += 1
        name = f"{base} ({n}){ext}"
    return client.upload(folder, name, content, content_type), name


# Files saved on the server's disk while Drive wasn't connected are moved to
# Drive the first time they're needed after it is (at most this often).
_MOVE_EVERY_SECONDS = 120
_last_move = 0.0


def move_local_files(limit=10, force=False):
    """Move files that were saved on the server's disk into Drive. Safe to
    call often: it does nothing when Drive isn't connected or there is
    nothing to move. Returns how many files were moved."""
    global _last_move
    from .fuel_import import FILE_TYPES
    from .models import Attachment, DriverFile, FuelStatementFile, TollStatement

    if not enabled() or (not force and _time.monotonic() - _last_move < _MOVE_EVERY_SECONDS):
        return 0
    _last_move = _time.monotonic()
    atts = list(Attachment.objects.filter(drive_file_id__isnull=True).exclude(file="").select_related("vehicle", "service", "incident", "fine")[:limit])
    tolls = list(TollStatement.objects.filter(drive_file_id="").exclude(file="")[:limit])
    licences = list(DriverFile.objects.filter(drive_file_id__isnull=True).exclude(file="").select_related("driver")[:limit])
    fuel = list(FuelStatementFile.objects.filter(drive_file_id="").exclude(file="")[:limit])
    if not (atts or tolls or licences or fuel):
        return 0
    moved = 0
    try:
        client = DriveClient()
    except Exception:
        # An expired or revoked Google sign-in must never break the page that
        # asked; the files simply stay where they are until Drive works again.
        logger.exception("Couldn't connect to Google Drive to move waiting files")
        return 0
    for att in atts:
        try:
            with att.file.open("rb") as f:
                content = f.read()
            meta, name = upload_for(
                client, vehicle=att.vehicle, job=att.service or att.incident, kind=att.kind, fine=att.fine,
                filename=att.original_name, content=content, content_type=att.content_type,
            )
            att.file.delete(save=False)
            Attachment.objects.filter(pk=att.pk).update(
                file="", drive_file_id=meta["id"], original_name=name[:255], drive_modified_at=parse_time(meta.get("modifiedTime")),
            )
            moved += 1
        except Exception:
            logger.exception("Couldn't move %s to Drive", att.original_name)
    for st in tolls:
        try:
            with st.file.open("rb") as f:
                content = f.read()
            meta = client.upload(ensure_path(client, "Tolls"), toll_pdf_name(st), content, "application/pdf")
            st.file.delete(save=False)
            TollStatement.objects.filter(pk=st.pk).update(file="", drive_file_id=meta["id"])
            moved += 1
        except Exception:
            logger.exception("Couldn't move toll statement %s to Drive", st.pk)
    for lic in licences:
        try:
            with lic.file.open("rb") as f:
                content = f.read()
            meta, name = upload_driver_file(client, lic.driver, lic.original_name, content, lic.content_type)
            lic.file.delete(save=False)
            DriverFile.objects.filter(pk=lic.pk).update(
                file="", drive_file_id=meta["id"], original_name=name[:255], drive_modified_at=parse_time(meta.get("modifiedTime")),
            )
            moved += 1
        except Exception:
            logger.exception("Couldn't move licence photo %s to Drive", lic.original_name)
    for ff in fuel:
        try:
            with ff.file.open("rb") as f:
                content = f.read()
            meta = client.upload(ensure_path(client, "Fuel"), fuel_file_name(ff), content, FILE_TYPES[ff.kind])
            ff.file.delete(save=False)
            FuelStatementFile.objects.filter(pk=ff.pk).update(file="", drive_file_id=meta["id"])
            moved += 1
        except Exception:
            logger.exception("Couldn't move fuel statement file %s to Drive", ff.pk)
    return moved


def fuel_file_name(f):
    """FUE-08102026.pdf: the fuel statement to 08-10-2026 (.txt is the data file)."""
    return f"FUE-{f.statement:%d%m%Y}.{f.kind}"


def toll_pdf_name(statement):
    return f"TOL-{statement.period_start:%d%m%Y}-{statement.period_end:%d%m%Y}.pdf"


def sync_job(job):
    """Bring a job's photo list in line with its van folder: photos deleted in
    Drive go; photos dropped in through Drive and named with the job's date
    are added to it. Best-effort."""
    from .models import ISSUE_PHOTO, Attachment

    if not (job.drive_folder_id and enabled()):
        return
    try:
        files = DriveClient().list_images(job.drive_folder_id)
    except Exception:
        logger.exception("Drive sync failed for %s %s", type(job).__name__, job.pk)
        return
    link = {"service": job} if hasattr(job, "service_type") else {"incident": job}
    known = dict(Attachment.objects.filter(drive_file_id__in=[f["id"] for f in files]).values_list("drive_file_id", "pk"))
    seen = set()
    for meta in files:
        fields = {
            "original_name": meta["name"][:255],
            "content_type": meta.get("mimeType", ""),
            "size": int(meta.get("size") or 0),
            "drive_modified_at": parse_time(meta.get("modifiedTime")),
        }
        if meta["id"] in known:
            Attachment.objects.filter(pk=known[meta["id"]], **link).update(**fields)
        elif meta["name"].startswith((date_name(job), old_date_name(job))):
            Attachment.objects.create(**link, **fields, vehicle=job.vehicle, kind=ISSUE_PHOTO, drive_file_id=meta["id"])
        seen.add(meta["id"])
    Attachment.objects.filter(**link, kind=ISSUE_PHOTO, drive_file_id__isnull=False).exclude(drive_file_id__in=seen).delete()


# ── Serving ────────────────────────────────────────────────────────────────


def _thumb_cache(att):
    folder = Path(settings.MEDIA_ROOT) / "photo_thumbs"
    folder.mkdir(parents=True, exist_ok=True)
    stamp = int(att.drive_modified_at.timestamp()) if att.drive_modified_at else 0
    return folder / f"{att.drive_file_id}_{stamp}.jpg"


def thumbnail(att):
    """(bytes, content_type) for a small tile, cached on disk so an 80px
    tile doesn't download a 5 MB phone photo every time."""
    path = _thumb_cache(att)
    if path.exists():
        return path.read_bytes(), "image/jpeg"
    client = DriveClient()
    data = client.thumbnail(att.drive_file_id, THUMB_SIZE)
    if data is None:  # Drive hasn't rendered a preview yet (just uploaded)
        return full(att, client)
    path.write_bytes(data)
    return data, "image/jpeg"


def full(att, client=None):
    client = client or DriveClient()
    kind = att.content_type or ""
    if kind.startswith("image/") and kind not in BROWSER_SAFE_TYPES:  # iPhone HEIC and the like: Drive's picture of it
        data = client.thumbnail(att.drive_file_id, 2000)
        if data is not None:
            return data, "image/jpeg"
    return client.download(att.drive_file_id), kind or "application/octet-stream"

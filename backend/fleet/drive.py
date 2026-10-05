"""
Issue photos (services) and damage photos (incidents) kept in Google Drive,
the same way NPD Tracker keeps its product photos:

    Fleet Maintenance Photos/
        <Van>/
            <dd-mm-yyyy> <service type>/
            <dd-mm-yyyy> Incident - <type>/

The Drive is the achievecafeprovisions@gmail.com account's. A personal
account can't take files from a service account (no storage quota), so the
app acts as that account through an OAuth refresh token, written once by
`manage.py drive_authorize` (FLEET_DRIVE_TOKEN_FILE).

Drive is the source of truth: photos added to a job's folder in the Drive
app show up in Fleet the next time the job is opened, and ones deleted there
disappear. Without a token (dev, tests) photos are stored on local disk like
any other attachment.
"""

import io
import logging
import threading
from datetime import datetime
from pathlib import Path

from django.conf import settings
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
        q = f"'{folder_id}' in parents and trashed = false and mimeType contains 'image/'"
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


def folder_name(job):
    when = f"{job.date:%d-%m-%Y}"
    if hasattr(job, "incident_type"):
        return f"{when} Incident - {job.incident_type}"
    return f"{when} {job.service_type}"


def ensure_folder(client, job):
    """The job's Drive folder, created (or re-created, if someone deleted it
    in Drive) on first use. Stored on the job as drive_folder_id."""
    with _folder_lock:
        job.refresh_from_db(fields=["drive_folder_id"])
        if job.drive_folder_id and client.folder_is_live(job.drive_folder_id):
            return job.drive_folder_id
        van = client.get_or_create_folder(str(job.vehicle), client.root_folder_id())
        folder_id = client.create_folder(folder_name(job), van)
        type(job).objects.filter(pk=job.pk).update(drive_folder_id=folder_id)
        job.drive_folder_id = folder_id
        return folder_id


def sync_job(job):
    """Bring a job's photo list in line with its Drive folder: add photos
    dropped in through Drive, drop ones deleted there. Best-effort."""
    from .models import ISSUE_PHOTO, Attachment

    if not (job.drive_folder_id and enabled()):
        return
    try:
        files = DriveClient().list_images(job.drive_folder_id)
    except Exception:
        logger.exception("Drive sync failed for %s %s", type(job).__name__, job.pk)
        return
    link = {"service": job} if hasattr(job, "service_type") else {"incident": job}
    seen = set()
    for meta in files:
        seen.add(meta["id"])
        Attachment.objects.update_or_create(
            drive_file_id=meta["id"],
            defaults={
                **link,
                "vehicle": job.vehicle,
                "kind": ISSUE_PHOTO,
                "original_name": meta["name"][:255],
                "content_type": meta.get("mimeType", ""),
                "size": int(meta.get("size") or 0),
                "drive_modified_at": parse_time(meta.get("modifiedTime")),
            },
        )
    Attachment.objects.filter(**link, drive_file_id__isnull=False).exclude(drive_file_id__in=seen).delete()


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
    if att.content_type in BROWSER_SAFE_TYPES:
        return client.download(att.drive_file_id), att.content_type
    data = client.thumbnail(att.drive_file_id, 2000)
    if data is None:
        return client.download(att.drive_file_id), att.content_type or "application/octet-stream"
    return data, "image/jpeg"

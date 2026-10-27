"""API for the Phase 2/3 features: drivers, documents, activity log,
budgets and fuel trends."""

import logging
import mimetypes
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Max, Q, Sum
from django.db.models.functions import TruncMonth
from django.http import FileResponse, Http404, HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from . import activity, drive, licence_pdf, services, toll_import
from .models import Fine, FINE_KINDS, StockItem, StockMove, ISSUE_PHOTO, ActivityLog, Attachment, Budget, Driver, DriverFile, FuelLog, Incident, Mechanic, ServiceRecord, TollStatement, Vehicle, fuel_only_q
from .serializers import FineSerializer, StockItemSerializer, StockMoveSerializer, ActivityLogSerializer, AttachmentSerializer, DriverFileSerializer, DriverSerializer, MechanicSerializer

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_UPLOAD_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt"}
LICENCE_FILE_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".doc", ".docx"}


# ── Drivers ────────────────────────────────────────────────────────────────


class DriverViewSet(viewsets.ViewSet):
    def list(self, request):
        return Response(DriverSerializer(Driver.objects.prefetch_related("vehicles", "files"), many=True).data)

    def create(self, request):
        serializer = DriverSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        driver = serializer.save()
        activity.log(request.user, "Added", "Driver", driver.name)
        return Response(DriverSerializer(driver).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        driver = Driver.objects.filter(pk=pk).first()
        if not driver:
            return Response({"detail": "Driver not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = DriverSerializer(driver, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        driver = serializer.save()
        activity.log(request.user, "Changed", "Driver", driver.name)
        return Response(DriverSerializer(driver).data)

    def update(self, request, pk=None):
        return self.partial_update(request, pk)

    def destroy(self, request, pk=None):
        driver = Driver.objects.filter(pk=pk).first()
        if not driver:
            return Response({"detail": "Driver not found."}, status=status.HTTP_404_NOT_FOUND)
        name = driver.name
        # Their licence photos go to Drive's Bin with them (the database rows cascade).
        for f in driver.files.all():
            if not _remove_driver_file(f):
                return Response({"detail": "Couldn't remove their licence photos from Google Drive. Try again in a minute."}, status=status.HTTP_502_BAD_GATEWAY)
        driver.delete()  # their vans just lose the driver (SET_NULL)
        activity.log(request.user, "Deleted", "Driver", name)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _remove_driver_file(f):
    """Bin the stored file (Drive or disk). False if Drive refused."""
    if f.drive_file_id:
        try:
            drive.DriveClient().trash(f.drive_file_id)
        except Exception:
            logger.exception("Drive trash failed for %s", f.drive_file_id)
            return False
    elif f.file:
        f.file.delete(save=False)
    return True


class DriverFileViewSet(viewsets.ViewSet):
    """Licence photos and scans for one driver (?driver=<id>)."""

    def list(self, request):
        drive.move_local_files()  # anything saved on this server's disk earlier goes to Drive now
        qs = DriverFile.objects.filter(driver_id=request.query_params.get("driver") or 0)
        return Response(DriverFileSerializer(qs, many=True).data)

    def create(self, request):
        upload = request.FILES.get("file")
        driver = Driver.objects.filter(pk=request.data.get("driver") or 0).first()
        if not upload or not driver:
            return Response({"detail": "Choose a photo or scan of the licence."}, status=status.HTTP_400_BAD_REQUEST)
        ext = ("." + upload.name.rsplit(".", 1)[-1].lower()) if "." in upload.name else ""
        if ext not in LICENCE_FILE_EXTS:
            return Response({"detail": "Use a photo or a PDF of the licence."}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > MAX_UPLOAD_BYTES:
            return Response({"detail": "That file is over 20 MB. Try a smaller scan or photo."}, status=status.HTTP_400_BAD_REQUEST)
        content_type = upload.content_type or mimetypes.guess_type(upload.name)[0] or ""
        fields = dict(driver=driver, original_name=upload.name[:255], content_type=content_type, size=upload.size, uploaded_by=request.user)
        saved = None
        if drive.enabled():
            try:
                meta, name = drive.upload_driver_file(drive.DriveClient(), driver, upload.name, upload.read(), content_type)
                saved = DriverFile.objects.create(
                    **{**fields, "original_name": name}, drive_file_id=meta["id"], drive_modified_at=drive.parse_time(meta.get("modifiedTime")),
                )
            except Exception:
                # Never lose the photo: keep it on this PC instead.
                logger.exception("Drive upload failed; keeping %s on disk", upload.name)
                upload.seek(0)
        if saved is None:
            saved = DriverFile.objects.create(file=upload, **fields)
        Driver.objects.filter(pk=driver.pk).update(updated_at=timezone.now())  # "Updated" on the Drivers list
        activity.log(request.user, "Added", "Driver", f"Licence photo for {driver.name}")
        return Response(DriverFileSerializer(saved).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="combined")
    def combined(self, request):
        """The licence's front and back together on one A4 page, as a PDF."""
        driver = Driver.objects.filter(pk=request.query_params.get("driver") or 0).first()
        if not driver:
            return Response({"detail": "Driver not found."}, status=status.HTTP_404_NOT_FOUND)
        drive.move_local_files()
        files = list(DriverFile.objects.filter(driver=driver))
        mode = licence_pdf.download_mode(files)
        if not mode:
            return Response({"detail": "Add the licence photos first."}, status=status.HTTP_400_BAD_REQUEST)
        wanted = {"combined": "image", "pdf": "pdf", "word": "word"}[mode]
        chosen = [f for f in files if licence_pdf.kind_of(f) == wanted]

        def read(f):
            if f.drive_file_id:
                return drive.full(f)[0]
            with f.file.open("rb") as fh:
                return fh.read()

        safe = "".join(c for c in driver.name if c.isalnum() or c in " -_") or "driver"
        try:
            if mode == "combined":
                data, ext, content_type = licence_pdf.build(driver.name, [read(f) for f in chosen[:2]]), "pdf", "application/pdf"
            else:  # one PDF scan or Word file: it already holds both sides, so hand it back as it is
                f = chosen[0]
                ext = f.original_name.rsplit(".", 1)[-1].lower() if "." in f.original_name else mode
                data = read(f)
                content_type = "application/pdf" if mode == "pdf" else (mimetypes.guess_type(f.original_name)[0] or "application/octet-stream")
        except Exception:
            logger.exception("Couldn't build the licence download for %s", driver.pk)
            return Response({"detail": "Couldn't prepare that file."}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        response = HttpResponse(data, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{safe} - licence.{ext}"'
        response["Cache-Control"] = "private, no-store"
        return response

    def destroy(self, request, pk=None):
        f = DriverFile.objects.select_related("driver").filter(pk=pk).first()
        if not f:
            return Response({"detail": "File not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _remove_driver_file(f):
            return Response({"detail": "Couldn't remove it from Google Drive. Try again in a minute."}, status=status.HTTP_502_BAD_GATEWAY)
        activity.log(request.user, "Deleted", "Driver", f"Licence photo for {f.driver.name}")
        Driver.objects.filter(pk=f.driver_id).update(updated_at=timezone.now())
        f.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DriverFileView(APIView):
    """Streams a licence photo — only to logged-in users."""

    def get(self, request, pk):
        f = DriverFile.objects.filter(pk=pk).first()
        if not f or not (f.file or f.drive_file_id):
            raise Http404
        if f.drive_file_id:
            thumb = request.query_params.get("thumb") == "1"
            data, content_type = drive.thumbnail(f) if thumb else drive.full(f)
            response = HttpResponse(data, content_type=content_type)
            response["Cache-Control"] = "private, max-age=86400" if thumb else "private, no-store"
            return response
        return FileResponse(f.file.open("rb"), filename=f.original_name, content_type=f.content_type or None)


# ── Mechanics ──────────────────────────────────────────────────────────────


def _mechanics_with_stats():
    return Mechanic.objects.annotate(
        jobs=Count("services", filter=~Q(services__service_type=services.WASH_SERVICE_TYPE)),
        spend=Sum("services__cost"),
        lastJob=Max("services__date"),
    )


class MechanicViewSet(viewsets.ViewSet):
    def list(self, request):
        return Response(MechanicSerializer(_mechanics_with_stats(), many=True).data)

    def create(self, request):
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "Enter the mechanic or workshop name."}, status=status.HTTP_400_BAD_REQUEST)
        existing = Mechanic.objects.filter(name__iexact=name).first()
        if existing:  # typing a name that's already there just picks it
            return Response(MechanicSerializer(_mechanics_with_stats().get(pk=existing.pk)).data)
        serializer = MechanicSerializer(data={**request.data, "name": name})
        serializer.is_valid(raise_exception=True)
        mechanic = serializer.save()
        activity.log(request.user, "Added", "Mechanic", mechanic.name)
        return Response(MechanicSerializer(_mechanics_with_stats().get(pk=mechanic.pk)).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        mechanic = Mechanic.objects.filter(pk=pk).first()
        if not mechanic:
            return Response({"detail": "Mechanic not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = MechanicSerializer(mechanic, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        mechanic = serializer.save()
        activity.log(request.user, "Changed", "Mechanic", mechanic.name)
        return Response(MechanicSerializer(_mechanics_with_stats().get(pk=mechanic.pk)).data)

    def update(self, request, pk=None):
        return self.partial_update(request, pk)

    def destroy(self, request, pk=None):
        mechanic = Mechanic.objects.filter(pk=pk).first()
        if not mechanic:
            return Response({"detail": "Mechanic not found."}, status=status.HTTP_404_NOT_FOUND)
        name = mechanic.name
        mechanic.delete()  # their services keep everything but the name (SET_NULL)
        activity.log(request.user, "Deleted", "Mechanic", name)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Documents ──────────────────────────────────────────────────────────────


class AttachmentViewSet(viewsets.ViewSet):
    def list(self, request):
        drive.move_local_files()  # anything saved on this server's disk earlier goes to Drive now
        # Opening a job's photos pulls in what's changed in its Drive folder.
        for key, model in (("service", ServiceRecord), ("incident", Incident)):
            job = model.objects.select_related("vehicle").filter(pk=request.query_params.get(key) or 0).first()
            if job:
                drive.sync_job(job)
        qs = Attachment.objects.select_related("vehicle", "service", "incident", "uploaded_by")
        for key in ("vehicle", "service", "incident", "fine"):
            if request.query_params.get(key):
                qs = qs.filter(**{f"{key}_id": request.query_params[key]})
        return Response(AttachmentSerializer(qs[:500], many=True).data)

    def create(self, request):
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "Choose a file to upload."}, status=status.HTTP_400_BAD_REQUEST)
        ext = ("." + upload.name.rsplit(".", 1)[-1].lower()) if "." in upload.name else ""
        if ext not in ALLOWED_UPLOAD_EXTS:
            return Response({"detail": "That type of file can't be attached. Use a PDF, photo, Word or Excel file."}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > MAX_UPLOAD_BYTES:
            return Response({"detail": "That file is over 20 MB. Try a smaller scan or photo."}, status=status.HTTP_400_BAD_REQUEST)

        service = ServiceRecord.objects.filter(pk=request.data.get("service") or 0).first()
        incident = Incident.objects.filter(pk=request.data.get("incident") or 0).first()
        fine = Fine.objects.select_related("vehicle").filter(pk=request.data.get("fine") or 0).first()
        vehicle = (
            (service and service.vehicle)
            or (incident and incident.vehicle)
            or (fine and fine.vehicle)
            or Vehicle.objects.filter(pk=request.data.get("vehicle") or 0).first()
        )
        if not vehicle:
            return Response({"detail": "Say which van this file belongs to."}, status=status.HTTP_400_BAD_REQUEST)

        kind = request.data.get("kind") or "Other"
        content_type = upload.content_type or mimetypes.guess_type(upload.name)[0] or ""
        fields = dict(
            original_name=upload.name[:255], content_type=content_type, size=upload.size, kind=kind,
            vehicle=vehicle, service=service, incident=incident, fine=fine, uploaded_by=request.user,
        )
        att = None
        if drive.enabled():
            try:
                meta, name = drive.upload_for(
                    drive.DriveClient(), vehicle=vehicle, job=service or incident, kind=kind,
                    filename=upload.name, content=upload.read(), content_type=content_type, fine=fine,
                )
                att = Attachment.objects.create(
                    **{**fields, "original_name": name}, drive_file_id=meta["id"], drive_modified_at=drive.parse_time(meta.get("modifiedTime")),
                )
            except Exception:
                # Never lose the photo: keep it on this PC instead.
                logger.exception("Drive upload failed; keeping %s on disk", upload.name)
                upload.seek(0)
        if att is None:
            att = Attachment.objects.create(file=upload, **fields)
        where = f" ({AttachmentSerializer(att).data['linkedTo']})" if (service or incident) else ""
        activity.log(request.user, "Added", "Document", f"{att.kind}: {att.original_name} for {vehicle}{where}", vehicle)
        return Response(AttachmentSerializer(att).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        att = Attachment.objects.select_related("vehicle").filter(pk=pk).first()
        if not att:
            return Response({"detail": "File not found."}, status=status.HTTP_404_NOT_FOUND)
        activity.log(request.user, "Deleted", "Document", f"{att.kind}: {att.original_name} for {att.vehicle}", att.vehicle)
        if att.drive_file_id:
            try:
                drive.DriveClient().trash(att.drive_file_id)
            except Exception:
                logger.exception("Drive trash failed for %s", att.drive_file_id)
                return Response({"detail": "Couldn't remove it from Google Drive. Try again in a minute."}, status=status.HTTP_502_BAD_GATEWAY)
        elif att.file:
            att.file.delete(save=False)
        att.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AttachmentFileView(APIView):
    """Streams the stored file — only to logged-in users (files are never
    served straight from disk)."""

    def get(self, request, pk):
        att = Attachment.objects.filter(pk=pk).first()
        if not att or not (att.file or att.drive_file_id):
            raise Http404
        inline = request.query_params.get("download") != "1"
        if att.drive_file_id:
            thumb = request.query_params.get("thumb") == "1"
            data, content_type = drive.thumbnail(att) if thumb else drive.full(att)
            response = HttpResponse(data, content_type=content_type)
            if thumb:
                response["Cache-Control"] = "private, max-age=86400"
            if not inline:
                response["Content-Disposition"] = f'attachment; filename="{att.original_name}"'
            return response
        return FileResponse(att.file.open("rb"), as_attachment=not inline, filename=att.original_name, content_type=att.content_type or None)


# ── Tolls ──────────────────────────────────────────────────────────────────


class TollImportView(APIView):
    """Monthly E-Toll statement (PDF). POST with just `file` returns a
    preview; with `confirm` too it imports (replacing the same statement if
    it was imported before)."""

    def post(self, request):
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "Choose the toll statement PDF to upload."}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > MAX_UPLOAD_BYTES:
            return Response({"detail": "That file is over 20 MB."}, status=status.HTTP_400_BAD_REQUEST)
        raw = upload.read()
        try:
            if not request.data.get("confirm"):
                return Response(toll_import.preview(raw))
            result = toll_import.import_statement(raw, upload.name, request.user)
        except toll_import.ImportFileError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        activity.log(request.user, "Imported", "Tolls", f"Toll statement {upload.name}: {result['trips']} trips, ${result['total']}")
        return Response(result, status=status.HTTP_201_CREATED)


class TollsView(APIView):
    """The Tolls page: the list of statements and one statement's analysis
    (?statement=<id>, else the latest)."""

    def get(self, request):
        drive.move_local_files()
        statements = list(TollStatement.objects.all())
        chosen = next((s for s in statements if str(s.pk) == request.query_params.get("statement")), statements[0] if statements else None)
        return Response({
            "statements": [
                {"id": s.pk, "periodStart": s.period_start, "periodEnd": s.period_end, "total": s.total - s.other_total}
                for s in statements
            ],
            "current": toll_import.analysis(chosen) if chosen else None,
        })


class TollStatementView(APIView):
    def delete(self, request, pk):
        statement = TollStatement.objects.filter(pk=pk).first()
        if not statement:
            return Response({"detail": "Statement not found."}, status=status.HTTP_404_NOT_FOUND)
        activity.log(request.user, "Deleted", "Tolls", f"Toll statement to {statement.period_end:%d-%m-%Y}")
        if statement.drive_file_id:
            try:
                drive.DriveClient().trash(statement.drive_file_id)
            except Exception:
                logger.exception("Drive trash failed for toll statement %s", statement.pk)
                return Response({"detail": "Couldn't remove it from Google Drive. Try again in a minute."}, status=status.HTTP_502_BAD_GATEWAY)
        elif statement.file:
            statement.file.delete(save=False)
        statement.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TollTodoView(APIView):
    """Tick a "To do" item off (or put it back): {key, done}."""

    def post(self, request, pk):
        statement = TollStatement.objects.filter(pk=pk).first()
        if not statement:
            return Response({"detail": "Statement not found."}, status=status.HTTP_404_NOT_FOUND)
        key = str(request.data.get("key") or "")[:200]
        if not key:
            return Response({"detail": "Which item?"}, status=status.HTTP_400_BAD_REQUEST)
        done = [k for k in (statement.done or []) if k != key]
        if request.data.get("done") in (True, "true", "1", 1):
            done.append(key)
        statement.done = done
        statement.save(update_fields=["done"])
        return Response({"done": done})


class TollStatementFileView(APIView):
    def get(self, request, pk):
        statement = TollStatement.objects.filter(pk=pk).first()
        if not statement or not (statement.file or statement.drive_file_id):
            raise Http404
        name = drive.toll_pdf_name(statement)
        if statement.drive_file_id:
            response = HttpResponse(drive.DriveClient().download(statement.drive_file_id), content_type="application/pdf")
            response["Content-Disposition"] = f'inline; filename="{name}"'
            return response
        return FileResponse(statement.file.open("rb"), filename=name, content_type="application/pdf")


# ── Activity ───────────────────────────────────────────────────────────────


class ActivityView(APIView):
    def get(self, request):
        qs = ActivityLog.objects.select_related("vehicle")
        if request.query_params.get("vehicle"):
            qs = qs.filter(vehicle_id=request.query_params["vehicle"])
        if request.query_params.get("who"):
            qs = qs.filter(who_label=request.query_params["who"])
        limit = min(int(request.query_params.get("limit") or 200), 1000)
        return Response(ActivityLogSerializer(qs[:limit], many=True).data)


# ── Budgets ────────────────────────────────────────────────────────────────


def _months_back(n):
    today = timezone.localdate()
    first = today.replace(day=1)
    months = []
    for i in range(n - 1, -1, -1):
        idx = first.year * 12 + first.month - 1 - i
        months.append(date(idx // 12, idx % 12 + 1, 1))
    return months


def _by_month(qs, field, since):
    return {
        r["m"].strftime("%Y-%m"): r["t"] or Decimal("0")
        for r in qs.filter(date__gte=since).annotate(m=TruncMonth("date")).values("m").annotate(t=Sum(field))
    }


class BudgetView(APIView):
    """Monthly budget for the fuel card and for maintenance, against what
    was actually spent in each of the last 12 months."""

    def get(self, request):
        months = _months_back(12)
        since = months[0]
        fuel = _by_month(FuelLog.objects.all(), "cost", since)
        service = _by_month(ServiceRecord.objects.exclude(service_type=services.WASH_SERVICE_TYPE), "cost", since)
        incident = _by_month(Incident.objects.filter(fixed_by_service__isnull=True), "cost", since)
        budgets = {b.category: b.monthly_amount for b in Budget.objects.all()}
        rows = []
        for m in months:
            key = m.strftime("%Y-%m")
            rows.append({
                "month": key,
                "label": m.strftime("%b %Y"),
                "fuel": float(fuel.get(key, 0)),
                "maintenance": float(service.get(key, 0) + incident.get(key, 0)),
            })
        return Response({
            "budgets": {k: float(v) for k, v in budgets.items()},
            "months": rows,
        })

    def put(self, request):
        for category in ("fuel", "maintenance"):
            if category not in request.data:
                continue
            raw = request.data[category]
            if raw in (None, ""):
                Budget.objects.filter(category=category).delete()
                continue
            try:
                amount = Decimal(str(raw))
            except Exception:
                return Response({"detail": f"{category.title()} budget must be a number."}, status=status.HTTP_400_BAD_REQUEST)
            Budget.objects.update_or_create(category=category, defaults={"monthly_amount": amount})
        now_set = ", ".join(f"{b.get_category_display()} ${b.monthly_amount:,.2f}" for b in Budget.objects.all())
        activity.log(request.user, "Changed", "Budget", f"Monthly budgets: {now_set or 'none set'}")
        return self.get(request)


# ── Fuel trends ────────────────────────────────────────────────────────────


class FuelTrendsView(APIView):
    """Month by month: each van's litres, cost and L/100km, the fleet's
    average price per litre, and what each station charges."""

    def get(self, request):
        months = _months_back(int(request.query_params.get("months") or 12))
        since = months[0]
        keys = [m.strftime("%Y-%m") for m in months]
        fills = list(FuelLog.objects.filter(fuel_only_q(), date__gte=since).select_related("vehicle").order_by("date", "id"))
        all_rows = FuelLog.objects.filter(date__gte=since)
        cost_by_van_month = {}
        for r in all_rows.annotate(m=TruncMonth("date")).values("vehicle_id", "m").annotate(t=Sum("cost")):
            cost_by_van_month[(r["vehicle_id"], r["m"].strftime("%Y-%m"))] = float(r["t"] or 0)

        vans = {}
        price = {k: [Decimal("0"), Decimal("0")] for k in keys}  # cost, litres
        stations = {}
        for f in fills:
            key = f.date.strftime("%Y-%m")
            v = vans.setdefault(f.vehicle_id, {"id": f.vehicle_id, "label": str(f.vehicle), "months": {k: [] for k in keys}})
            v["months"][key].append(f)
            price[key][0] += f.cost
            price[key][1] += f.litres
            if f.product:  # imported from a statement: the note starts with the station
                name = (f.notes or "").split(" · ")[0].strip() or "Unknown"
                s = stations.setdefault(name, [Decimal("0"), Decimal("0"), 0])
                s[0] += f.cost
                s[1] += f.litres
                s[2] += 1

        van_rows = []
        for v in vans.values():
            cells = []
            for k in keys:
                month_fills = v["months"][k]
                per100, km = services._litres_per_100km(month_fills) if month_fills else (None, None)
                cells.append({
                    "month": k,
                    "litres": float(sum(f.litres for f in month_fills)),
                    "cost": cost_by_van_month.get((v["id"], k), 0.0),
                    "fills": len(month_fills),
                    "per100": round(per100, 1) if per100 else None,
                    "km": km,
                })
            van_rows.append({"id": v["id"], "label": v["label"], "months": cells})
        van_rows.sort(key=lambda r: r["label"])

        return Response({
            "months": [{"key": k, "label": m.strftime("%b %Y")} for k, m in zip(keys, months)],
            "vans": van_rows,
            "pricePerLitre": [
                {"month": k, "value": round(float(c / l), 3) if l else None} for k, (c, l) in price.items()
            ],
            "stations": sorted(
                (
                    {"station": name, "fills": n, "litres": float(l), "avgPrice": round(float(c / l), 3)}
                    for name, (c, l, n) in stations.items()
                    if l
                ),
                key=lambda r: r["avgPrice"],
            ),
        })


# ── Stock ──────────────────────────────────────────────────────────────────


def _stock_move(request, item, change, note=""):
    """Save the new quantity and a line in the item's history."""
    item.quantity = max(0, item.quantity + change)
    item.save(update_fields=["quantity", "updated_at"])
    who = activity._who(request.user)[1]
    StockMove.objects.create(item=item, change=change, quantity_after=item.quantity, note=note[:200], who_label=who)


def _whole_number(value, default=None, minimum=0, maximum=100000):
    try:
        number = int(str(value).strip())
    except (TypeError, ValueError):
        return default
    return number if minimum <= number <= maximum else default


class StockViewSet(viewsets.ViewSet):
    """Spare parts in stock: add an item, use some, add more."""

    def list(self, request):
        return Response(StockItemSerializer(StockItem.objects.all(), many=True).data)

    def create(self, request):
        name = (request.data.get("name") or "").strip()[:100]
        if not name:
            return Response({"detail": "Type the name of the part, for example Headlight bulb H4 12V."}, status=status.HTTP_400_BAD_REQUEST)
        if StockItem.objects.filter(name__iexact=name).exists():
            return Response({"detail": f"{name} is already in the stock list."}, status=status.HTTP_400_BAD_REQUEST)
        quantity = _whole_number(request.data.get("quantity"), 0)
        order_below = _whole_number(request.data.get("order_below"), 2)
        item = StockItem.objects.create(name=name, quantity=0, order_below=order_below, notes=(request.data.get("notes") or "").strip())
        if quantity:
            _stock_move(request, item, quantity, "Starting stock")
        activity.log(request.user, "Added", "Stock", f"{item.name}: {item.quantity} in stock")
        return Response(StockItemSerializer(item).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        item = StockItem.objects.filter(pk=pk).first()
        if not item:
            return Response({"detail": "That part isn't in the list."}, status=status.HTTP_404_NOT_FOUND)
        if "name" in request.data:
            name = (request.data.get("name") or "").strip()[:100]
            if not name:
                return Response({"detail": "The name can't be empty."}, status=status.HTTP_400_BAD_REQUEST)
            if StockItem.objects.filter(name__iexact=name).exclude(pk=item.pk).exists():
                return Response({"detail": f"{name} is already in the stock list."}, status=status.HTTP_400_BAD_REQUEST)
            item.name = name
        if "order_below" in request.data:
            item.order_below = _whole_number(request.data.get("order_below"), item.order_below)
        if "notes" in request.data:
            item.notes = (request.data.get("notes") or "").strip()
        item.save()
        if "quantity" in request.data:  # a correction after counting the shelf
            wanted = _whole_number(request.data.get("quantity"), None)
            if wanted is None:
                return Response({"detail": "Type the quantity as a whole number."}, status=status.HTTP_400_BAD_REQUEST)
            if wanted != item.quantity:
                _stock_move(request, item, wanted - item.quantity, "Corrected after a count")
        activity.log(request.user, "Changed", "Stock", f"{item.name}: {item.quantity} in stock")
        return Response(StockItemSerializer(item).data)

    def destroy(self, request, pk=None):
        item = StockItem.objects.filter(pk=pk).first()
        if not item:
            return Response({"detail": "That part isn't in the list."}, status=status.HTTP_404_NOT_FOUND)
        activity.log(request.user, "Deleted", "Stock", item.name)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="use")
    def use(self, request, pk=None):
        item = StockItem.objects.filter(pk=pk).first()
        if not item:
            return Response({"detail": "That part isn't in the list."}, status=status.HTTP_404_NOT_FOUND)
        amount = _whole_number(request.data.get("amount"), 1, minimum=1)
        if amount is None or item.quantity == 0:
            return Response({"detail": f"There is none of {item.name} left to use. Order more."}, status=status.HTTP_400_BAD_REQUEST)
        amount = min(amount, item.quantity)
        _stock_move(request, item, -amount, (request.data.get("note") or "")[:200])
        activity.log(request.user, "Changed", "Stock", f"Used {amount} {item.name}; {item.quantity} left")
        return Response(StockItemSerializer(item).data)

    @action(detail=True, methods=["post"], url_path="add")
    def add(self, request, pk=None):
        item = StockItem.objects.filter(pk=pk).first()
        if not item:
            return Response({"detail": "That part isn't in the list."}, status=status.HTTP_404_NOT_FOUND)
        amount = _whole_number(request.data.get("amount"), None, minimum=1)
        if amount is None:
            return Response({"detail": "Type how many were added, as a whole number."}, status=status.HTTP_400_BAD_REQUEST)
        _stock_move(request, item, amount, (request.data.get("note") or "")[:200])
        activity.log(request.user, "Changed", "Stock", f"Added {amount} {item.name}; {item.quantity} in stock")
        return Response(StockItemSerializer(item).data)

    @action(detail=True, methods=["get"], url_path="moves")
    def moves(self, request, pk=None):
        item = StockItem.objects.filter(pk=pk).first()
        if not item:
            return Response({"detail": "That part isn't in the list."}, status=status.HTTP_404_NOT_FOUND)
        return Response(StockMoveSerializer(item.moves.all()[:50], many=True).data)


# ── Fines ──────────────────────────────────────────────────────────────────


def _fine_summary(fine):
    return f"{fine.kind} fine ${fine.amount} for {fine.vehicle} ({fine.date:%d-%m-%Y})"


class FineViewSet(viewsets.ViewSet):
    """Fines and infringement notices, newest first."""

    def list(self, request):
        qs = Fine.objects.select_related("vehicle", "driver").prefetch_related("attachments")
        if request.query_params.get("vehicle"):
            qs = qs.filter(vehicle_id=request.query_params["vehicle"])
        return Response(FineSerializer(qs, many=True).data)

    def create(self, request):
        serializer = FineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fine = serializer.save()
        activity.log(request.user, "Added", "Fine", _fine_summary(fine), fine.vehicle)
        return Response(FineSerializer(fine).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        fine = Fine.objects.filter(pk=pk).first()
        if not fine:
            return Response({"detail": "Fine not found."}, status=status.HTTP_404_NOT_FOUND)
        before = fine.status
        serializer = FineSerializer(fine, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        fine = serializer.save()
        words = {"paid": "marked paid", "to_name": "reopened: driver still to be named", "to_pay": "driver named, still to pay"}
        summary = f"{_fine_summary(fine)} {words[fine.status]}" if fine.status != before else _fine_summary(fine)
        activity.log(request.user, "Changed", "Fine", summary, fine.vehicle)
        return Response(FineSerializer(fine).data)

    def destroy(self, request, pk=None):
        fine = Fine.objects.select_related("vehicle").filter(pk=pk).first()
        if not fine:
            return Response({"detail": "Fine not found."}, status=status.HTTP_404_NOT_FOUND)
        for att in fine.attachments.all():
            if att.drive_file_id:
                try:
                    drive.DriveClient().trash(att.drive_file_id)
                except Exception:
                    logger.exception("Drive trash failed for %s", att.drive_file_id)
                    return Response({"detail": "Couldn't remove the notice from Google Drive. Try again in a minute."}, status=status.HTTP_502_BAD_GATEWAY)
            elif att.file:
                att.file.delete(save=False)
        activity.log(request.user, "Deleted", "Fine", _fine_summary(fine), fine.vehicle)
        fine.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="kinds")
    def kinds(self, request):
        return Response(FINE_KINDS)

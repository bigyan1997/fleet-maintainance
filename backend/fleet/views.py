import re

from django.conf import settings
from django.db.models import Count, Sum
from django.http import FileResponse, Http404, HttpResponse
from django.utils.dateparse import parse_date
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

import json

from . import activity, drive, fuel_import, services
from .models import FuelLog, FuelStatementFile, Incident, ServiceRecord, Vehicle
from .pagination import FleetPagination
from .serializers import (
    FuelLogSerializer,
    IncidentSerializer,
    ServiceRecordSerializer,
    VehicleSerializer,
)


class VehicleViewSet(viewsets.ViewSet):
    def list(self, request):
        rows = services.list_vehicles(search=request.query_params.get("search", ""))
        return Response(
            VehicleSerializer(rows, many=True, context={"last_washed": services.last_washed_by_vehicle()}).data
        )

    def retrieve(self, request, pk=None):
        try:
            vehicle = services.get_vehicle(pk)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        return Response(VehicleSerializer(vehicle).data)

    def create(self, request):
        serializer = VehicleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vehicle = serializer.save()
        if vehicle.odometer:
            services.record_typed_km(vehicle)
        activity.log(request.user, "Added", "Van", f"{vehicle} ({vehicle.rego or 'no rego'})", vehicle)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None, partial=False):
        try:
            vehicle = services.get_vehicle(pk)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        km_before = vehicle.odometer
        serializer = VehicleSerializer(vehicle, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        vehicle = serializer.save()
        if vehicle.odometer != km_before:
            services.record_typed_km(vehicle)
        changed = ", ".join(k.replace("_", " ") for k in request.data.keys()) if partial else "details"
        activity.log(request.user, "Changed", "Van", f"{vehicle}: {changed}", vehicle)
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        # Truly partial, so the Tyres and Drivers screens can send one field.
        return self.update(request, pk=pk, partial=True)

    def destroy(self, request, pk=None):
        label = str(Vehicle.objects.filter(pk=pk).first() or f"Vehicle {pk}")
        try:
            services.delete_vehicle(pk)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except services.HasRelatedRecordsError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        activity.log(request.user, "Deleted", "Van", label)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _paginated(request, rows, serializer_class):
    # Plain ViewSets ignore DEFAULT_PAGINATION_CLASS, but the History /
    # Incidents / Fuel pages (and Export) read {count, results}.
    paginator = FleetPagination()
    page = paginator.paginate_queryset(rows, request)
    return paginator.get_paginated_response(serializer_class(page, many=True).data)


def _filtered_list(request, list_fn, extra_filters=None):
    filters = {
        "vehicle": request.query_params.get("vehicle") or None,
        "date_from": request.query_params.get("date_from") or None,
        "date_to": request.query_params.get("date_to") or None,
        "search": request.query_params.get("search", ""),
    }
    if extra_filters:
        filters.update(extra_filters(request))
    return list_fn(**filters)


class ServiceRecordViewSet(viewsets.ViewSet):
    def list(self, request):
        rows = _filtered_list(
            request,
            services.list_services,
            lambda r: {
                "service_type": r.query_params.get("service_type", ""),
                "status": r.query_params.get("status", ""),
                "mechanic": r.query_params.get("mechanic") or None,
            },
        )
        return _paginated(request, rows, ServiceRecordSerializer)

    def create(self, request):
        serializer = ServiceRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = services.create_service(serializer.validated_data)
        activity.log(request.user, "Added", activity.service_kind(record), activity.describe_service(record), record.vehicle)
        return Response(ServiceRecordSerializer(record).data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None, partial=False):
        serializer = ServiceRecordSerializer(data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        try:
            record = services.update_service(pk, serializer.validated_data)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        summary = (
            f"{record.service_type} for {record.vehicle} moved to {activity.status_word(record.status)}"
            if partial and set(request.data.keys()) == {"status"}
            else activity.describe_service(record)
        )
        activity.log(request.user, "Changed", activity.service_kind(record), summary, record.vehicle)
        return Response(ServiceRecordSerializer(record).data)

    def partial_update(self, request, pk=None):
        # Truly partial (unlike the other viewsets) so the dashboard's status
        # dropdown can send just {"status": ...}.
        return self.update(request, pk=pk, partial=True)

    def destroy(self, request, pk=None):
        record = ServiceRecord.objects.select_related("vehicle").filter(pk=pk).first()
        try:
            services.delete_service(pk)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        activity.log(request.user, "Deleted", activity.service_kind(record), activity.describe_service(record), record.vehicle)
        return Response(status=status.HTTP_204_NO_CONTENT)


class IncidentViewSet(viewsets.ViewSet):
    def list(self, request):
        rows = _filtered_list(
            request,
            services.list_incidents,
            lambda r: {
                "incident_type": r.query_params.get("incident_type", ""),
                "status": r.query_params.get("status", ""),
            },
        )
        return _paginated(request, rows, IncidentSerializer)

    def create(self, request):
        serializer = IncidentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        incident = serializer.save()
        activity.log(request.user, "Added", "Incident", activity.describe_incident(incident), incident.vehicle)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        try:
            incident = services.get_incident(pk)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        serializer = IncidentSerializer(incident, data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        incident = serializer.save()
        activity.log(request.user, "Changed", "Incident", activity.describe_incident(incident), incident.vehicle)
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        return self.update(request, pk=pk)

    def destroy(self, request, pk=None):
        record = Incident.objects.select_related("vehicle").filter(pk=pk).first()
        try:
            services.delete_incident(pk)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        activity.log(request.user, "Deleted", "Incident", activity.describe_incident(record), record.vehicle)
        return Response(status=status.HTTP_204_NO_CONTENT)


class FuelLogViewSet(viewsets.ViewSet):
    def list(self, request):
        rows = _filtered_list(request, services.list_fuel_logs, lambda r: {"statement": parse_date(r.query_params.get("statement") or "")})
        return _paginated(request, rows, FuelLogSerializer)

    def create(self, request):
        serializer = FuelLogSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = services.create_fuel_log(serializer.validated_data)
        activity.log(request.user, "Added", "Fuel", activity.describe_fuel(record), record.vehicle)
        return Response(FuelLogSerializer(record).data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        serializer = FuelLogSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            record = services.update_fuel_log(pk, serializer.validated_data)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        activity.log(request.user, "Changed", "Fuel", activity.describe_fuel(record), record.vehicle)
        return Response(FuelLogSerializer(record).data)

    def partial_update(self, request, pk=None):
        return self.update(request, pk=pk)

    def destroy(self, request, pk=None):
        record = FuelLog.objects.select_related("vehicle").filter(pk=pk).first()
        if record:
            activity.log(request.user, "Deleted", "Fuel", activity.describe_fuel(record), record.vehicle)
        try:
            services.delete_fuel_log(pk)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


MAX_STATEMENT_PDF_BYTES = 20 * 1024 * 1024


def _statement_pdf(upload):
    """The uploaded statement PDF's bytes, or a message saying what's wrong with it."""
    if upload.size > MAX_STATEMENT_PDF_BYTES:
        return None, "That PDF is over 20 MB."
    raw = upload.read()
    if not raw.startswith(b"%PDF"):
        return None, "That isn't a PDF. Choose the statement PDF, or leave it out."
    return raw, ""


class FuelImportView(APIView):
    """Monthly fuel statement upload. POST with just `file` returns a
    preview; with `assignments` too (JSON: card number -> vehicle id) it
    imports, and keeps the file (and the statement's `pdf`, if sent) in Drive."""

    def post(self, request):
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "Choose the statement file to upload."}, status=status.HTTP_400_BAD_REQUEST)
        raw = upload.read()
        pdf = None
        if request.FILES.get("pdf"):
            pdf, problem = _statement_pdf(request.FILES["pdf"])
            if problem:
                return Response({"detail": problem}, status=status.HTTP_400_BAD_REQUEST)
        try:
            if "assignments" in request.data:
                assignments = json.loads(request.data["assignments"])
                result = fuel_import.import_statement(raw, assignments)
                statement_date = parse_date(result["statementDate"] or "")
                if statement_date:
                    fuel_import.keep_file(statement_date, "txt", raw)
                    if pdf:
                        fuel_import.keep_file(statement_date, "pdf", pdf)
                activity.log(
                    request.user, "Imported", "Fuel",
                    f"Fuel statement {upload.name}: {result['created']} fill-ups and {result['charges']} fees/charges added"
                    + (f", {result['duplicates']} already logged" if result["duplicates"] else ""),
                )
                return Response(result, status=status.HTTP_201_CREATED)
            return Response(fuel_import.preview(raw))
        except fuel_import.ImportFileError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class FuelStatementsView(APIView):
    """The fuel statements imported so far, newest first, with what each one totals."""

    def get(self, request):
        rows = (
            FuelLog.objects.filter(statement__isnull=False)
            .values("statement")
            .annotate(lines=Count("id"), total=Sum("cost"))
            .order_by("-statement")
        )
        drive.move_local_files()  # a file kept on this server's disk earlier goes to Drive now
        pdfs = set(FuelStatementFile.objects.filter(kind="pdf").values_list("statement", flat=True))
        return Response([
            {"date": r["statement"], "lines": r["lines"], "total": r["total"],
             "pdfUrl": f"/api/fuel-statements/{r['statement']}/pdf/" if r["statement"] in pdfs else ""}
            for r in rows
        ])


class FuelStatementPdfView(APIView):
    """A fuel statement's PDF: GET opens it (logged-in users only), POST adds
    or replaces it for a statement that is already imported."""

    def get(self, request, day):
        f = FuelStatementFile.objects.filter(statement=parse_date(day), kind="pdf").first()
        if not f or not (f.file or f.drive_file_id):
            raise Http404
        name = drive.fuel_file_name(f)
        if f.drive_file_id:
            response = HttpResponse(drive.DriveClient().download(f.drive_file_id), content_type="application/pdf")
            response["Content-Disposition"] = f'inline; filename="{name}"'
            return response
        return FileResponse(f.file.open("rb"), filename=name, content_type="application/pdf")

    def post(self, request, day):
        statement_date = parse_date(day)
        if not statement_date or not FuelLog.objects.filter(statement=statement_date).exists():
            raise Http404
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "Choose the statement PDF."}, status=status.HTTP_400_BAD_REQUEST)
        raw, problem = _statement_pdf(upload)
        if problem:
            return Response({"detail": problem}, status=status.HTTP_400_BAD_REQUEST)
        fuel_import.keep_file(statement_date, "pdf", raw)
        activity.log(request.user, "Added", "Fuel", f"PDF for the fuel statement to {statement_date:%d-%m-%Y}")
        return Response({"pdfUrl": f"/api/fuel-statements/{statement_date}/pdf/"}, status=status.HTTP_201_CREATED)


class DashboardView(APIView):
    def get(self, request):
        summary = services.dashboard_summary()
        return Response(
            {
                "monthServices": summary["month_services"],
                "monthFuel": summary["month_fuel"],
                "monthTolls": summary["month_tolls"],
                "vehicleCount": summary["vehicle_count"],
                "serviceCount": summary["service_count"],
                "dueCount": summary["due_count"],
                "openIncidentCount": summary["open_incident_count"],
                "totalSpend": summary["total_spend"],
                "recentServices": ServiceRecordSerializer(summary["recent_services"], many=True).data,
                "statusCounts": summary["status_counts"],
                "inProgressServices": ServiceRecordSerializer(summary["in_progress_services"], many=True).data,
            }
        )


class WashesView(APIView):
    def get(self, request):
        return Response(
            {
                "cycleDays": services.WASH_CYCLE_DAYS,
                "vans": services.wash_summary(),
                "recent": services.recent_washes(),
            }
        )


class AlertsView(APIView):
    def get(self, request):
        return Response(services.alerts())


class AnalyticsView(APIView):
    def get(self, request):
        result = services.analytics(
            vehicle=request.query_params.get("vehicle") or None,
            date_from=parse_date(request.query_params.get("date_from") or ""),
            date_to=parse_date(request.query_params.get("date_to") or ""),
        )
        return Response(result)


class QuickLinksView(APIView):
    """Header shortcuts: the Google Sheet mirror and the Drive folder that
    holds the photos, documents, toll PDFs and backups."""

    def get(self, request):
        sheet = (
            f"https://docs.google.com/spreadsheets/d/{settings.FLEET_SHEET_ID}/edit"
            if settings.FLEET_SHEET_ID
            else None
        )
        return Response({"sheet": sheet, "drive": drive.enabled(), "driveFolder": drive.root_folder_url() or None})


class AppVersionView(APIView):
    """Identifies the frontend build currently being served, so open pages
    can notice a new version and offer to reload."""

    def get(self, request):
        index = settings.FRONTEND_DIST / "index.html"
        try:
            match = re.search(r"assets/(index-[^\"]+\.js)", index.read_text(encoding="utf-8"))
        except OSError:
            match = None
        return Response({"version": match.group(1) if match else None})

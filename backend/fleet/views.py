import re

from django.conf import settings
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
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
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        try:
            vehicle = services.get_vehicle(pk)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        serializer = VehicleSerializer(vehicle, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        return self.update(request, pk=pk)

    def destroy(self, request, pk=None):
        try:
            services.delete_vehicle(pk)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except services.HasRelatedRecordsError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
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
            },
        )
        return _paginated(request, rows, ServiceRecordSerializer)

    def create(self, request):
        serializer = ServiceRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = services.create_service(serializer.validated_data)
        return Response(ServiceRecordSerializer(record).data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None, partial=False):
        serializer = ServiceRecordSerializer(data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        try:
            record = services.update_service(pk, serializer.validated_data)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        return Response(ServiceRecordSerializer(record).data)

    def partial_update(self, request, pk=None):
        # Truly partial (unlike the other viewsets) so the dashboard's status
        # dropdown can send just {"status": ...}.
        return self.update(request, pk=pk, partial=True)

    def destroy(self, request, pk=None):
        try:
            services.delete_service(pk)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
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
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        try:
            incident = services.get_incident(pk)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        serializer = IncidentSerializer(incident, data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        return self.update(request, pk=pk)

    def destroy(self, request, pk=None):
        try:
            services.delete_incident(pk)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class FuelLogViewSet(viewsets.ViewSet):
    def list(self, request):
        rows = _filtered_list(request, services.list_fuel_logs)
        return _paginated(request, rows, FuelLogSerializer)

    def create(self, request):
        serializer = FuelLogSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = services.create_fuel_log(serializer.validated_data)
        return Response(FuelLogSerializer(record).data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        serializer = FuelLogSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            record = services.update_fuel_log(pk, serializer.validated_data)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        return Response(FuelLogSerializer(record).data)

    def partial_update(self, request, pk=None):
        return self.update(request, pk=pk)

    def destroy(self, request, pk=None):
        try:
            services.delete_fuel_log(pk)
        except services.NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DashboardView(APIView):
    def get(self, request):
        summary = services.dashboard_summary()
        return Response(
            {
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
            date_from=request.query_params.get("date_from") or None,
            date_to=request.query_params.get("date_to") or None,
        )
        return Response(result)


class QuickLinksView(APIView):
    """Header shortcut: the Google Sheet mirror (no Drive/photos link — this
    app has no image uploads)."""

    def get(self, request):
        sheet = (
            f"https://docs.google.com/spreadsheets/d/{settings.FLEET_SHEET_ID}/edit"
            if settings.FLEET_SHEET_ID
            else None
        )
        return Response({"sheet": sheet})


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

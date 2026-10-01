"""API for the Phase 2/3 features: drivers, documents, activity log,
budgets, fuel trends and the weekly summary."""

import mimetypes
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Max, Q, Sum
from django.db.models.functions import TruncMonth
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from . import activity, services
from .models import ActivityLog, Attachment, Budget, Driver, FuelLog, Incident, Mechanic, ServiceRecord, Vehicle, fuel_only_q
from .serializers import ActivityLogSerializer, AttachmentSerializer, DriverSerializer, MechanicSerializer

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_UPLOAD_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt"}


# ── Drivers ────────────────────────────────────────────────────────────────


class DriverViewSet(viewsets.ViewSet):
    def list(self, request):
        return Response(DriverSerializer(Driver.objects.prefetch_related("vehicles"), many=True).data)

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
        driver.delete()  # their vans just lose the driver (SET_NULL)
        activity.log(request.user, "Deleted", "Driver", name)
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        qs = Attachment.objects.select_related("vehicle", "service", "incident", "uploaded_by")
        for key in ("vehicle", "service", "incident"):
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
        vehicle = (
            (service and service.vehicle)
            or (incident and incident.vehicle)
            or Vehicle.objects.filter(pk=request.data.get("vehicle") or 0).first()
        )
        if not vehicle:
            return Response({"detail": "Say which van this file belongs to."}, status=status.HTTP_400_BAD_REQUEST)

        att = Attachment.objects.create(
            file=upload,
            original_name=upload.name[:255],
            content_type=upload.content_type or mimetypes.guess_type(upload.name)[0] or "",
            size=upload.size,
            kind=request.data.get("kind") or "Other",
            vehicle=vehicle,
            service=service,
            incident=incident,
            uploaded_by=request.user,
        )
        where = f" ({AttachmentSerializer(att).data['linkedTo']})" if (service or incident) else ""
        activity.log(request.user, "Added", "Document", f"{att.kind}: {att.original_name} for {vehicle}{where}", vehicle)
        return Response(AttachmentSerializer(att).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        att = Attachment.objects.select_related("vehicle").filter(pk=pk).first()
        if not att:
            return Response({"detail": "File not found."}, status=status.HTTP_404_NOT_FOUND)
        activity.log(request.user, "Deleted", "Document", f"{att.kind}: {att.original_name} for {att.vehicle}", att.vehicle)
        att.file.delete(save=False)
        att.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AttachmentFileView(APIView):
    """Streams the stored file — only to logged-in users (files are never
    served straight from disk)."""

    def get(self, request, pk):
        att = Attachment.objects.filter(pk=pk).first()
        if not att or not att.file:
            raise Http404
        inline = request.query_params.get("download") != "1"
        return FileResponse(att.file.open("rb"), as_attachment=not inline, filename=att.original_name, content_type=att.content_type or None)


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
        incident = _by_month(Incident.objects.all(), "cost", since)
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


# ── Weekly summary ─────────────────────────────────────────────────────────


class WeeklySummaryView(APIView):
    def get(self, request):
        from . import weekly

        return Response(weekly.build_summary())

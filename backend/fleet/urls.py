from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AlertsView,
    AnalyticsView,
    AppVersionView,
    DashboardView,
    FuelLogViewSet,
    IncidentViewSet,
    QuickLinksView,
    ServiceRecordViewSet,
    VehicleViewSet,
    WashesView,
)

router = DefaultRouter()
router.register("vehicles", VehicleViewSet, basename="vehicle")
router.register("services", ServiceRecordViewSet, basename="service")
router.register("incidents", IncidentViewSet, basename="incident")
router.register("fuel-logs", FuelLogViewSet, basename="fuel-log")

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("alerts/", AlertsView.as_view(), name="alerts"),
    path("washes/", WashesView.as_view(), name="washes"),
    path("analytics/", AnalyticsView.as_view(), name="analytics"),
    path("links/", QuickLinksView.as_view(), name="links"),
    path("version/", AppVersionView.as_view(), name="version"),
    *router.urls,
]

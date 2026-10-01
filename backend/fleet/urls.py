from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AlertsView,
    AnalyticsView,
    AppVersionView,
    DashboardView,
    FuelImportView,
    FuelLogViewSet,
    IncidentViewSet,
    QuickLinksView,
    ServiceRecordViewSet,
    VehicleViewSet,
    WashesView,
)

from .views_extra import (
    ActivityView,
    AttachmentFileView,
    AttachmentViewSet,
    BudgetView,
    DriverViewSet,
    MechanicViewSet,
    FuelTrendsView,
)

router = DefaultRouter()
router.register("vehicles", VehicleViewSet, basename="vehicle")
router.register("services", ServiceRecordViewSet, basename="service")
router.register("incidents", IncidentViewSet, basename="incident")
router.register("fuel-logs", FuelLogViewSet, basename="fuel-log")
router.register("drivers", DriverViewSet, basename="driver")
router.register("mechanics", MechanicViewSet, basename="mechanic")
router.register("attachments", AttachmentViewSet, basename="attachment")

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("alerts/", AlertsView.as_view(), name="alerts"),
    path("attachments/<int:pk>/file/", AttachmentFileView.as_view(), name="attachment-file"),
    path("activity/", ActivityView.as_view(), name="activity"),
    path("budget/", BudgetView.as_view(), name="budget"),
    path("fuel-trends/", FuelTrendsView.as_view(), name="fuel-trends"),
    path("fuel-import/", FuelImportView.as_view(), name="fuel-import"),
    path("washes/", WashesView.as_view(), name="washes"),
    path("analytics/", AnalyticsView.as_view(), name="analytics"),
    path("links/", QuickLinksView.as_view(), name="links"),
    path("version/", AppVersionView.as_view(), name="version"),
    *router.urls,
]

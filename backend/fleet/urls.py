from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AlertsView,
    AnalyticsView,
    AppVersionView,
    DashboardView,
    FuelImportView,
    FuelStatementPdfView,
    FuelStatementsView,
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
    TollImportView,
    TollStatementFileView,
    TollStatementView,
    TollTodoView,
    TollsView,
    BudgetView,
    DriverFileView,
    DriverFileViewSet,
    DriverViewSet,
    MechanicViewSet,
    StockViewSet,
    FuelTrendsView,
)

router = DefaultRouter()
router.register("vehicles", VehicleViewSet, basename="vehicle")
router.register("services", ServiceRecordViewSet, basename="service")
router.register("incidents", IncidentViewSet, basename="incident")
router.register("fuel-logs", FuelLogViewSet, basename="fuel-log")
router.register("drivers", DriverViewSet, basename="driver")
router.register("driver-files", DriverFileViewSet, basename="driver-file")
router.register("mechanics", MechanicViewSet, basename="mechanic")
router.register("stock", StockViewSet, basename="stock")
router.register("attachments", AttachmentViewSet, basename="attachment")

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("alerts/", AlertsView.as_view(), name="alerts"),
    path("attachments/<int:pk>/file/", AttachmentFileView.as_view(), name="attachment-file"),
    path("driver-files/<int:pk>/file/", DriverFileView.as_view(), name="driver-file-file"),
    path("tolls/", TollsView.as_view(), name="tolls"),
    path("tolls/<int:pk>/", TollStatementView.as_view(), name="toll-statement"),
    path("tolls/<int:pk>/done/", TollTodoView.as_view(), name="toll-todo"),
    path("tolls/<int:pk>/file/", TollStatementFileView.as_view(), name="toll-statement-file"),
    path("toll-import/", TollImportView.as_view(), name="toll-import"),
    path("activity/", ActivityView.as_view(), name="activity"),
    path("budget/", BudgetView.as_view(), name="budget"),
    path("fuel-trends/", FuelTrendsView.as_view(), name="fuel-trends"),
    path("fuel-import/", FuelImportView.as_view(), name="fuel-import"),
    path("fuel-statements/", FuelStatementsView.as_view(), name="fuel-statements"),
    path("fuel-statements/<str:day>/pdf/", FuelStatementPdfView.as_view(), name="fuel-statement-pdf"),
    path("washes/", WashesView.as_view(), name="washes"),
    path("analytics/", AnalyticsView.as_view(), name="analytics"),
    path("links/", QuickLinksView.as_view(), name="links"),
    path("version/", AppVersionView.as_view(), name="version"),
    *router.urls,
]

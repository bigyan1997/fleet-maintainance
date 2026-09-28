from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, HttpResponseNotFound
from django.urls import include, path, re_path


def serve_frontend_index(request, *args, **kwargs):
    index_path = settings.FRONTEND_DIST / "index.html"
    if not index_path.exists():
        return HttpResponseNotFound("Frontend build not found. Run `npm run build` in frontend/.")
    return FileResponse(open(index_path, "rb"))


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("fleet.urls")),
    re_path(r"^(?!api(/|$)|admin(/|$)|static(/|$)).*$", serve_frontend_index),
]

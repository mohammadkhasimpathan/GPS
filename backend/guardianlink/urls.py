"""GuardianLink URL Configuration"""

from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse


def health(request):
    """Public health check endpoint for Render."""
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/", include("authentication.urls")),
    path("api/", include("tracking.urls")),
]

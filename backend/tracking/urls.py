"""Tracking URL patterns"""

from django.urls import path
from .views import (
    PersonListCreateView,
    PersonDetailView,
    RegenerateTokenView,
    LocationCreateView,
    LocationLatestView,
    LocationHistoryView,
    ShareStartView,
    ShareStopView,
    ExportView,
)

urlpatterns = [
    # Persons (JWT-protected)
    path("persons/", PersonListCreateView.as_view(), name="person-list-create"),
    path("persons/<int:pk>/", PersonDetailView.as_view(), name="person-detail"),
    path("persons/<int:pk>/regenerate/", RegenerateTokenView.as_view(), name="person-regenerate"),

    # Location — public (token-authenticated)
    path("location/<uuid:token>/", LocationCreateView.as_view(), name="location-create"),
    path("share/start/<uuid:token>/", ShareStartView.as_view(), name="share-start"),
    path("share/stop/<uuid:token>/", ShareStopView.as_view(), name="share-stop"),

    # Location — admin (JWT-protected)
    path("location/latest/<uuid:token>/", LocationLatestView.as_view(), name="location-latest"),
    path("location/history/<uuid:token>/", LocationHistoryView.as_view(), name="location-history"),

    # Export (JWT-protected)
    path("export/<uuid:token>/", ExportView.as_view(), name="export"),
]

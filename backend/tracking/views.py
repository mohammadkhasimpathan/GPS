"""
Tracking API views — all endpoints require JWT auth except location POST
(which uses the public tracking token in the URL as authentication).

Multi-tenant isolation: every queryset is filtered by request.user so admins
only ever see their own data.
"""

import csv
import json
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny

from .models import Person, Location
from .serializers import (
    PersonSerializer,
    PersonCreateSerializer,
    LocationSerializer,
    LocationCreateSerializer,
)


# ─────────────────────────────────────────────
# Persons
# ─────────────────────────────────────────────

class PersonListCreateView(APIView):
    """
    GET  /api/persons/  — list all persons belonging to the logged-in admin
    POST /api/persons/  — create a new person for the logged-in admin
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        persons = Person.objects.filter(owner=request.user).prefetch_related("locations")
        serializer = PersonSerializer(persons, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request):
        serializer = PersonCreateSerializer(data=request.data)
        if serializer.is_valid():
            person = serializer.save(owner=request.user)
            return Response(
                PersonSerializer(person, context={"request": request}).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PersonDetailView(APIView):
    """
    GET    /api/persons/{id}/  — get one person (must belong to request.user)
    DELETE /api/persons/{id}/  — delete a person and all their locations
    PATCH  /api/persons/{id}/  — update name or enabled status
    """

    permission_classes = [IsAuthenticated]

    def _get_person(self, pk, user):
        return get_object_or_404(Person, pk=pk, owner=user)

    def get(self, request, pk):
        person = self._get_person(pk, request.user)
        return Response(PersonSerializer(person, context={"request": request}).data)

    def patch(self, request, pk):
        person = self._get_person(pk, request.user)
        name = request.data.get("name")
        enabled = request.data.get("enabled")
        if name is not None:
            person.name = name
        if enabled is not None:
            person.enabled = enabled
        person.save()
        return Response(PersonSerializer(person, context={"request": request}).data)

    def delete(self, request, pk):
        person = self._get_person(pk, request.user)
        person.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegenerateTokenView(APIView):
    """POST /api/persons/{id}/regenerate/ — generate a new tracking token"""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        person = get_object_or_404(Person, pk=pk, owner=request.user)
        person.regenerate_token()
        return Response(PersonSerializer(person, context={"request": request}).data)


# ─────────────────────────────────────────────
# Location — Public (token-authenticated)
# ─────────────────────────────────────────────

class LocationCreateView(APIView):
    """
    POST /api/location/{token}/
    Public endpoint — the share page posts GPS pings here.
    The tracking_token in the URL acts as the credential.
    """

    permission_classes = [AllowAny]

    def post(self, request, token):
        person = get_object_or_404(Person, tracking_token=token, enabled=True)

        serializer = LocationCreateSerializer(data=request.data)
        if serializer.is_valid():
            location = serializer.save(person=person)

            # Broadcast to dashboard via WebSocket channel group
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync

            channel_layer = get_channel_layer()
            location_data = LocationSerializer(location).data
            async_to_sync(channel_layer.group_send)(
                f"location_{token}",
                {
                    "type": "location.update",
                    "data": {
                        **location_data,
                        "timestamp": location.timestamp.isoformat(),
                        "person_id": person.id,
                        "person_name": person.name,
                    },
                },
            )
            return Response(location_data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────
# Location — Admin (JWT-authenticated)
# ─────────────────────────────────────────────

class LocationLatestView(APIView):
    """GET /api/location/latest/{token}/ — get latest location for a person"""

    permission_classes = [IsAuthenticated]

    def get(self, request, token):
        person = get_object_or_404(Person, tracking_token=token, owner=request.user)
        location = person.locations.first()
        if not location:
            return Response({"detail": "No location data yet."}, status=status.HTTP_404_NOT_FOUND)
        return Response(LocationSerializer(location).data)


class LocationHistoryView(APIView):
    """GET /api/location/history/{token}/?limit=100 — paginated location history"""

    permission_classes = [IsAuthenticated]

    def get(self, request, token):
        person = get_object_or_404(Person, tracking_token=token, owner=request.user)
        limit = min(int(request.query_params.get("limit", 200)), 1000)
        locations = person.locations.all()[:limit]
        return Response(LocationSerializer(locations, many=True).data)


# ─────────────────────────────────────────────
# Share Session Status
# ─────────────────────────────────────────────

class ShareStartView(APIView):
    """POST /api/share/start/{token}/ — mark a sharing session as started (public)"""

    permission_classes = [AllowAny]

    def post(self, request, token):
        person = get_object_or_404(Person, tracking_token=token, enabled=True)
        # Broadcast 'online' presence to dashboard
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"location_{token}",
            {"type": "presence.update", "data": {"status": "online", "person_id": person.id}},
        )
        return Response({"status": "started"})


class ShareStopView(APIView):
    """POST /api/share/stop/{token}/ — mark a sharing session as stopped (public)"""

    permission_classes = [AllowAny]

    def post(self, request, token):
        person = get_object_or_404(Person, tracking_token=token)
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"location_{token}",
            {"type": "presence.update", "data": {"status": "offline", "person_id": person.id}},
        )
        return Response({"status": "stopped"})


# ─────────────────────────────────────────────
# Export
# ─────────────────────────────────────────────

class ExportView(APIView):
    """
    GET /api/export/{token}/?format=json|csv
    Export the full location history for one person.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, token):
        person = get_object_or_404(Person, tracking_token=token, owner=request.user)
        locations = person.locations.all()
        export_format = request.query_params.get("format", "json").lower()

        if export_format == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = (
                f'attachment; filename="guardianlink_{person.name}_{person.id}.csv"'
            )
            writer = csv.writer(response)
            writer.writerow([
                "timestamp", "latitude", "longitude", "accuracy", "speed",
                "heading", "altitude", "battery", "connection",
            ])
            for loc in locations:
                writer.writerow([
                    loc.timestamp.isoformat(), loc.latitude, loc.longitude,
                    loc.accuracy, loc.speed, loc.heading, loc.altitude,
                    loc.battery, loc.connection,
                ])
            return response

        # Default: JSON
        data = {
            "person": person.name,
            "exported_at": __import__("django.utils.timezone", fromlist=["now"]).now().isoformat()
            if False else str(__import__("datetime").datetime.utcnow()),
            "locations": LocationSerializer(locations, many=True).data,
        }
        response = HttpResponse(
            json.dumps(data, indent=2, default=str),
            content_type="application/json",
        )
        response["Content-Disposition"] = (
            f'attachment; filename="guardianlink_{person.name}_{person.id}.json"'
        )
        return response

"""Tracking serializers"""

from rest_framework import serializers
from .models import Person, Location


class PersonSerializer(serializers.ModelSerializer):
    tracking_url = serializers.SerializerMethodField()
    last_seen = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()

    class Meta:
        model = Person
        fields = [
            "id",
            "name",
            "tracking_token",
            "tracking_url",
            "enabled",
            "created_at",
            "last_seen",
            "is_online",
        ]
        read_only_fields = ["id", "tracking_token", "created_at", "tracking_url", "last_seen", "is_online"]

    def get_tracking_url(self, obj):
        request = self.context.get("request")
        frontend_url = ""
        if request:
            # Build absolute URL using frontend origin stored in settings
            from django.conf import settings
            frontend_url = getattr(settings, "FRONTEND_URL", "")
        return f"{frontend_url}/share/{obj.tracking_token}"

    def get_last_seen(self, obj):
        last = obj.locations.first()
        return last.timestamp.isoformat() if last else None

    def get_is_online(self, obj):
        """
        A person is considered 'online' if their last ping was within 30 seconds.
        The WebSocket consumer also broadcasts presence, but this provides a REST fallback.
        """
        from django.utils import timezone
        from datetime import timedelta
        last = obj.locations.first()
        if not last:
            return False
        return (timezone.now() - last.timestamp) < timedelta(seconds=30)


class PersonCreateSerializer(serializers.ModelSerializer):
    """Used when creating a person — only accepts 'name'."""

    class Meta:
        model = Person
        fields = ["name"]


class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = [
            "id",
            "latitude",
            "longitude",
            "accuracy",
            "speed",
            "heading",
            "altitude",
            "battery",
            "connection",
            "browser",
            "operating_system",
            "device_type",
            "timezone",
            "language",
            "timestamp",
        ]
        read_only_fields = ["id", "timestamp"]


class LocationCreateSerializer(serializers.ModelSerializer):
    """Used by the share page to POST a new location ping (token in URL, no auth)."""

    class Meta:
        model = Location
        fields = [
            "latitude",
            "longitude",
            "accuracy",
            "speed",
            "heading",
            "altitude",
            "battery",
            "connection",
            "browser",
            "operating_system",
            "device_type",
            "timezone",
            "language",
        ]

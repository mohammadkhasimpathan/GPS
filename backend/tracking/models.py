"""
Tracking models:
  - Person:   A family member tracked by one admin (owner). Has a unique secure token.
  - Location: Each GPS ping sent by the sharer. Linked to a Person.
"""

import uuid
from django.db import models
from django.contrib.auth.models import User


class Person(models.Model):
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="persons",
        help_text="Admin user who created this person.",
    )
    name = models.CharField(max_length=100)
    tracking_token = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        help_text="Secure UUID used in the share URL. Never expose in list APIs for unauthorized users.",
    )
    enabled = models.BooleanField(default=True, help_text="Allow location sharing for this person.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner"]),
            models.Index(fields=["tracking_token"]),
        ]

    def __str__(self):
        return f"{self.name} (owner: {self.owner.username})"

    def regenerate_token(self):
        """Create a new random tracking token, invalidating the old share link."""
        self.tracking_token = uuid.uuid4()
        self.save(update_fields=["tracking_token"])


class Location(models.Model):
    person = models.ForeignKey(
        Person,
        on_delete=models.CASCADE,
        related_name="locations",
    )
    latitude = models.FloatField()
    longitude = models.FloatField()
    accuracy = models.FloatField(null=True, blank=True, help_text="GPS accuracy in metres.")
    speed = models.FloatField(null=True, blank=True, help_text="Speed in m/s.")
    heading = models.FloatField(null=True, blank=True, help_text="Heading in degrees (0–360).")
    altitude = models.FloatField(null=True, blank=True)
    battery = models.FloatField(null=True, blank=True, help_text="Battery level 0.0–1.0.")
    connection = models.CharField(max_length=50, null=True, blank=True)
    # Device info snapshot
    browser = models.CharField(max_length=120, null=True, blank=True)
    operating_system = models.CharField(max_length=120, null=True, blank=True)
    device_type = models.CharField(max_length=50, null=True, blank=True)
    timezone = models.CharField(max_length=60, null=True, blank=True)
    language = models.CharField(max_length=30, null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["person", "-timestamp"]),
        ]

    def __str__(self):
        return f"{self.person.name} @ {self.timestamp:%Y-%m-%d %H:%M:%S}"

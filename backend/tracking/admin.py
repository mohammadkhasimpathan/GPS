from django.contrib import admin
from .models import Person, Location


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ["name", "owner", "enabled", "created_at", "tracking_token"]
    list_filter = ["enabled", "owner"]
    search_fields = ["name", "owner__username"]
    readonly_fields = ["tracking_token", "created_at"]


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ["person", "latitude", "longitude", "accuracy", "speed", "battery", "timestamp"]
    list_filter = ["person"]
    ordering = ["-timestamp"]

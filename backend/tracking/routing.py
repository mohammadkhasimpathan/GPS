"""WebSocket URL routing for tracking app"""

from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r"ws/location/(?P<token>[0-9a-f-]+)/$", consumers.LocationConsumer.as_asgi()),
]

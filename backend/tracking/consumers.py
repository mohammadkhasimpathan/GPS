"""
WebSocket consumer for live location updates.

Group naming: location_{tracking_token}

Message types:
  - location.update  — new GPS ping (sent from LocationCreateView via channel layer)
  - presence.update  — online/offline presence notification
  - ping             — heartbeat from client
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer


class LocationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.token = self.scope["url_route"]["kwargs"]["token"]
        self.group_name = f"location_{self.token}"

        # Join the group for this tracking token
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send(text_data=json.dumps({"type": "connected", "group": self.group_name}))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        """Handle messages from the WebSocket client (e.g. ping heartbeat)."""
        try:
            data = json.loads(text_data or "{}")
        except json.JSONDecodeError:
            return

        msg_type = data.get("type")
        if msg_type == "ping":
            await self.send(text_data=json.dumps({"type": "pong"}))

    # ── Group message handlers ────────────────────────────────────────────
    # These are called by channel_layer.group_send() from the REST views.

    async def location_update(self, event):
        """Broadcast a new location ping to all dashboard connections watching this token."""
        await self.send(text_data=json.dumps({"type": "location.update", "data": event["data"]}))

    async def presence_update(self, event):
        """Broadcast online/offline presence change."""
        await self.send(text_data=json.dumps({"type": "presence.update", "data": event["data"]}))

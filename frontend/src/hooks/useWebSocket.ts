/**
 * useWebSocket — Connects to the Django Channels WebSocket for a specific tracking token.
 *
 * - Auto-reconnects with exponential backoff (up to 30s)
 * - Falls back to AJAX polling if WS is unavailable
 * - Sends ping every 20s to keep connection alive
 */

import { useEffect, useRef, useCallback, useState } from "react";
import type { WSMessage } from "../types";

interface UseWebSocketOptions {
  token: string;
  onMessage: (msg: WSMessage) => void;
  enabled?: boolean;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  connectionType: "websocket" | "polling" | "disconnected";
}

const WS_BASE = import.meta.env.VITE_WS_URL ?? "";

function buildWsUrl(token: string) {
  if (WS_BASE) return `${WS_BASE}/ws/location/${token}/`;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/location/${token}/`;
}

export function useWebSocket({
  token,
  onMessage,
  enabled = true,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionType, setConnectionType] = useState<"websocket" | "polling" | "disconnected">(
    "disconnected"
  );

  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !token) return;

    try {
      const ws = new WebSocket(buildWsUrl(token));
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionType("websocket");
        retryCountRef.current = 0;

        // Heartbeat ping every 20s
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 20_000);
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          onMessageRef.current(msg);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setConnectionType("disconnected");
        clearTimers();

        // Exponential backoff: 1s, 2s, 4s … max 30s
        const delay = Math.min(1000 * 2 ** retryCountRef.current, 30_000);
        retryCountRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // WebSocket not supported — polling fallback handled by consumer
      setConnectionType("polling");
    }
  }, [token, enabled, clearTimers]);

  useEffect(() => {
    connect();
    return () => {
      clearTimers();
      wsRef.current?.close();
    };
  }, [connect, clearTimers]);

  return { isConnected, connectionType };
}

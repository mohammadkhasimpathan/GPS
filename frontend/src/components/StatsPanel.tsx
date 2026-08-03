/**
 * StatsPanel — 8-card grid displaying live telemetry for selected person.
 */

import { MapPin, Zap, Navigation, Target, Battery, Wifi, Clock, Route } from "lucide-react";
import type { Location } from "../types";

interface StatsPanelProps {
  location: Location | null;
  distanceTravelled: number; // metres
}

function formatSpeed(speed: number | null): string {
  if (speed === null || speed === undefined) return "—";
  return `${(speed * 3.6).toFixed(1)} km/h`;
}

function formatHeading(heading: number | null): string {
  if (heading === null || heading === undefined) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const dir = dirs[Math.round(heading / 45) % 8];
  return `${Math.round(heading)}° ${dir}`;
}

function formatBattery(battery: number | null): string {
  if (battery === null || battery === undefined) return "—";
  return `${Math.round(battery * 100)}%`;
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

function formatLastSeen(timestamp: string | null): string {
  if (!timestamp) return "—";
  const diff = (Date.now() - new Date(timestamp).getTime()) / 1000;
  if (diff < 10) return "Just now";
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return new Date(timestamp).toLocaleTimeString();
}

function getBatteryColor(battery: number | null): string {
  if (battery === null) return "text-white/40";
  if (battery > 0.5) return "text-emerald-400";
  if (battery > 0.2) return "text-amber-400";
  return "text-red-400";
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
  subValue?: string;
}

function StatCard({ icon, label, value, valueClass = "text-white", subValue }: StatCardProps) {
  return (
    <div className="stat-card animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-brand-400 opacity-70">{icon}</div>
        <span className="stat-label">{label}</span>
      </div>
      <span className={`stat-value ${valueClass}`}>{value}</span>
      {subValue && <span className="text-xs text-white/30 mt-0.5">{subValue}</span>}
    </div>
  );
}

export default function StatsPanel({ location, distanceTravelled }: StatsPanelProps) {
  const loc = location;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      <StatCard
        icon={<MapPin className="w-4 h-4" />}
        label="Position"
        value={loc ? `${loc.latitude.toFixed(5)}` : "—"}
        subValue={loc ? `${loc.longitude.toFixed(5)}` : undefined}
      />
      <StatCard
        icon={<Route className="w-4 h-4" />}
        label="Distance"
        value={formatDistance(distanceTravelled)}
      />
      <StatCard
        icon={<Zap className="w-4 h-4" />}
        label="Speed"
        value={formatSpeed(loc?.speed ?? null)}
      />
      <StatCard
        icon={<Navigation className="w-4 h-4" />}
        label="Heading"
        value={formatHeading(loc?.heading ?? null)}
      />
      <StatCard
        icon={<Target className="w-4 h-4" />}
        label="Accuracy"
        value={loc?.accuracy ? `±${Math.round(loc.accuracy)} m` : "—"}
        valueClass={
          loc?.accuracy
            ? loc.accuracy < 20
              ? "text-emerald-400"
              : loc.accuracy < 50
              ? "text-amber-400"
              : "text-red-400"
            : "text-white/40"
        }
      />
      <StatCard
        icon={<Battery className="w-4 h-4" />}
        label="Battery"
        value={formatBattery(loc?.battery ?? null)}
        valueClass={getBatteryColor(loc?.battery ?? null)}
      />
      <StatCard
        icon={<Wifi className="w-4 h-4" />}
        label="Connection"
        value={loc?.connection ?? "—"}
        subValue={loc?.device_type ?? undefined}
      />
      <StatCard
        icon={<Clock className="w-4 h-4" />}
        label="Last Update"
        value={formatLastSeen(loc?.timestamp ?? null)}
      />
    </div>
  );
}

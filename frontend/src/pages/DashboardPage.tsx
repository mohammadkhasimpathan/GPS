/**
 * DashboardPage — Main admin dashboard.
 *
 * Layout:
 *   TopBar (full width)
 *   └── body
 *       ├── Sidebar (person list + create)
 *       └── Main area
 *           ├── LiveMap (primary)
 *           └── StatsPanel (bottom)
 *
 * Real-time updates via WebSocket (useWebSocket) connected to the selected
 * person's tracking token. Falls back to polling via REST.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X, Users, Wifi, WifiOff, Loader2, Menu } from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import api from "../lib/api";
import type { Person, Location, WSMessage } from "../types";

import TopBar from "../components/TopBar";
import PersonCard from "../components/PersonCard";
import LiveMap from "../components/LiveMap";
import StatsPanel from "../components/StatsPanel";

// ── Haversine distance (metres) ────────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DashboardPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [persons, setPersons] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [onlinePersonIds, setOnlinePersonIds] = useState<Set<number>>(new Set());
  const [distanceTravelled, setDistanceTravelled] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Create person form
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedPerson = persons.find((p) => p.id === selectedId) ?? null;

  // ── Auth guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) navigate("/login", { replace: true });
  }, [isAuthenticated, navigate]);

  // ── Load persons ────────────────────────────────────────────────────────
  const loadPersons = useCallback(async () => {
    try {
      const { data } = await api.get<Person[]>("/persons/");
      setPersons(data);
      // Auto-select first person
      setSelectedId((prev) => prev ?? (data[0]?.id ?? null));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadPersons(); }, [loadPersons]);

  // ── Load location history when selection changes ─────────────────────────
  useEffect(() => {
    if (!selectedPerson) return;
    setLocations([]);
    setDistanceTravelled(0);

    api
      .get<Location[]>(`/location/history/${selectedPerson.tracking_token}/?limit=200`)
      .then(({ data }) => {
        setLocations(data);
        // Compute distance from history
        let dist = 0;
        for (let i = 1; i < data.length; i++) {
          dist += haversine(data[i].latitude, data[i].longitude, data[i - 1].latitude, data[i - 1].longitude);
        }
        setDistanceTravelled(dist);
      })
      .catch(() => {});
  }, [selectedPerson?.tracking_token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── REST polling fallback (every 5s) ────────────────────────────────────
  const startPolling = useCallback(() => {
    if (!selectedPerson || pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(async () => {
      try {
        const { data } = await api.get<Location>(`/location/latest/${selectedPerson.tracking_token}/`);
        setLocations((prev) => {
          if (prev[0]?.timestamp === data.timestamp) return prev;
          const next = [data, ...prev];
          if (prev[0]) {
            setDistanceTravelled((d) => d + haversine(prev[0].latitude, prev[0].longitude, data.latitude, data.longitude));
          }
          return next.slice(0, 500);
        });
      } catch { /* no location yet */ }
    }, 5_000);
  }, [selectedPerson]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    };
  }, [selectedPerson]);

  // ── WebSocket messages ───────────────────────────────────────────────────
  const handleWsMessage = useCallback((msg: WSMessage) => {
    if (msg.type === "location.update") {
      const data = msg.data as Location;
      setLocations((prev) => {
        if (prev[0]?.timestamp === data.timestamp) return prev;
        if (prev[0]) {
          setDistanceTravelled((d) => d + haversine(prev[0].latitude, prev[0].longitude, data.latitude, data.longitude));
        }
        return [data, ...prev].slice(0, 500);
      });
      // Update person's online status
      if (data.person_id) {
        setOnlinePersonIds((s) => new Set([...s, data.person_id!]));
      }
    } else if (msg.type === "presence.update") {
      const pres = msg.data as { status: "online" | "offline"; person_id: number };
      setOnlinePersonIds((s) => {
        const next = new Set(s);
        if (pres.status === "online") next.add(pres.person_id);
        else next.delete(pres.person_id);
        return next;
      });
    }
  }, []);

  const { isConnected, connectionType } = useWebSocket({
    token: selectedPerson?.tracking_token ?? "",
    onMessage: handleWsMessage,
    enabled: !!selectedPerson,
  });

  // Start polling if WS not connected
  useEffect(() => {
    if (!isConnected && selectedPerson) {
      startPolling();
    } else if (isConnected && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, [isConnected, selectedPerson, startPolling]);

  // ── CRUD operations ──────────────────────────────────────────────────────
  const createPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreateLoading(true);
    try {
      const { data } = await api.post<Person>("/persons/", { name: newName.trim() });
      setPersons((prev) => [data, ...prev]);
      setSelectedId(data.id);
      setNewName("");
      setCreating(false);
    } catch { /* ignore */ } finally {
      setCreateLoading(false);
    }
  };

  const deletePerson = async (id: number) => {
    await api.delete(`/persons/${id}/`);
    setPersons((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(persons.find((p) => p.id !== id)?.id ?? null);
  };

  const toggleEnabled = async (id: number, enabled: boolean) => {
    const { data } = await api.patch<Person>(`/persons/${id}/`, { enabled });
    setPersons((prev) => prev.map((p) => (p.id === id ? data : p)));
  };

  const regenerateToken = async (id: number) => {
    const { data } = await api.post<Person>(`/persons/${id}/regenerate/`);
    setPersons((prev) => prev.map((p) => (p.id === id ? data : p)));
    if (selectedId === id) {
      // Reload locations for new token
      setLocations([]);
    }
  };

  // Merge server is_online with WS presence
  const personsWithStatus = persons.map((p) => ({
    ...p,
    is_online: onlinePersonIds.has(p.id) || p.is_online,
  }));

  return (
    <div className="h-screen flex flex-col bg-surface-950 text-white overflow-hidden">
      {/* Top Bar */}
      <TopBar selectedPerson={selectedPerson} />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <aside
          className={`
            flex-shrink-0 flex flex-col bg-surface-900/80 border-r border-white/[0.06]
            transition-all duration-300 overflow-hidden
            ${sidebarOpen ? "w-72" : "w-0"}
          `}
        >
          <div className="flex flex-col h-full p-4 overflow-hidden min-w-[288px]">
            {/* Sidebar header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-400" />
                <span className="font-semibold text-sm text-white/80">People</span>
                <span className="text-xs text-white/30 bg-white/5 px-1.5 py-0.5 rounded-full">
                  {persons.length}
                </span>
              </div>
              {/* WS status indicator */}
              <div className="flex items-center gap-1.5 text-xs text-white/30">
                {connectionType === "websocket" ? (
                  <Wifi className="w-3 h-3 text-emerald-400" />
                ) : (
                  <WifiOff className="w-3 h-3" />
                )}
                {connectionType === "websocket" ? "Live" : connectionType === "polling" ? "Polling" : "Offline"}
              </div>
            </div>

            {/* Create person */}
            {creating ? (
              <form onSubmit={createPerson} className="mb-3 animate-slide-up">
                <div className="glass-card p-3 space-y-2">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Person's name…"
                    className="input-field py-2"
                    maxLength={100}
                  />
                  <div className="flex gap-2">
                    <button type="submit" disabled={createLoading} className="btn-primary flex-1 justify-center py-2 text-xs">
                      {createLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Create"}
                    </button>
                    <button type="button" onClick={() => setCreating(false)} className="btn-ghost py-2 px-3">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <button
                id="create-person-btn"
                onClick={() => setCreating(true)}
                className="btn-primary w-full justify-center mb-3 py-2.5 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Person
              </button>
            )}

            {/* Person list */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
              {personsWithStatus.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="w-8 h-8 text-white/15 mb-3" />
                  <p className="text-white/30 text-sm">No people yet</p>
                  <p className="text-white/20 text-xs mt-1">Add a family member above</p>
                </div>
              ) : (
                personsWithStatus.map((person) => (
                  <PersonCard
                    key={person.id}
                    person={person}
                    isSelected={selectedId === person.id}
                    onSelect={() => setSelectedId(person.id)}
                    onDelete={deletePerson}
                    onToggleEnabled={toggleEnabled}
                    onRegenerate={regenerateToken}
                  />
                ))
              )}
            </div>
          </div>
        </aside>

        {/* ── Main area ────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Map area */}
          <div className="flex-1 relative p-4 overflow-hidden">
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="absolute left-4 top-4 z-[1000] btn-secondary p-2.5 rounded-xl"
              title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Map or empty state */}
            {selectedPerson ? (
              <LiveMap
                locations={locations}
                isOnline={personsWithStatus.find((p) => p.id === selectedId)?.is_online ?? false}
                personName={selectedPerson.name}
              />
            ) : (
              <div className="w-full h-full glass-card flex flex-col items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-3xl bg-surface-700/50 flex items-center justify-center mx-auto mb-4">
                    <Users className="w-10 h-10 text-white/20" />
                  </div>
                  <h3 className="text-white/40 font-medium">No person selected</h3>
                  <p className="text-white/20 text-sm mt-1">
                    Add a person or select one from the sidebar
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Stats panel */}
          {selectedPerson && (
            <div className="px-4 pb-4">
              <StatsPanel
                location={locations[0] ?? null}
                distanceTravelled={distanceTravelled}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

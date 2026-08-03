/**
 * TopBar — Dashboard header with admin info, dark mode toggle, export, and logout.
 */

import { Sun, Moon, Download, LogOut, Shield, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import api from "../lib/api";
import type { Person } from "../types";

interface TopBarProps {
  selectedPerson: Person | null;
}

export default function TopBar({ selectedPerson }: TopBarProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [exportOpen, setExportOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleExport = async (format: "json" | "csv") => {
    if (!selectedPerson) return;
    setExportOpen(false);
    try {
      const res = await api.get(`/export/${selectedPerson.tracking_token}/?format=${format}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `guardianlink-${selectedPerson.name}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    }
  };

  return (
    <header className="h-16 flex items-center justify-between px-6 glass-card rounded-none border-b border-white/[0.06] backdrop-blur-xl">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-glow-sm">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="font-bold text-white tracking-tight">GuardianLink</span>
          <div className="text-xs text-white/30 leading-none">Live Location Sharing</div>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {/* Export dropdown */}
        {selectedPerson && (
          <div className="relative" ref={dropRef}>
            <button
              onClick={() => setExportOpen((v) => !v)}
              id="export-btn"
              className="btn-secondary text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              Export
              <ChevronDown className={`w-3 h-3 transition-transform ${exportOpen ? "rotate-180" : ""}`} />
            </button>
            {exportOpen && (
              <div className="absolute right-0 mt-2 w-36 glass-card py-1.5 z-50 animate-slide-up">
                <button
                  onClick={() => handleExport("json")}
                  className="w-full text-left px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  Export JSON
                </button>
                <button
                  onClick={() => handleExport("csv")}
                  className="w-full text-left px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  Export CSV
                </button>
              </div>
            )}
          </div>
        )}

        {/* Dark mode toggle */}
        <button
          onClick={toggleTheme}
          id="theme-toggle-btn"
          className="btn-ghost p-2.5 rounded-xl"
          title="Toggle theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* User + logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-white/[0.08]">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-medium text-white/80">{user?.username}</div>
            <div className="text-xs text-white/30">Admin</div>
          </div>
          <button
            onClick={logout}
            id="logout-btn"
            className="btn-ghost p-2.5 rounded-xl text-white/40 hover:text-red-400"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

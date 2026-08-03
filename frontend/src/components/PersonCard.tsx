/**
 * PersonCard — Sidebar card for a tracked family member.
 */

import { useState } from "react";
import { Copy, Trash2, QrCode, RefreshCw, Check, ToggleLeft, ToggleRight } from "lucide-react";
import type { Person } from "../types";
import QRModal from "./QRModal";

interface PersonCardProps {
  person: Person;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (id: number) => void;
  onToggleEnabled: (id: number, enabled: boolean) => void;
  onRegenerate: (id: number) => void;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 10) return "Just now";
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function PersonCard({
  person,
  isSelected,
  onSelect,
  onDelete,
  onToggleEnabled,
  onRegenerate,
}: PersonCardProps) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const copyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(person.tracking_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    onDelete(person.id);
  };

  const initials = person.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <div
        onClick={onSelect}
        className={`group relative rounded-2xl p-4 cursor-pointer transition-all duration-200 border
          ${isSelected
            ? "bg-brand-600/20 border-brand-500/40 shadow-glow-sm"
            : "bg-surface-800/50 border-white/[0.06] hover:border-white/[0.12] hover:bg-surface-700/50"
          }`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          {/* Avatar */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0
            ${isSelected ? "bg-brand-500" : "bg-surface-600"}`}>
            {initials}
          </div>

          {/* Name & Status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-white truncate">{person.name}</span>
              {!person.enabled && (
                <span className="text-xs text-white/30 bg-white/5 px-1.5 py-0.5 rounded-md">
                  Paused
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${person.is_online ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
              <span className={`text-xs ${person.is_online ? "text-emerald-400" : "text-white/30"}`}>
                {person.is_online ? "Online" : timeAgo(person.last_seen)}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          {/* Copy link */}
          <button
            onClick={copyLink}
            title="Copy tracking link"
            className="btn-ghost p-2 rounded-lg text-xs flex-1 justify-center"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* QR Code */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowQR(true); }}
            title="Show QR code"
            className="btn-ghost p-2 rounded-lg"
          >
            <QrCode className="w-3.5 h-3.5" />
          </button>

          {/* Toggle enabled */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleEnabled(person.id, !person.enabled); }}
            title={person.enabled ? "Pause sharing" : "Resume sharing"}
            className="btn-ghost p-2 rounded-lg"
          >
            {person.enabled ? (
              <ToggleRight className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <ToggleLeft className="w-3.5 h-3.5 text-white/40" />
            )}
          </button>

          {/* Regenerate token */}
          <button
            onClick={(e) => { e.stopPropagation(); onRegenerate(person.id); }}
            title="Generate new link (invalidates old link)"
            className="btn-ghost p-2 rounded-lg"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            title={confirmDelete ? "Click again to confirm delete" : "Delete person"}
            className={`p-2 rounded-lg transition-all duration-150
              ${confirmDelete
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "text-white/30 hover:text-red-400 hover:bg-red-500/10"}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showQR && (
        <QRModal
          url={person.tracking_url}
          name={person.name}
          onClose={() => setShowQR(false)}
        />
      )}
    </>
  );
}

/**
 * QRModal — Displays a QR code for the tracking link.
 */

import { X, Download } from "lucide-react";
import QRCode from "react-qr-code";

interface QRModalProps {
  url: string;
  name: string;
  onClose: () => void;
}

export default function QRModal({ url, name, onClose }: QRModalProps) {
  const handleDownload = () => {
    const svg = document.getElementById("qr-code-svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const a = document.createElement("a");
      a.download = `guardianlink-${name.replace(/\s+/g, "-").toLowerCase()}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass-card p-6 max-w-sm w-full animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-white">{name}</h3>
            <p className="text-xs text-white/40 mt-0.5">Scan to open tracking link</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2 rounded-xl">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* QR Code */}
        <div className="bg-white p-4 rounded-xl flex items-center justify-center mb-4">
          <QRCode
            id="qr-code-svg"
            value={url}
            size={200}
            level="M"
            style={{ maxWidth: "100%", height: "auto" }}
          />
        </div>

        {/* URL */}
        <p className="text-xs text-white/30 font-mono text-center mb-4 break-all">{url}</p>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(url)}
            className="btn-secondary flex-1 justify-center text-xs"
          >
            Copy Link
          </button>
          <button
            onClick={handleDownload}
            className="btn-primary flex-1 justify-center text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Save QR
          </button>
        </div>
      </div>
    </div>
  );
}

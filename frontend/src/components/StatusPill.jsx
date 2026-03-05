import { C } from "../lib/constants";

// ── Status pill ────────────────────────────────────────────────────────────
const StatusPill = ({ status }) => {
  const cfg = {
    NORMAL: { color: C.green, label: "● NORMAL", bg: "#00e5a015" },
    LEAK: { color: C.red, label: "⚠ LEAK DETECTED", bg: "#ff4b6e15" },
    HIGH: { color: C.yellow, label: "◈ HIGH USAGE", bg: "#f5c51815" },
    IDLE: { color: C.textSecondary, label: "○ IDLE", bg: "#5a8aab10" },
  }[status] || { color: C.textSecondary, label: status, bg: "transparent" };

  return (
    <span style={{
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40`,
      padding: "4px 14px", borderRadius: 20, fontSize: 11, fontFamily: "monospace",
      letterSpacing: 2, fontWeight: 700,
      boxShadow: `0 0 12px ${cfg.color}30`,
      animation: status === "LEAK" ? "pulse 1.5s infinite" : "none",
    }}>{cfg.label}</span>
  );
};

export default StatusPill;


import { C } from "../lib/constants";

// ── Animated gauge ─────────────────────────────────────────────────────────
const FlowGauge = ({ flow, max = 50, status }) => {
  const pct = Math.min(flow / max, 1);
  const angle = -135 + pct * 270;
  const color = status === "LEAK" ? C.red : status === "HIGH" ? C.yellow : C.green;
  const r = 70, cx = 90, cy = 90;
  const arcPath = (start, end, radius) => {
    const s = (start * Math.PI) / 180, e = (end * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(s), y1 = cy + radius * Math.sin(s);
    const x2 = cx + radius * Math.cos(e), y2 = cy + radius * Math.sin(e);
    const large = end - start > 180 ? 1 : 0;
    return `M${x1},${y1} A${radius},${radius} 0 ${large},1 ${x2},${y2}`;
  };
  return (
    <svg width="180" height="150" style={{ overflow: "visible" }}>
      {/* Track */}
      <path d={arcPath(-135, 135, r)} fill="none" stroke={C.border} strokeWidth="8" strokeLinecap="round" />
      {/* Fill */}
      <path d={arcPath(-135, -135 + pct * 270, r)} fill="none" stroke={color} strokeWidth="8"
        strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "all 0.6s ease" }} />
      {/* Needle */}
      <line
        x1={cx} y1={cy}
        x2={cx + 55 * Math.cos((angle * Math.PI) / 180)}
        y2={cy + 55 * Math.sin((angle * Math.PI) / 180)}
        stroke={color} strokeWidth="2" strokeLinecap="round"
        style={{ transition: "all 0.6s ease", filter: `drop-shadow(0 0 4px ${color})` }}
      />
      <circle cx={cx} cy={cy} r="5" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      {/* Labels */}
      <text x={cx} y={cy + 28} textAnchor="middle" fill={C.textPrimary}
        style={{ fontSize: 22, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
        {flow.toFixed(1)}
      </text>
      <text x={cx} y={cy + 44} textAnchor="middle" fill={C.textSecondary}
        style={{ fontSize: 10, fontFamily: "monospace", letterSpacing: 2 }}>
        L/MIN
      </text>
      <text x={20} y={cy + 20} fill={C.textMuted} style={{ fontSize: 9, fontFamily: "monospace" }}>0</text>
      <text x={145} y={cy + 20} fill={C.textMuted} style={{ fontSize: 9, fontFamily: "monospace" }}>50</text>
    </svg>
  );
};

export default FlowGauge;


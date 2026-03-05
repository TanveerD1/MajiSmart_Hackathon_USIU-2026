import { C } from "../lib/constants";

// ── Bar chart ──────────────────────────────────────────────────────────────
const BarChart = ({ data }) => {
  const max = Math.max(...data.map(d => d.flow), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120, padding: "0 4px" }}>
      {data.map((d, i) => {
        const h = Math.max((d.flow / max) * 100, 1);
        const color = d.scenario === "leak" ? C.red : d.scenario === "irrigation" ? C.yellow : d.flow > 0.5 ? C.accent : C.textMuted;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: "100%", height: `${h}%`, background: color, borderRadius: "2px 2px 0 0",
              opacity: 0.8, transition: "height 0.3s ease",
              boxShadow: d.scenario === "leak" ? `0 0 6px ${C.red}` : "none",
              minHeight: 2,
            }} />
            {i % 4 === 0 && (
              <span style={{ fontSize: 8, color: C.textMuted, fontFamily: "monospace", transform: "rotate(-30deg)", whiteSpace: "nowrap" }}>
                {d.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BarChart;


import { C } from "../lib/constants";
import Card from "../components/Card";
import Label from "../components/Label";
import FlowGauge from "../components/FlowGauge";
import StatusPill from "../components/StatusPill";

// ══════════════════════════════════════════════════════════════════════════
// PAGE: HOME
// ══════════════════════════════════════════════════════════════════════════
const HomePage = ({ flow, status, history, scenario, setScenario }) => {
  const savedLiters = 340;
  const alerts = history.filter(h => h.scenario === "leak");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Top row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {/* Gauge card */}
        <Card glow={C.accent} style={{ gridColumn: "span 1", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Label>Live Flow Rate</Label>
          <FlowGauge flow={flow} status={status} />
          <div style={{ marginTop: 8 }}><StatusPill status={status} /></div>
        </Card>

        {/* Stats */}
        <Card style={{ gridColumn: "span 2", display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Litres Saved", value: `${savedLiters}L`, color: C.green, sub: "this month" },
            { label: "Est. Bill", value: "KES 1,240", color: C.accent, sub: "projected" },
            { label: "Anomalies", value: `${alerts.length}`, color: alerts.length > 0 ? C.red : C.green, sub: "last 24h" },
            { label: "Uptime", value: "99.8%", color: C.yellow, sub: "sensor health" },
          ].map(s => (
            <div key={s.label} style={{ background: C.surface, borderRadius: 8, padding: "14px 16px", border: `1px solid ${C.border}` }}>
              <Label>{s.label}</Label>
              <div style={{ fontSize: 26, fontFamily: "'Space Mono', monospace", color: s.color, fontWeight: 700, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4, fontFamily: "monospace" }}>{s.sub}</div>
            </div>
          ))}
        </Card>
      </div>

      {/* Scenario selector — demo tool */}
      <Card>
        <Label>Demo Scenario Simulator</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { id: "normal", label: "Normal Usage", color: C.accent },
            { id: "leak", label: "⚠ Leak Active", color: C.red },
            { id: "irrigation", label: "◈ Irrigation", color: C.yellow },
            { id: "idle", label: "○ Idle / Night", color: C.textSecondary },
          ].map(s => (
            <button key={s.id} onClick={() => setScenario(s.id)} style={{
              background: scenario === s.id ? `${s.color}20` : "transparent",
              border: `1px solid ${scenario === s.id ? s.color : C.border}`,
              color: scenario === s.id ? s.color : C.textSecondary,
              padding: "7px 16px", borderRadius: 6, cursor: "pointer",
              fontFamily: "monospace", fontSize: 12, letterSpacing: 1,
              boxShadow: scenario === s.id ? `0 0 10px ${s.color}30` : "none",
              transition: "all 0.2s",
            }}>{s.label}</button>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: C.textMuted, fontFamily: "monospace" }}>
          ↳ Simulates sensor data in real-time · switch scenarios to trigger AI alerts
        </div>
      </Card>

      {/* Alert log */}
      {status === "LEAK" && (
        <Card glow={C.red} style={{ borderColor: `${C.red}40` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>⚠</span>
            <div>
              <div style={{ color: C.red, fontFamily: "monospace", fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
                LEAK SIGNATURE DETECTED
              </div>
              <div style={{ color: C.textSecondary, fontSize: 12, marginTop: 2 }}>
                Constant low flow of {flow.toFixed(2)} L/min detected outside scheduled usage. Estimated loss: ~{(flow * 60).toFixed(0)}L/hr.
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default HomePage;


import { C } from "../lib/constants";
import Card from "../components/Card";
import Label from "../components/Label";
import BarChart from "../components/BarChart";
import SparkPath from "../components/SparkPath";

// ══════════════════════════════════════════════════════════════════════════
// PAGE: ANALYTICS
// ══════════════════════════════════════════════════════════════════════════
const AnalyticsPage = ({ history }) => {
  const totalToday = history.reduce((s, h) => s + h.flow, 0).toFixed(0);
  const leakHours = history.filter(h => h.scenario === "leak");
  const leakLoss = (leakHours.reduce((s, h) => s + h.flow, 0) * 60).toFixed(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 24h bar chart */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <Label>24-Hour Flow History</Label>
            <div style={{ fontSize: 11, color: C.textSecondary, fontFamily: "monospace" }}>
              <span style={{ color: C.red }}>■</span> Leak &nbsp;
              <span style={{ color: C.yellow }}>■</span> Irrigation &nbsp;
              <span style={{ color: C.accent }}>■</span> Normal &nbsp;
              <span style={{ color: C.textMuted }}>■</span> Idle
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, color: C.accent, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{totalToday}L</div>
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace" }}>total today</div>
          </div>
        </div>
        <BarChart data={history} />
      </Card>

      {/* Insight cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card glow={C.red}>
          <Label>Leak Loss Estimate</Label>
          <div style={{ fontSize: 32, color: C.red, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{leakLoss}L</div>
          <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 4, fontFamily: "monospace" }}>
            Lost during {leakHours.length} anomalous hour(s) · ~KES {(leakLoss * 0.08).toFixed(0)} wasted
          </div>
          <div style={{ marginTop: 12, padding: "8px 12px", background: `${C.red}10`, borderRadius: 6, border: `1px solid ${C.red}30` }}>
            <div style={{ fontSize: 10, color: C.red, fontFamily: "monospace", letterSpacing: 1 }}>AI INSIGHT</div>
            <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 4 }}>
              Flow variance σ=0.09 at 3AM — consistent with pipe leak signature, not usage event.
            </div>
          </div>
        </Card>

        <Card glow={C.accent}>
          <Label>Predictive Billing</Label>
          <div style={{ fontSize: 32, color: C.accent, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>KES 1,240</div>
          <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 4, fontFamily: "monospace" }}>projected end-of-month</div>
          <div style={{ marginTop: 12 }}>
            {[
              { label: "Fix detected leak", save: 180 },
              { label: "Reduce shower 2min", save: 90 },
              { label: "Night tank shutoff", save: 60 },
            ].map(tip => (
              <div key={tip.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11, color: C.textSecondary, fontFamily: "monospace" }}>↳ {tip.label}</span>
                <span style={{ fontSize: 11, color: C.green, fontFamily: "monospace" }}>-KES {tip.save}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Flow signature explanation */}
      <Card>
        <Label>AI Detection Logic — Flow Variance</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 4 }}>
          {[
            { type: "Leak", desc: "Low constant flow (1–2 L/min). Never hits zero. Variance σ < 0.2. Persists through night.", color: C.red, flow: [1.4,1.3,1.5,1.4,1.4,1.5,1.3,1.4,1.5,1.4] },
            { type: "Normal Use", desc: "Spike then drops to zero. High variance σ > 2. Correlates with time-of-day.", color: C.accent, flow: [0,0,8,12,9,4,0,0,0,0] },
            { type: "Irrigation", desc: "Very high spike (40+ L/min). Short duration. Matches Farmer Mode schedule.", color: C.yellow, flow: [0,0,42,45,40,38,10,0,0,0] },
          ].map(s => (
            <div key={s.type} style={{ background: C.surface, borderRadius: 8, padding: 12, border: `1px solid ${C.border}` }}>
              <div style={{ color: s.color, fontFamily: "monospace", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{s.type}</div>
              <SparkPath data={s.flow} width={140} height={40} color={s.color} fill />
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 8, lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default AnalyticsPage;


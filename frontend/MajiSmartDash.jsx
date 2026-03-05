import { useState, useEffect, useRef } from "react";

// ── Palette & theme ────────────────────────────────────────────────────────
const C = {
  bg: "#040d1a",
  surface: "#071528",
  card: "#0a1e35",
  border: "#0e2d4a",
  accent: "#00c2ff",
  accentDim: "#004d66",
  green: "#00e5a0",
  yellow: "#f5c518",
  red: "#ff4b6e",
  textPrimary: "#e8f4fd",
  textSecondary: "#5a8aab",
  textMuted: "#2e5570",
};

// ── Simulated live data ────────────────────────────────────────────────────
const generateReading = (scenario) => {
  const noise = () => (Math.random() - 0.5) * 0.3;
  switch (scenario) {
    case "leak": return Math.max(0, 1.4 + noise());
    case "irrigation": return Math.max(0, 42 + noise() * 8);
    case "normal": return Math.max(0, 8 + noise() * 3);
    default: return Math.max(0, noise() * 0.1);
  }
};

const buildHistory = () => {
  const pts = [];
  for (let h = 0; h < 24; h++) {
    let scenario = "idle";
    if (h >= 6 && h <= 8) scenario = "normal";
    else if (h >= 12 && h <= 13) scenario = "normal";
    else if (h >= 18 && h <= 20) scenario = "normal";
    else if (h === 3 || h === 4) scenario = "leak";
    pts.push({
      hour: h,
      label: h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`,
      flow: generateReading(scenario),
      scenario,
      predicted: scenario === "idle" ? 0.1 : scenario === "normal" ? 8 : 1,
    });
  }
  return pts;
};

const communityData = [
  { name: "Block A (You)", usage: 3200, rank: 2 },
  { name: "Block B", usage: 5800, rank: 5 },
  { name: "Block C", usage: 4100, rank: 3 },
  { name: "Block D", usage: 6900, rank: 6 },
  { name: "Block E", usage: 2900, rank: 1 },
  { name: "Block F", usage: 4700, rank: 4 },
];

const schedules = [
  { id: 1, label: "Garden Irrigation", days: "Mon, Wed, Fri", time: "06:00–07:30", active: true },
  { id: 2, label: "Roof Tank Fill", days: "Sunday", time: "08:00–09:00", active: false },
];

// ── Tiny chart component ───────────────────────────────────────────────────
const SparkPath = ({ data, width, height, color, fill }) => {
  if (!data.length) return null;
  const max = Math.max(...data, 0.1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * height * 0.9;
    return `${x},${y}`;
  });
  const d = `M${pts.join("L")}`;
  const fillD = `${d}L${width},${height}L0,${height}Z`;
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      {fill && <path d={fillD} fill={color} opacity="0.08" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
};

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

// ── Card wrapper ───────────────────────────────────────────────────────────
const Card = ({ children, style = {}, glow }) => (
  <div style={{
    background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: 20,
    boxShadow: glow ? `0 0 24px ${glow}20, inset 0 1px 0 ${C.border}` : `inset 0 1px 0 ${C.border}`,
    ...style,
  }}>{children}</div>
);

const Label = ({ children }) => (
  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace", letterSpacing: 3, marginBottom: 8, textTransform: "uppercase" }}>
    {children}
  </div>
);

// ── NAV ────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "home", icon: "◎", label: "Live" },
  { id: "analytics", icon: "⌇", label: "Analytics" },
  { id: "community", icon: "◈", label: "Community" },
  { id: "schedule", icon: "◷", label: "Schedule" },
];

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

// ══════════════════════════════════════════════════════════════════════════
// PAGE: COMMUNITY
// ══════════════════════════════════════════════════════════════════════════
const CommunityPage = () => {
  const avg = Math.round(communityData.reduce((s, d) => s + d.usage, 0) / communityData.length);
  const you = communityData.find(d => d.name.includes("You"));
  const maxUsage = Math.max(...communityData.map(d => d.usage));
  const sorted = [...communityData].sort((a, b) => a.usage - b.usage);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {[
          { label: "Your Rank", value: `#${you.rank}`, sub: "out of 6 blocks", color: C.green },
          { label: "Your Usage", value: `${(you.usage / 1000).toFixed(1)}m³`, sub: "this month", color: C.accent },
          { label: "vs. Average", value: `-${(((avg - you.usage) / avg) * 100).toFixed(0)}%`, sub: `avg is ${avg}L`, color: C.green },
        ].map(s => (
          <Card key={s.label} glow={s.color}>
            <Label>{s.label}</Label>
            <div style={{ fontSize: 30, color: s.color, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace", marginTop: 4 }}>{s.sub}</div>
          </Card>
        ))}
      </div>

      {/* Leaderboard */}
      <Card>
        <Label>Community Leaderboard — Water Efficiency</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {sorted.map((d, i) => {
            const isYou = d.name.includes("You");
            const pct = (d.usage / maxUsage) * 100;
            return (
              <div key={d.name} style={{
                background: isYou ? `${C.accent}10` : C.surface,
                border: `1px solid ${isYou ? C.accent : C.border}`,
                borderRadius: 8, padding: "10px 14px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: i === 0 ? C.green : C.textMuted, width: 20 }}>
                      {i === 0 ? "🏆" : `#${i + 1}`}
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: 13, color: isYou ? C.accent : C.textPrimary, fontWeight: isYou ? 700 : 400 }}>
                      {d.name}
                    </span>
                  </div>
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: C.textSecondary }}>{d.usage.toLocaleString()}L</span>
                </div>
                <div style={{ height: 4, background: C.border, borderRadius: 2 }}>
                  <div style={{
                    height: "100%", width: `${pct}%`, borderRadius: 2,
                    background: i === 0 ? C.green : isYou ? C.accent : C.textMuted,
                    transition: "width 0.8s ease",
                    boxShadow: isYou ? `0 0 8px ${C.accent}` : "none",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Tip */}
      <Card glow={C.green}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 24 }}>💡</span>
          <div>
            <div style={{ color: C.green, fontFamily: "monospace", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>EFFICIENCY TIP</div>
            <div style={{ color: C.textSecondary, fontSize: 12, marginTop: 4 }}>
              You're already 45% below the highest consumer (Block D). Fix your detected leak to potentially reach #1 and save an additional ~KES 180/month.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// PAGE: SCHEDULE (Farmer Mode)
// ══════════════════════════════════════════════════════════════════════════
const SchedulePage = () => {
  const [items, setItems] = useState(schedules);
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const toggle = (id) => setItems(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <Label>What is Farmer Mode?</Label>
        <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.8, fontFamily: "monospace" }}>
          When the AI detects high or unusual flow, it checks your schedule first.
          If the event is scheduled, <span style={{ color: C.yellow }}>no alert is triggered</span>.
          This eliminates false positives from irrigation, tank filling, or other planned high-use events.
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <div style={{ flex: 1, background: `${C.red}10`, border: `1px solid ${C.red}30`, borderRadius: 6, padding: "8px 12px" }}>
            <div style={{ fontSize: 10, color: C.red, fontFamily: "monospace", letterSpacing: 1 }}>WITHOUT SCHEDULE</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>42 L/min → "LEAK DETECTED" 🚨</div>
          </div>
          <div style={{ flex: 1, background: `${C.green}10`, border: `1px solid ${C.green}30`, borderRadius: 6, padding: "8px 12px" }}>
            <div style={{ fontSize: 10, color: C.green, fontFamily: "monospace", letterSpacing: 1 }}>WITH SCHEDULE</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>42 L/min → "Scheduled event ✓"</div>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Label>Active Schedules</Label>
          <button onClick={() => setShowForm(!showForm)} style={{
            background: `${C.accent}15`, border: `1px solid ${C.accent}40`, color: C.accent,
            padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "monospace", fontSize: 11, letterSpacing: 1,
          }}>+ ADD SCHEDULE</button>
        </div>

        {showForm && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <Label>New Schedule Name</Label>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. Rooftop tank fill..."
                style={{
                  flex: 1, background: C.bg, border: `1px solid ${C.border}`, color: C.textPrimary,
                  padding: "7px 12px", borderRadius: 6, fontFamily: "monospace", fontSize: 12, outline: "none",
                }} />
              <button onClick={() => {
                if (newLabel.trim()) {
                  setItems(prev => [...prev, { id: Date.now(), label: newLabel, days: "Daily", time: "06:00–07:00", active: true }]);
                  setNewLabel(""); setShowForm(false);
                }
              }} style={{
                background: C.accent, border: "none", color: C.bg, padding: "7px 14px",
                borderRadius: 6, cursor: "pointer", fontFamily: "monospace", fontSize: 12, fontWeight: 700,
              }}>SAVE</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(s => (
            <div key={s.id} style={{
              background: C.surface, border: `1px solid ${s.active ? C.green + "40" : C.border}`,
              borderRadius: 8, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ color: s.active ? C.textPrimary : C.textMuted, fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>{s.label}</div>
                <div style={{ color: C.textMuted, fontFamily: "monospace", fontSize: 11, marginTop: 2 }}>{s.days} · {s.time}</div>
              </div>
              <button onClick={() => toggle(s.id)} style={{
                background: s.active ? `${C.green}20` : C.bg,
                border: `1px solid ${s.active ? C.green : C.border}`,
                color: s.active ? C.green : C.textMuted,
                padding: "5px 14px", borderRadius: 20, cursor: "pointer",
                fontFamily: "monospace", fontSize: 11, letterSpacing: 1,
                transition: "all 0.2s",
              }}>{s.active ? "ON" : "OFF"}</button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState("home");
  const [scenario, setScenario] = useState("normal");
  const [flow, setFlow] = useState(8.2);
  const [history] = useState(buildHistory);

  const status = scenario === "leak" ? "LEAK" : scenario === "irrigation" ? "HIGH" : scenario === "idle" ? "IDLE" : "NORMAL";

  useEffect(() => {
    const iv = setInterval(() => setFlow(generateReading(scenario)), 1200);
    return () => clearInterval(iv);
  }, [scenario]);

  const pages = { home: <HomePage flow={flow} status={status} history={history} scenario={scenario} setScenario={setScenario} />, analytics: <AnalyticsPage history={history} />, community: <CommunityPage />, schedule: <SchedulePage /> };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "monospace", color: C.textPrimary }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: ${C.bg}; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        button:hover { opacity: 0.85; }
      `}</style>

      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.accent}, #0055ff)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, boxShadow: `0 0 16px ${C.accent}40` }}>
            💧
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, fontFamily: "'Space Mono', monospace", letterSpacing: 1 }}>MajiSmart</div>
            <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 3 }}>WATER INTELLIGENCE PLATFORM</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace" }}>
            USIU-AFRICA · BLOCK A · <span style={{ color: C.green }}>● ONLINE</span>
          </div>
          <StatusPill status={status} />
        </div>
      </div>

      {/* Nav */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", gap: 4 }}>
        {NAV_ITEMS.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "12px 16px", fontFamily: "monospace", fontSize: 12, letterSpacing: 2,
            color: page === n.id ? C.accent : C.textSecondary,
            borderBottom: `2px solid ${page === n.id ? C.accent : "transparent"}`,
            transition: "all 0.2s",
          }}>
            {n.icon} {n.label.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px" }}>
        {pages[page]}
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "20px", borderTop: `1px solid ${C.border}`, color: C.textMuted, fontSize: 10, fontFamily: "monospace", letterSpacing: 2 }}>
        MAJISMART v1.0 · USIU-AFRICA INNOVATION CHALLENGE 2026 · SDG 6 + SDG 11
      </div>
    </div>
  );
}
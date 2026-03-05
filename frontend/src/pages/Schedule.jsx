import { useState } from "react";
import { C } from "../lib/constants";
import { schedules as initialSchedules } from "../lib/utils";
import Card from "../components/Card";
import Label from "../components/Label";

// ══════════════════════════════════════════════════════════════════════════
// PAGE: SCHEDULE (Farmer Mode)
// ══════════════════════════════════════════════════════════════════════════
const SchedulePage = () => {
  const [items, setItems] = useState(initialSchedules);
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

export default SchedulePage;


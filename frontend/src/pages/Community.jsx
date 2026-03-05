import { C } from "../lib/constants";
import { communityData } from "../lib/utils";
import Card from "../components/Card";
import Label from "../components/Label";

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

export default CommunityPage;


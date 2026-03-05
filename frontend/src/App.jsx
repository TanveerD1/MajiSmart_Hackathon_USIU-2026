import { useState, useEffect } from "react";
import { C, NAV_ITEMS } from "./lib/constants";
import { generateReading, buildHistory } from "./lib/utils";
import StatusPill from "./components/StatusPill";
import HomePage from "./pages/Home";
import AnalyticsPage from "./pages/Analytics";
import CommunityPage from "./pages/Community";
import SchedulePage from "./pages/Schedule";

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

  const renderPage = () => {
    switch (page) {
      case "home":
        return <HomePage flow={flow} status={status} history={history} scenario={scenario} setScenario={setScenario} />;
      case "analytics":
        return <AnalyticsPage history={history} />;
      case "community":
        return <CommunityPage />;
      case "schedule":
        return <SchedulePage />;
      default:
        return <HomePage flow={flow} status={status} history={history} scenario={scenario} setScenario={setScenario} />;
    }
  };

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
        {renderPage()}
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "20px", borderTop: `1px solid ${C.border}`, color: C.textMuted, fontSize: 10, fontFamily: "monospace", letterSpacing: 2 }}>
        MAJISMART v1.0 · USIU-AFRICA INNOVATION CHALLENGE 2026 · SDG 6 + SDG 11
      </div>
    </div>
  );
}


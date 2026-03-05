// ── Simulated live data ────────────────────────────────────────────────────
export const generateReading = (scenario) => {
  const noise = () => (Math.random() - 0.5) * 0.3;
  switch (scenario) {
    case "leak": return Math.max(0, 1.4 + noise());
    case "irrigation": return Math.max(0, 42 + noise() * 8);
    case "normal": return Math.max(0, 8 + noise() * 3);
    default: return Math.max(0, noise() * 0.1);
  }
};

export const buildHistory = () => {
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

export const communityData = [
  { name: "Block A (You)", usage: 3200, rank: 2 },
  { name: "Block B", usage: 5800, rank: 5 },
  { name: "Block C", usage: 4100, rank: 3 },
  { name: "Block D", usage: 6900, rank: 6 },
  { name: "Block E", usage: 2900, rank: 1 },
  { name: "Block F", usage: 4700, rank: 4 },
];

export const schedules = [
  { id: 1, label: "Garden Irrigation", days: "Mon, Wed, Fri", time: "06:00–07:30", active: true },
  { id: 2, label: "Roof Tank Fill", days: "Sunday", time: "08:00–09:00", active: false },
];


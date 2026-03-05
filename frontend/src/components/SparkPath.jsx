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

export default SparkPath;


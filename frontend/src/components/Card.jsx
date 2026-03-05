import { C } from "../lib/constants";

// ── Card wrapper ───────────────────────────────────────────────────────────
const Card = ({ children, style = {}, glow }) => (
  <div style={{
    background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: 20,
    boxShadow: glow ? `0 0 24px ${glow}20, inset 0 1px 0 ${C.border}` : `inset 0 1px 0 ${C.border}`,
    ...style,
  }}>{children}</div>
);

export default Card;


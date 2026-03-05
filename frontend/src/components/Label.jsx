import { C } from "../lib/constants";

const Label = ({ children }) => (
  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace", letterSpacing: 3, marginBottom: 8, textTransform: "uppercase" }}>
    {children}
  </div>
);

export default Label;


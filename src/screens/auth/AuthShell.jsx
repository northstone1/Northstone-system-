import { FOREST, FOREST_DEEP, GOLD, PARCHMENT, INK } from "../../lib/brand";

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: PARCHMENT,
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          borderRadius: 14,
          border: "1px solid #eae6db",
          padding: "32px 30px",
          boxShadow: "0 10px 30px rgba(15,42,32,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              border: `1.5px solid ${GOLD}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: GOLD,
              fontFamily: "'Playfair Display', serif",
              fontWeight: 700,
              flexShrink: 0,
              background: FOREST_DEEP,
            }}
          >
            N
          </div>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 15, color: INK }}>
              NORTHSTONE
            </div>
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: GOLD }}>DESIGN & BUILD</div>
          </div>
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: INK, marginBottom: 4 }}>
          {title}
        </div>
        {subtitle && <div style={{ fontSize: 13, color: "#6b6a63", marginBottom: 20 }}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}

export const labelStyle = { display: "block", fontSize: 12, color: "#6b6a63", fontWeight: 600 };
export const errorStyle = { marginTop: 12, padding: "9px 12px", background: "#fbeaea", color: "#a33", borderRadius: 7, fontSize: 12.5 };
export const noticeStyle = { marginTop: 12, marginBottom: 16, padding: "9px 12px", background: "#eef6f0", color: FOREST, borderRadius: 7, fontSize: 12.5 };
export const primaryButtonStyle = (disabled) => ({
  width: "100%",
  marginTop: 20,
  padding: 12,
  background: disabled ? "#ccc" : FOREST,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 13.5,
  cursor: disabled ? "default" : "pointer",
});
export const linksRowStyle = { display: "flex", justifyContent: "space-between", marginTop: 18, flexWrap: "wrap", gap: 8 };
export const linkButtonStyle = {
  background: "none",
  border: "none",
  color: FOREST,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
  textDecoration: "underline",
};

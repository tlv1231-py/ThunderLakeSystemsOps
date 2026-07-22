import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "#000",
          border: "1.5px solid rgba(255,255,255,0.85)",
          borderRadius: "5px",
          display: "flex",
          flexDirection: "column",
          padding: "3px 3px 2px 3px",
        }}
      >
        {/* Three terminal chrome dots */}
        <div style={{ display: "flex", gap: "1.5px" }}>
          <div style={{ width: 2, height: 2, borderRadius: "50%", background: "rgba(255,255,255,0.65)" }} />
          <div style={{ width: 2, height: 2, borderRadius: "50%", background: "rgba(255,255,255,0.65)" }} />
          <div style={{ width: 2, height: 2, borderRadius: "50%", background: "rgba(255,255,255,0.65)" }} />
        </div>

        {/* tls */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: "-0.5px",
          }}
        >
          tls
        </div>

        {/* prompt */}
        <div style={{ display: "flex", color: "rgba(255,255,255,0.5)", fontSize: 5, fontWeight: 700 }}>
          {">"}_
        </div>
      </div>
    ),
    { ...size }
  );
}

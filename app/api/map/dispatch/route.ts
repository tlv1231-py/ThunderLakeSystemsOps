import { NextResponse } from "next/server";

// PulsePoint agency IDs to probe for Stamford CT Fire Rescue
// These are best-effort; PulsePoint doesn't publish a public agency directory.
const AGENCY_IDS = ["ECA001", "ECA002", "CTSFRD", "SFRD", "CTSFR"];

export async function GET() {
  for (const agencyId of AGENCY_IDS) {
    try {
      const res = await fetch(
        `https://web.pulsepoint.org/DB/giba.php?agency_id=${agencyId}`,
        {
          headers: { Accept: "*/*", "User-Agent": "Mozilla/5.0" },
          next: { revalidate: 0 },
          signal: AbortSignal.timeout(4000),
        }
      );
      if (!res.ok) continue;
      const text = await res.text();
      if (text.trim().startsWith("{")) {
        const data = JSON.parse(text);
        const raw: any[] = data.incidents?.active ?? data.active ?? [];
        if (raw.length > 0) {
          return NextResponse.json({
            agencyId,
            incidents: normalizeIncidents(raw),
          });
        }
      }
    } catch {}
  }
  // Monitoring state — no active data found; layer shows as "watching"
  return NextResponse.json({ agencyId: null, incidents: [], monitoring: true });
}

function normalizeIncidents(raw: any[]): any[] {
  return raw
    .map((inc: any) => ({
      id:       inc.ID   ?? inc.id   ?? "",
      callType: inc.CT   ?? inc.callType ?? inc.type ?? "Unknown",
      address:  inc.A    ?? inc.address  ?? "",
      lat:      parseFloat(inc.Y ?? inc.lat ?? inc.Lat ?? "0") || null,
      lon:      parseFloat(inc.X ?? inc.lon ?? inc.Lon ?? "0") || null,
      unit:     inc.Unit ?? inc.unit ?? "",
      timestamp: inc.PD  ?? inc.timestamp ?? "",
    }))
    .filter((i: any) => i.lat && i.lon);
}

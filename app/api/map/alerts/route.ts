import { NextResponse } from "next/server";

// Proxies NWS alerts and injects serverNow so all clients anchor
// elapsed-time counters to the same server clock — no drift across devices.
export async function GET() {
  try {
    const res = await fetch("https://api.weather.gov/alerts/active?area=CT", {
      headers: { "User-Agent": "ThunderLakeSystems/1.0 (tlevander.py@gmail.com)" },
      next: { revalidate: 0 }, // never cache — serverNow must be accurate
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`NWS ${res.status}`);
    const data = await res.json();
    return NextResponse.json(
      { features: data.features ?? [], serverNow: Date.now() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ features: [], serverNow: Date.now() });
  }
}

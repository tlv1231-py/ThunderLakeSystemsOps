import { NextResponse } from "next/server";

// NOAA Aviation Weather Center — METAR for Stamford-area airports
// KBDR=Bridgeport (closest), KHPN=Westchester (north), KJFK=JFK (SE), KEWR=Newark (SW)
// Dynamic (no ISR) — METARs update hourly + SPECI anytime; serve fresh on every request.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(
      "https://aviationweather.gov/api/data/metar?ids=KBDR,KHPN,KJFK,KEWR&format=json&hours=1",
      {
        headers: { "User-Agent": "ThunderLakeSystems/1.0 (tlevander.py@gmail.com)" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) throw new Error(`AWC ${res.status}`);
    const data: any[] = await res.json();
    return NextResponse.json({ stations: data });
  } catch {
    return NextResponse.json({ stations: [] });
  }
}

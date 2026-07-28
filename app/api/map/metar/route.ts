import { NextResponse } from "next/server";

// NOAA Aviation Weather Center — METAR for NYC-area airports
// KJFK=JFK (south), KEWR=Newark (SW) — distinct from Storm Obs stations to avoid overlap
// Updates every ~50min (routine) or anytime (SPECI). Polled every 60s client-side.
export const revalidate = 60;

export async function GET() {
  try {
    const res = await fetch(
      "https://aviationweather.gov/api/data/metar?ids=KJFK,KEWR&format=json&hours=1",
      {
        headers: { "User-Agent": "ThunderLakeSystems/1.0 (tlevander.py@gmail.com)" },
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) throw new Error(`AWC ${res.status}`);
    const data: any[] = await res.json();
    return NextResponse.json(
      { stations: data },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
    );
  } catch {
    return NextResponse.json({ stations: [] });
  }
}

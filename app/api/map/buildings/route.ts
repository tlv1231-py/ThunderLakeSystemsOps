import { NextResponse } from "next/server";

// Wide bbox: CT + LI + NYC metro — populated place nodes for "city lights" effect
const BBOX = "40.3,-74.5,41.8,-71.7";

// 24h ISR — must be route-level; next:{revalidate} on a POST fetch is ignored by Next.js Data Cache
export const revalidate = 86400;

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function queryOverpass(query: string): Promise<any> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) return await res.json();
    } catch {
      // try next endpoint
    }
  }
  return null;
}

export async function GET() {
  // Fetch populated place nodes (cities, towns, villages) — renders as city lights at regional zoom
  const query = `[out:json][timeout:10];
node["place"~"^(city|town|village|borough|suburb|hamlet)$"](${BBOX});
out qt 1200;`;

  try {
    const data = await queryOverpass(query);
    if (!data) return NextResponse.json({ buildings: [], error: "overpass_timeout" });
    const buildings = (data.elements ?? [])
      .filter((el: any) => el.lat != null && el.lon != null)
      .map((el: any) => [el.lat, el.lon]);
    return NextResponse.json({ buildings });
  } catch (e: any) {
    return NextResponse.json({ buildings: [], error: String(e) });
  }
}

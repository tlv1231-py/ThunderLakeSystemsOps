import { NextResponse } from "next/server";

// Stamford core — smaller bbox keeps Overpass fast enough for Vercel's 10s limit
const BBOX = "41.02,-73.58,41.10,-73.47";

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
        signal: AbortSignal.timeout(9000),
      });
      if (res.ok) return await res.json();
    } catch {
      // try next endpoint
    }
  }
  return null;
}

export async function GET() {
  const query = `[out:json][timeout:8];
way["building"](${BBOX});
out center qt;`;

  try {
    const data = await queryOverpass(query);
    if (!data) return NextResponse.json({ buildings: [], error: "overpass_timeout" });
    const buildings = (data.elements ?? [])
      .filter((el: any) => el.center?.lat && el.center?.lon)
      .map((el: any) => [el.center.lat, el.center.lon]);
    return NextResponse.json({ buildings });
  } catch (e: any) {
    return NextResponse.json({ buildings: [], error: String(e) });
  }
}

import { NextResponse } from "next/server";

const BBOX = "40.99,-73.66,41.13,-73.43";

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
        next: { revalidate: 86400 }, // 24h — buildings rarely change
        signal: AbortSignal.timeout(35000),
      });
      if (res.ok) return await res.json();
    } catch {
      // try next endpoint
    }
  }
  return null;
}

export async function GET() {
  const query = `[out:json][timeout:30];
way["building"](${BBOX});
out center;`;

  try {
    const data = await queryOverpass(query);
    if (!data) return NextResponse.json({ buildings: [] });
    // Return minimal [lat,lon] pairs only — no tags needed for the lights overlay
    const buildings = (data.elements ?? [])
      .filter((el: any) => el.center?.lat && el.center?.lon)
      .map((el: any) => [el.center.lat, el.center.lon]);
    return NextResponse.json({ buildings });
  } catch {
    return NextResponse.json({ buildings: [] });
  }
}

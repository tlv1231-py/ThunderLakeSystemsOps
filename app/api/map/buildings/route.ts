import { NextResponse } from "next/server";

const BBOX = "40.99,-73.66,41.13,-73.43";

export async function GET() {
  const query = `[out:json][timeout:35];
way["building"](${BBOX});
out center;`;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      next: { revalidate: 86400 }, // 24h — buildings rarely change
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) return NextResponse.json({ buildings: [] });
    const data = await res.json();
    // Return minimal [lat,lon] pairs only — no tags needed for the lights overlay
    const buildings = (data.elements ?? [])
      .filter((el: any) => el.center?.lat && el.center?.lon)
      .map((el: any) => [el.center.lat, el.center.lon]);
    return NextResponse.json({ buildings });
  } catch {
    return NextResponse.json({ buildings: [] });
  }
}

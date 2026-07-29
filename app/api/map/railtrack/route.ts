import { NextResponse } from "next/server";

// Stamford metro only — small bbox so Overpass responds in <5s within Vercel's 10s limit
const BBOX = "40.95,-73.65,41.15,-73.42";

// 5-minute ISR — if first call times out, poisoned cache expires quickly
export const revalidate = 300;

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export async function GET() {
  const query = `[out:json][timeout:5];
way["railway"="rail"](${BBOX});
out geom;`;

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const ways = (data.elements ?? [])
        .filter((e: any) => e.type === "way" && Array.isArray(e.geometry) && e.geometry.length > 1)
        .map((e: any) => ({
          id: e.id,
          coords: (e.geometry as any[]).map((g: any) => [g.lat, g.lon] as [number, number]),
        }));
      return NextResponse.json({ ways });
    } catch {
      // try next endpoint
    }
  }
  return NextResponse.json({ ways: [] });
}

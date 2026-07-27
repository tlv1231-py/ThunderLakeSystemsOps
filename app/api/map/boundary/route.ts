import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Nominatim returns the administrative boundary polygon for Stamford CT as GeoJSON
    const res = await fetch(
      "https://nominatim.openstreetmap.org/search?q=Stamford%2C+CT%2C+USA&format=json&polygon_geojson=1&limit=5",
      {
        headers: { "User-Agent": "ThunderLakeSystems/1.0 (tlevander.py@gmail.com)" },
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return NextResponse.json({ geojson: null });
    const data = await res.json();
    // Find the first result with a Polygon or MultiPolygon (the city boundary)
    const match = (data as any[]).find(
      (r) => r.geojson?.type === "Polygon" || r.geojson?.type === "MultiPolygon"
    );
    return NextResponse.json({ geojson: match?.geojson ?? null });
  } catch {
    return NextResponse.json({ geojson: null });
  }
}

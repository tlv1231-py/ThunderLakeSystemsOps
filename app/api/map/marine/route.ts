import { NextResponse } from "next/server";

// NOAA CO-OPS tide gauge — Bridgeport CT (nearest active station to Stamford)
const COOPS = { id: "8467150", name: "Bridgeport, CT", lat: 41.17582, lon: -73.18397 };

// NDBC buoys in western Long Island Sound
const NDBC_STATIONS = [
  { id: "44022", name: "Execution Rocks Buoy", lat: 40.883, lon: -73.728 },
];

async function fetchCOOPS() {
  try {
    const url =
      `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` +
      `?date=latest&station=${COOPS.id}&product=water_level` +
      `&datum=MLLW&time_zone=gmt&units=english&format=json&application=ThunderLakeSystems`;
    const res = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const readings: any[] = data.data ?? [];
    const latest = readings[readings.length - 1];
    if (!latest) return null;
    return {
      ...COOPS,
      type: "tide_gauge" as const,
      waterLevel: Math.round(parseFloat(latest.v) * 10) / 10,
      updated: latest.t,
    };
  } catch {
    return null;
  }
}

async function fetchNDBC(station: (typeof NDBC_STATIONS)[0]) {
  try {
    const res = await fetch(
      `https://www.ndbc.noaa.gov/data/latest_obs/${station.id}.txt`,
      { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.split("\n");
    const headerLine = lines.find(l => l.startsWith("#YY"));
    const dataLine   = lines.find(l => l.trim() && !l.startsWith("#"));
    if (!headerLine || !dataLine) return null;

    const fields = headerLine.replace(/^#/, "").trim().split(/\s+/);
    const values = dataLine.trim().split(/\s+/);
    const get = (f: string): number | null => {
      const i = fields.indexOf(f);
      if (i < 0) return null;
      const v = values[i];
      return v === "MM" || v === "999" || v === "9999" ? null : parseFloat(v);
    };

    const wspd = get("WSPD"); // m/s
    const wvht = get("WVHT"); // m
    const atmp = get("ATMP"); // °C
    const wtmp = get("WTMP"); // °C

    return {
      ...station,
      type: "buoy" as const,
      windSpeed:  wspd != null ? Math.round(wspd * 1.944) : null,           // → knots
      windDir:    get("WDIR"),
      waveHeight: wvht != null ? Math.round(wvht * 3.281 * 10) / 10 : null, // → ft
      airTemp:    atmp != null ? Math.round(atmp * 9 / 5 + 32) : null,       // → °F
      waterTemp:  wtmp != null ? Math.round(wtmp * 9 / 5 + 32) : null,       // → °F
      updated:    null as string | null,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const [coops, ...ndbcResults] = await Promise.all([
    fetchCOOPS(),
    ...NDBC_STATIONS.map(s => fetchNDBC(s)),
  ]);
  const stations = [coops, ...ndbcResults].filter(Boolean);
  return NextResponse.json({ stations });
}

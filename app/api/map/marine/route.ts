import { NextResponse } from "next/server";

// NOAA CO-OPS tide/met stations around Long Island Sound
const COOPS_TIDE = [
  { id: "8467150", name: "Bridgeport, CT",    lat: 41.1735,  lon: -73.1815 },
  { id: "8465705", name: "New Haven, CT",     lat: 41.2833,  lon: -72.9167 },
  { id: "8516945", name: "Kings Point, NY",   lat: 40.8108,  lon: -73.7647 },
  { id: "8510560", name: "Port Jefferson, NY", lat: 40.9483, lon: -73.0717 },
  { id: "8461490", name: "New London, CT",    lat: 41.3600,  lon: -72.0900 },
];

// NDBC buoys in/near Long Island Sound
const NDBC_BUOYS = [
  { id: "44040", name: "LI Sound (Offshore)", lat: 41.138, lon: -72.659 },
  { id: "44025", name: "NY Bight",            lat: 40.251, lon: -73.166 },
];

function coopsUrl(stationId: string, product: string) {
  return (
    `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` +
    `?date=latest&station=${stationId}&product=${product}` +
    `&datum=MLLW&time_zone=gmt&units=english&format=json&application=ThunderLakeSystems`
  );
}

async function fetchStation(s: (typeof COOPS_TIDE)[0]) {
  try {
    const [tideRes, windRes, tempRes] = await Promise.all([
      fetch(coopsUrl(s.id, "water_level"),      { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) }),
      fetch(coopsUrl(s.id, "wind"),             { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) }),
      fetch(coopsUrl(s.id, "water_temperature"),{ next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) }),
    ]);

    const tideData = tideRes.ok ? await tideRes.json() : null;
    const windData = windRes.ok ? await windRes.json() : null;
    const tempData = tempRes.ok ? await tempRes.json() : null;

    const tidePt = tideData?.data?.slice(-1)?.[0];
    const windPt = windData?.data?.slice(-1)?.[0];
    const tempPt = tempData?.data?.slice(-1)?.[0];

    if (!tidePt) return null;

    return {
      ...s,
      type: "tide_gauge" as const,
      waterLevel: Math.round(parseFloat(tidePt.v) * 10) / 10,
      waterTemp:  tempPt?.v != null ? Math.round((parseFloat(tempPt.v)) * 10) / 10 : null, // already in °F (english units)
      windSpeed:  windPt?.s != null ? Math.round(parseFloat(windPt.s) * 1.944 * 10) / 10 : null, // m/s → knots
      windDir:    windPt?.d != null ? parseFloat(windPt.d) : null,
      windGust:   windPt?.g != null ? Math.round(parseFloat(windPt.g) * 1.944 * 10) / 10 : null,
      updated:    tidePt.t,
    };
  } catch {
    return null;
  }
}

async function fetchNDBC(b: (typeof NDBC_BUOYS)[0]) {
  try {
    const res = await fetch(
      `https://www.ndbc.noaa.gov/data/realtime2/${b.id}.txt`,
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const text = await res.text();
    // Skip header lines (start with #), take first data line
    const lines = text.split("\n").filter(l => !l.startsWith("#") && l.trim().length > 0);
    if (!lines.length) return null;
    const parts = lines[0].split(/\s+/);
    // Columns: YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP ...
    const toN = (s: string) => (s === "MM" || s == null ? null : parseFloat(s));
    const msToKt = (ms: number | null) => ms != null ? Math.round(ms * 1.944 * 10) / 10 : null;
    const mToFt = (m: number | null) => m != null ? Math.round(m * 3.281 * 10) / 10 : null;
    const cToF  = (c: number | null) => c != null ? Math.round((c * 9/5 + 32) * 10) / 10 : null;
    return {
      ...b,
      type: "buoy" as const,
      windDir:    toN(parts[5]),
      windSpeed:  msToKt(toN(parts[6])),
      windGust:   msToKt(toN(parts[7])),
      waveHeight: mToFt(toN(parts[8])),
      waterTemp:  cToF(toN(parts[14])),
      updated:    `${parts[0]}-${parts[1]}-${parts[2]} ${parts[3]}:${parts[4]} UTC`,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const [coopsResults, ndbcResults] = await Promise.all([
    Promise.all(COOPS_TIDE.map(fetchStation)),
    Promise.all(NDBC_BUOYS.map(fetchNDBC)),
  ]);
  const stations = [...coopsResults, ...ndbcResults].filter(Boolean);
  return NextResponse.json({ stations });
}

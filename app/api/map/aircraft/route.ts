import { NextResponse } from "next/server";

// adsb.lol — free community ADS-B feed, no key required
// Coverage: 70nm radius from Stamford CT covers KJFK/KLGA/KEWR/KHPN/KBDR approach corridors
const CENTER_LAT = 41.05;
const CENTER_LON = -73.54;
const RADIUS_NM  = 70;

export async function GET() {
  try {
    const res = await fetch(
      `https://api.adsb.lol/v2/point/${CENTER_LAT}/${CENTER_LON}/${RADIUS_NM}`,
      {
        headers: { "User-Agent": "ThunderLakeSystems/1.0 (tlevander.py@gmail.com)" },
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return NextResponse.json({ states: [] });
    const data = await res.json();
    const aircraft: any[] = data.ac ?? [];

    // Normalize to the OpenSky array format the map client expects:
    // [icao, callsign, country, _, _, lon, lat, baroAltM, onGround, velMps, track, _, _, _, _, _, geoAltM]
    const states = aircraft
      .filter(a => a.lat != null && a.lon != null)
      .map(a => {
        const onGround = a.alt_baro === "ground";
        const altBaroFt = !onGround && a.alt_baro != null ? Number(a.alt_baro) : null;
        const altGeoFt  = a.alt_geom != null ? Number(a.alt_geom) : null;
        return [
          a.hex ?? "",                                              // [0]  icao24
          ((a.flight ?? "") as string).trim() || (a.hex ?? ""),    // [1]  callsign
          "",                                                       // [2]  country (not in adsb.fi)
          null, null,                                               // [3–4] timestamps
          a.lon,                                                    // [5]  longitude
          a.lat,                                                    // [6]  latitude
          altBaroFt != null ? altBaroFt / 3.281 : null,            // [7]  baro alt → metres
          onGround,                                                 // [8]  on_ground
          a.gs != null ? Number(a.gs) / 1.944 : null,              // [9]  ground speed → m/s
          a.track ?? 0,                                             // [10] true track
          null, null, null, null, null,                             // [11–15]
          altGeoFt != null ? altGeoFt / 3.281 : null,              // [16] geo alt → metres
          ((a.t ?? "") as string).trim(),                           // [17] ICAO type code (e.g. "B738")
          ((a.r ?? "") as string).trim(),                           // [18] registration (e.g. "N321DD")
          ((a.ownOp ?? a.desc ?? "") as string).trim(),             // [19] operator / description
        ];
      });

    return NextResponse.json({ states });
  } catch {
    return NextResponse.json({ states: [] });
  }
}

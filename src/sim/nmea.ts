import type { SimulationState } from '../types/sailing';
import { HANDCRAFTED_HUBS } from './worldHubs';

function computeNmeaChecksum(body: string): string {
  let xor = 0;
  for (let i = 0; i < body.length; i++) {
    xor ^= body.charCodeAt(i);
  }
  return xor.toString(16).toUpperCase().padStart(2, '0');
}

function wrapNmea(body: string): string {
  return `$${body}*${computeNmeaChecksum(body)}`;
}

function formatNmeaCoord(decimalDeg: number, isLat: boolean): string {
  const abs = Math.abs(decimalDeg);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  const degPad = isLat ? String(deg).padStart(2, '0') : String(deg).padStart(3, '0');
  const minStr = min.toFixed(3).padStart(6, '0');
  const hemi = isLat ? (decimalDeg >= 0 ? 'N' : 'S') : decimalDeg >= 0 ? 'E' : 'W';
  return `${degPad}${minStr},${hemi}`;
}

export interface NmeaFrame {
  gprmc: string;
  iihdt: string;
  iivhw: string;
  iimwv: string;
  iidpt: string;
  latStr: string;
  lonStr: string;
}

/**
 * Generates authentic Virtual Sailor NG-style NMEA 0183 sentences with valid XOR checksums
 * from live vessel telemetry (interpolated along the active passage leg).
 */
export function buildNmeaSentences(sim: SimulationState): NmeaFrame {
  const origin = HANDCRAFTED_HUBS.find((h) => h.id === sim.passage.fromHubId) ?? HANDCRAFTED_HUBS[0];
  const dest = HANDCRAFTED_HUBS.find((h) => h.id === sim.passage.toHubId) ?? HANDCRAFTED_HUBS[1];

  const t = Math.max(0, Math.min(1.1, sim.passage.xNm / Math.max(1, sim.passage.totalDistanceNm)));
  const lat = origin.lat + (dest.lat - origin.lat) * t + sim.passage.zNm / 60;
  const lon = origin.lon + (dest.lon - origin.lon) * t;

  const hh = Math.floor(sim.weather.timeOfDayHours) % 24;
  const mm = Math.floor((sim.weather.timeOfDayHours * 60) % 60);
  const ss = Math.floor((sim.weather.timeOfDayHours * 3600) % 60);
  const utc = `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}${String(ss).padStart(2, '0')}.00`;

  const latCoord = formatNmeaCoord(lat, true);
  const lonCoord = formatNmeaCoord(lon, false);

  const gprmc = wrapNmea(
    `GPRMC,${utc},A,${latCoord},${lonCoord},${sim.sogKts.toFixed(1)},${sim.cogDeg.toFixed(1)},241126,004.2,W`,
  );
  const iihdt = wrapNmea(`IIHDT,${sim.headingDeg.toFixed(1)},T`);
  const iivhw = wrapNmea(
    `IIVHW,${sim.headingDeg.toFixed(1)},T,,M,${sim.boatSpeedKts.toFixed(1)},N,${(sim.boatSpeedKts * 1.852).toFixed(1)},K`,
  );
  const awa360 = ((sim.apparentWindAngleDeg % 360) + 360) % 360;
  const iimwv = wrapNmea(
    `IIMWV,${awa360.toFixed(1)},R,${sim.apparentWindSpeedKts.toFixed(1)},N,A`,
  );
  const iidpt = wrapNmea(`IIDPT,${sim.passage.depthM.toFixed(1)},0.0`);

  return {
    gprmc,
    iihdt,
    iivhw,
    iimwv,
    iidpt,
    latStr: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`,
    lonStr: `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`,
  };
}

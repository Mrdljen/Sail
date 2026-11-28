import { CROATIA_COAST_DATA } from './croatiaCoastData.js';

/** User-defined game rule: water shallower than this is not sailable. */
export const CROATIA_MIN_SAILABLE_DEPTH_M = 2;

const WEB_MERCATOR_EARTH_RADIUS_M = 6378137;
const WEB_MERCATOR_MAX_LATITUDE_DEG = 85.0511287798066;

/**
 * @typedef {{ lon: number, lat: number }} GeoPoint
 * @typedef {{ east: number, north: number }} ProjectedPoint
 * @typedef {{
 *   start: ProjectedPoint,
 *   forward: ProjectedPoint,
 *   left: ProjectedPoint,
 *   projectedMetersPerNm: number,
 *   totalDistanceNm: number,
 * }} CroatiaRouteFrame
 */

function projectLonLat({ lon, lat }) {
  const longitudeRad = (lon * Math.PI) / 180;
  const boundedLatitude = Math.max(
    -WEB_MERCATOR_MAX_LATITUDE_DEG,
    Math.min(WEB_MERCATOR_MAX_LATITUDE_DEG, lat),
  );
  const latitudeRad = (boundedLatitude * Math.PI) / 180;
  return {
    east: WEB_MERCATOR_EARTH_RADIUS_M * longitudeRad,
    north: WEB_MERCATOR_EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + latitudeRad / 2)),
  };
}

function unprojectEastNorth({ east, north }) {
  return {
    lon: (east / WEB_MERCATOR_EARTH_RADIUS_M) * (180 / Math.PI),
    lat: (2 * Math.atan(Math.exp(north / WEB_MERCATOR_EARTH_RADIUS_M)) - Math.PI / 2) * (180 / Math.PI),
  };
}

function ringContainsPoint(ring, lon, lat) {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crossesLatitude = (yi > lat) !== (yj > lat);
    if (crossesLatitude && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonContainsPoint(rings, lon, lat) {
  if (!rings.length || !ringContainsPoint(rings[0], lon, lat)) return false;
  return !rings.slice(1).some((hole) => ringContainsPoint(hole, lon, lat));
}

/** True for Croatian land and islands in the bundled Natural Earth coastline geometry. */
export function croatiaContainsLand(lon, lat) {
  for (const feature of CROATIA_COAST_DATA.features) {
    const polygons = feature.geometry.coordinates;
    if (polygons.some((rings) => polygonContainsPoint(rings, lon, lat))) return true;
  }
  return false;
}

/**
 * Creates a route-local frame matching the simulation's along-track and cross-track axes.
 * The endpoints are exact; Web Mercator supplies the same projected-meter scale in both axes.
 */
export function createCroatiaRouteFrame(fromHub, toHub, totalDistanceNm) {
  if (!(totalDistanceNm > 0)) throw new RangeError('Croatia route distance must be positive');
  const start = projectLonLat(fromHub);
  const end = projectLonLat(toHub);
  const deltaEast = end.east - start.east;
  const deltaNorth = end.north - start.north;
  const projectedLengthM = Math.hypot(deltaEast, deltaNorth);
  if (!(projectedLengthM > 0)) throw new RangeError('Croatia route endpoints must be distinct');
  const forward = { east: deltaEast / projectedLengthM, north: deltaNorth / projectedLengthM };
  return {
    start,
    forward,
    left: { east: -forward.north, north: forward.east },
    projectedMetersPerNm: projectedLengthM / totalDistanceNm,
    totalDistanceNm,
  };
}

/** Convert local route progress back to a geographic point for coast collision checks. */
export function croatiaRoutePositionToGeo(frame, xNm, zNm) {
  const alongM = xNm * frame.projectedMetersPerNm;
  const crossM = zNm * frame.projectedMetersPerNm;
  return unprojectEastNorth({
    east: frame.start.east + frame.forward.east * alongM + frame.left.east * crossM,
    north: frame.start.north + frame.forward.north * alongM + frame.left.north * crossM,
  });
}

/** True when a simulated Croatian passage position lies on the land mask. */
export function croatiaPassageIsOnLand(frame, xNm, zNm) {
  const point = croatiaRoutePositionToGeo(frame, xNm, zNm);
  return croatiaContainsLand(point.lon, point.lat);
}

/**
 * Map one coastline point into the boat-centered Three.js passage frame.
 * `sceneMetersPerNm` is supplied by the existing ocean scene scale.
 */
export function croatiaPointToScene(point, frame, boatXNm, boatZNm, sceneMetersPerNm) {
  const projected = projectLonLat(point);
  const deltaEast = projected.east - frame.start.east;
  const deltaNorth = projected.north - frame.start.north;
  const alongNm = (deltaEast * frame.forward.east + deltaNorth * frame.forward.north) / frame.projectedMetersPerNm;
  const crossNm = (deltaEast * frame.left.east + deltaNorth * frame.left.north) / frame.projectedMetersPerNm;
  return {
    x: (alongNm - boatXNm) * sceneMetersPerNm,
    z: -(crossNm - boatZNm) * sceneMetersPerNm,
  };
}

/** Return a new array of the coastline rings in one multipolygon, in route-local scene coordinates. */
export function croatiaPolygonToScene(rings, frame, boatXNm, boatZNm, sceneMetersPerNm) {
  return rings.map((ring) =>
    ring.map(([lon, lat]) => croatiaPointToScene({ lon, lat }, frame, boatXNm, boatZNm, sceneMetersPerNm)),
  );
}

/** Bounds derived from the bundled geometry, useful for regional chart projection. */
export function getCroatiaCoastBounds() {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const feature of CROATIA_COAST_DATA.features) {
    for (const polygon of feature.geometry.coordinates) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          minLon = Math.min(minLon, lon);
          minLat = Math.min(minLat, lat);
          maxLon = Math.max(maxLon, lon);
          maxLat = Math.max(maxLat, lat);
        }
      }
    }
  }
  return { minLon, minLat, maxLon, maxLat };
}

export { CROATIA_COAST_DATA };

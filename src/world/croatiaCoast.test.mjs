import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CROATIA_COAST_DATA,
  CROATIA_MIN_SAILABLE_DEPTH_M,
  createCroatiaRouteFrame,
  croatiaContainsLand,
  croatiaDepthAtPassage,
  croatiaPassageIsOnLand,
  croatiaPointToScene,
  croatiaRouteBearingDeg,
  croatiaRoutePositionToGeo,
  getCroatiaCoastBounds,
  isCroatiaPassage,
  resolveCroatiaPassageStep,
} from './croatiaCoast.js';

test('bundled Croatia coastline has all county polygons and usable bounds', () => {
  const bounds = getCroatiaCoastBounds();
  assert.equal(CROATIA_COAST_DATA.features.length, 21);
  assert.ok(bounds.minLon > 13 && bounds.minLon < 14);
  assert.ok(bounds.maxLon > 19 && bounds.maxLon < 20);
  assert.ok(bounds.minLat > 42 && bounds.minLat < 43);
  assert.ok(bounds.maxLat > 46 && bounds.maxLat < 47);
  assert.ok(CROATIA_COAST_DATA.features.every((feature) => feature.geometry.type === 'MultiPolygon'));
});

test('the land mask distinguishes the Croatian mainland, an island, and Adriatic water', () => {
  assert.equal(croatiaContainsLand(15.9819, 45.815), true, 'Zagreb is land');
  assert.equal(croatiaContainsLand(16.65, 43.17), true, 'the interior of Hvar is land');
  assert.equal(croatiaContainsLand(14.5, 44.2), false, 'the west Adriatic approach is water');
  assert.equal(croatiaContainsLand(10, 44), false, 'points outside the Croatian region stay water');
});

test('route coordinates round-trip to the two geographic endpoints', () => {
  const from = { lon: 15.23, lat: 44.12 };
  const to = { lon: 18.09, lat: 42.65 };
  const frame = createCroatiaRouteFrame(from, to, 100);
  const start = croatiaRoutePositionToGeo(frame, 0, 0);
  const finish = croatiaRoutePositionToGeo(frame, 100, 0);
  assert.ok(Math.abs(start.lon - from.lon) < 1e-8);
  assert.ok(Math.abs(start.lat - from.lat) < 1e-8);
  assert.ok(Math.abs(finish.lon - to.lon) < 1e-8);
  assert.ok(Math.abs(finish.lat - to.lat) < 1e-8);
});

test('Croatian route helpers preserve the regional route network and initial bearing', () => {
  const zadar = { lon: 15.23, lat: 44.12 };
  const split = { lon: 16.45, lat: 43.45 };
  assert.equal(isCroatiaPassage('croatia-zadar', 'croatia-split'), true);
  assert.equal(isCroatiaPassage('croatia-zadar', 'croatia-zadar'), false);
  assert.equal(isCroatiaPassage('lanzarote', 'croatia-split'), false);
  const bearing = croatiaRouteBearingDeg(zadar, split);
  assert.ok(bearing > 90 && bearing < 180, `Expected SE course bearing, got ${bearing}`);
});

test('the three outer anchorage starts are water in every directed route', () => {
  const ports = [
    { lon: 15.23, lat: 44.12, distanceTo: [0, 64, 154] },
    { lon: 16.45, lat: 43.45, distanceTo: [64, 0, 90] },
    { lon: 18.12, lat: 42.64, distanceTo: [154, 90, 0] },
  ];
  for (let fromIndex = 0; fromIndex < ports.length; fromIndex += 1) {
    for (let toIndex = 0; toIndex < ports.length; toIndex += 1) {
      if (fromIndex === toIndex) continue;
      const from = ports[fromIndex];
      const to = ports[toIndex];
      const frame = createCroatiaRouteFrame(from, to, from.distanceTo[toIndex]);
      assert.equal(croatiaContainsLand(from.lon, from.lat), false, 'anchorage coordinate is water');
      assert.equal(croatiaPassageIsOnLand(frame, 0.25, 0), false, 'initial boat spawn is in water');
    }
  }
});

test('the local coast mesh places the boat position at the scene origin', () => {
  const hub = { lon: 16.44, lat: 43.17 };
  const frame = createCroatiaRouteFrame(hub, { lon: 18.09, lat: 42.65 }, 80);
  const scene = croatiaPointToScene(hub, frame, 0, 0, 55);
  assert.ok(Math.abs(scene.x) < 1e-9);
  assert.ok(Math.abs(scene.z) < 1e-9);
});

test('land points in route space are blocked and the user sailability threshold is 2 m', () => {
  const from = { lon: 15.9819, lat: 45.815 };
  const to = { lon: 16.44, lat: 43.17 };
  const frame = createCroatiaRouteFrame(from, to, 100);
  assert.equal(croatiaPassageIsOnLand(frame, 0, 0), true);
  assert.equal(croatiaDepthAtPassage(frame, 0, 0), 0);
  assert.equal(CROATIA_MIN_SAILABLE_DEPTH_M, 2);
  const collision = resolveCroatiaPassageStep(
    frame,
    { xNm: 12, zNm: 1 },
    { xNm: 0, zNm: 0 },
  );
  assert.deepEqual(collision, { xNm: 12, zNm: 1, depthM: 0, hitLand: true });
  const openWaterFrame = createCroatiaRouteFrame(
    { lon: 14.4, lat: 44.2 },
    { lon: 14.6, lat: 44.2 },
    10,
  );
  assert.equal(croatiaDepthAtPassage(openWaterFrame, 1, 0), 20);
  const clearWater = resolveCroatiaPassageStep(
    openWaterFrame,
    { xNm: 1, zNm: 0 },
    { xNm: 2, zNm: 0 },
  );
  assert.deepEqual(clearWater, { xNm: 2, zNm: 0, depthM: 20, hitLand: false });

  const zadarToSplit = createCroatiaRouteFrame(
    { lon: 15.23, lat: 44.12 },
    { lon: 16.45, lat: 43.45 },
    64,
  );
  const crossing = resolveCroatiaPassageStep(
    zadarToSplit,
    { xNm: 0.5, zNm: 0 },
    { xNm: 64, zNm: 0 },
  );
  assert.equal(crossing.hitLand, true, 'intermediate land blocks a long movement step');
  assert.equal(crossing.xNm, 0.5, 'collision holds the last safe point');
});

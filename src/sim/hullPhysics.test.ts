import test from 'node:test';
import assert from 'node:assert/strict';
import { BOAT_SPECS } from './boats';
import { solveFoilAndManeuver } from './foilPhysics';
import {
  byTheLeeDelftResiduaryResistanceN,
  byTheLeeDelftWettedSurfaceHeelCorrection,
  calcITTC57FrictionCoeff,
  computeGzRightingMomentNm,
  computeWaveSlamAndSurfForces,
  DELFT_WATER_DENSITY,
  evalGzRightingArmM,
  evaluateHullResistance,
  validateDelftRange,
} from './hullPhysics';
import { createInitialSimulationState } from './physics';
import type { DelftHullParams } from '../types/sailing';

/**
 * Golden outputs generated directly by running /tmp/gh-refs/bythelee
 * (Delft.js, Hull.js, Water.js, SailEnv.js) on the default bythelee hull (lwl=10.02, delC=7.63).
 */
const BYTHELEE_DEFAULT_HULL: DelftHullParams = {
  lwlM: 10.02,
  bwlM: 3.17,
  tcM: 0.57,
  delCM3: 7.63,
  cp: 0.56,
  cm: 0.752,
  lcbPct: 0.035,
  lcfPct: 0.065,
  awM2: 22.7,
  swcM2: 25.2,
  roughnessK: 5e-6,
};

test('bythelee Delft residuary resistance matches reference outputs exactly', () => {
  const goldenRr: Array<[number, number]> = [
    [1.0, 0],
    [2.0, 32.795],
    [3.0, 216.7211],
    [3.5, 527.5842],
    [4.0, 1440.9509],
    [5.0, 5382.5326],
  ];

  for (const [speedMs, expRr] of goldenRr) {
    const rr = byTheLeeDelftResiduaryResistanceN(BYTHELEE_DEFAULT_HULL, speedMs, true);
    assert.ok(
      Math.abs(rr - expRr) < 1e-2,
      `Delft residuary @ ${speedMs} m/s: got ${rr.toFixed(4)}, expected ${expRr}`,
    );
  }
});

test('bythelee ITTC-57 frictional drag coefficient & wetted-surface heel correction match reference outputs', () => {
  const goldenCf: Array<[number, number, number]> = [
    [1.0, 7014000, 0.0031937],
    [2.0, 14028000, 0.0028311],
    [3.0, 21042000, 0.0026469],
    [4.0, 28056000, 0.0025269],
    [5.0, 35070000, 0.0024393],
  ];

  for (const [speedMs, expRe, expCf] of goldenCf) {
    const { re, cf } = calcITTC57FrictionCoeff(
      speedMs,
      BYTHELEE_DEFAULT_HULL.lwlM,
      BYTHELEE_DEFAULT_HULL.roughnessK,
    );
    assert.ok(Math.abs(re - expRe) < 1, `Re @ ${speedMs}: ${re} vs ${expRe}`);
    assert.ok(Math.abs(cf - expCf) < 1e-6, `Cf @ ${speedMs}: ${cf} vs ${expCf}`);

    // Frictional drag uses 0.5 * rho * V^2 * Cf * Swc (Larsson p. 66)
    const drag = 0.5 * DELFT_WATER_DENSITY * speedMs * speedMs * cf * BYTHELEE_DEFAULT_HULL.swcM2;
    assert.ok(drag > 0);
  }

  const goldenHeelCorr: Array<[number, number]> = [
    [5, 1.001126],
    [10, 0.989333],
    [15, 0.976256],
    [20, 0.958388],
    [25, 0.942388],
    [30, 0.926544],
    [35, 0.916133],
    [45, 0.886292],
  ];
  for (const [deg, expCorr] of goldenHeelCorr) {
    const corr = byTheLeeDelftWettedSurfaceHeelCorrection(BYTHELEE_DEFAULT_HULL, deg, false);
    assert.ok(
      Math.abs(corr - expCorr) < 1e-5,
      `Wetted heel corr @ ${deg}°: got ${corr}, expected ${expCorr}`,
    );
  }
});

test('Delft DSYHS valid-range checker flags long-keel Rustler 36 with warning & applies correction factor', () => {
  const contessa = BOAT_SPECS['contessa-32'];
  const cCheck = validateDelftRange('contessa-32', contessa.delftHull, contessa.keelType, false);
  assert.equal(cCheck.inRange, true, 'Contessa 32 fin-skeg sits inside Delft DSYHS bounds');
  assert.equal(cCheck.correctionFactor, 1.0);

  const rustler = BOAT_SPECS['rustler-36'];
  const origWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (msg?: unknown) => warnings.push(String(msg ?? ''));
  try {
    const rCheck = validateDelftRange('rustler-36', rustler.delftHull, rustler.keelType, true);
    assert.equal(rCheck.inRange, false, 'Rustler 36 long-keel hull sits outside DSYHS fin-keel range');
    assert.ok(rCheck.correctionFactor > 1.0);
    assert.ok(warnings.some((w) => w.includes('rustler-36')), 'Logs Delft out-of-range warning');
  } finally {
    console.warn = origWarn;
  }

  // Evaluate full resistance at hull speed regime on Contessa 32 vs Rustler 36
  const cRes = evaluateHullResistance('contessa-32', contessa.delftHull, 3.8, 12, contessa.keelType, 1, 1, 1, false);
  const rRes = evaluateHullResistance('rustler-36', rustler.delftHull, 3.8, 12, rustler.keelType, 1, 1, 1, false);
  assert.ok(cRes.residuaryDragN > cRes.frictionalDragN, 'Near hull speed wave-making residuary exceeds skin friction');
  assert.ok(rRes.totalDragN > cRes.totalDragN, 'Heavier long-keel Rustler 36 has greater total resistance at 3.8 m/s');
});

test('Per-boat GZ righting-moment curve matches GM_0 slope, peaks at maxGzAngleDeg, and vanishes at AVS', () => {
  const elan = BOAT_SPECS['elan-19'];
  const contessa = BOAT_SPECS['contessa-32'];

  // Initial slope near 0° equals GM_0 * rad
  const gz1 = evalGzRightingArmM(1, contessa.gzCurve);
  const expectedSmall = contessa.gzCurve.gm0M * (Math.PI / 180);
  assert.ok(Math.abs(gz1 - expectedSmall) < 0.002, `GZ(1°)=${gz1} matches GM_0 slope ${expectedSmall}`);

  // Exact peak at maxGzAngleDeg and zero at vanishing stability angle
  const peak = evalGzRightingArmM(contessa.gzCurve.maxGzAngleDeg, contessa.gzCurve);
  assert.ok(Math.abs(peak - contessa.gzCurve.gzMaxM) < 1e-6);
  const pastPeak = evalGzRightingArmM(95, contessa.gzCurve);
  assert.ok(pastPeak > 0 && pastPeak < peak, 'Righting arm decreases beyond maxGzAngleDeg');
  const atAvs = evalGzRightingArmM(contessa.gzCurve.vanishingStabilityDeg, contessa.gzCurve);
  assert.ok(Math.abs(atAvs) < 1e-6, 'Righting arm vanishes at AVS');

  // Signed righting moment opposes heel direction & Contessa 32 >> Elan 19 stiffness
  const rmElan = computeGzRightingMomentNm(elan.displacementKg, 20, elan.gzCurve);
  const rmContessa = computeGzRightingMomentNm(contessa.displacementKg, 20, contessa.gzCurve);
  const rmPort = computeGzRightingMomentNm(contessa.displacementKg, -20, contessa.gzCurve);
  assert.ok(rmContessa > rmElan * 4, '4.3t Contessa 32 righting moment dwarfs 950kg Elan 19');
  assert.ok(Math.abs(rmContessa + rmPort) < 1e-4, 'Symmetric port/starboard GZ righting moment');
});

test('Step waves: upwind bow slamming slows head-to-sea speed, downwind surfing boosts quartering run, and Arcade switch disables both', () => {
  // Pure wave model checks
  const upwindCalm = computeWaveSlamAndSurfForces(4300, 48, 0.4, 0, true);
  const upwindRough = computeWaveSlamAndSurfForces(4300, 48, 3.0, 0, true);
  assert.equal(upwindCalm.waveSlamDragN, 0);
  assert.ok(upwindRough.waveSlamDragN > 50, 'Steep upwind swell generates slamming drag');
  assert.equal(upwindRough.waveSurfPushN, 0);

  const downwindCrest = computeWaveSlamAndSurfForces(4300, 155, 3.0, Math.PI / 2, true);
  assert.equal(downwindCrest.waveSlamDragN, 0);
  assert.ok(downwindCrest.waveSurfPushN > 50, 'Following swell crest generates surfing push');

  const disabledArcade = computeWaveSlamAndSurfForces(4300, 155, 3.0, Math.PI / 2, false);
  assert.equal(disabledArcade.waveSlamDragN, 0);
  assert.equal(disabledArcade.waveSurfPushN, 0);

  // Full solver speed response
  const base = createInitialSimulationState('elan-19');
  base.simRealism = 1.0;
  const flatUpwind = solveFoilAndManeuver({ ...base, weather: { ...base.weather, waveHeightM: 0.3 } }, -50, 22, 0);
  const roughUpwind = solveFoilAndManeuver({ ...base, weather: { ...base.weather, waveHeightM: 3.1 } }, -50, 22, 0);
  assert.ok(roughUpwind.waveSlamDragN > 0);
  assert.ok(roughUpwind.targetSpeedKts < flatUpwind.targetSpeedKts, 'Head-sea slamming reduces steady upwind speed');

  const flatRun = solveFoilAndManeuver({ ...base, mainsheetPct: 25, jibsheetPct: 25, weather: { ...base.weather, waveHeightM: 0.3 } }, -155, 14, Math.PI / 2);
  const surfRun = solveFoilAndManeuver({ ...base, mainsheetPct: 25, jibsheetPct: 25, weather: { ...base.weather, waveHeightM: 3.1 } }, -155, 14, Math.PI / 2);
  assert.ok(surfRun.waveSurfPushN > 0);
  assert.ok(surfRun.targetSpeedKts > flatRun.targetSpeedKts, 'Downwind swell surfing boosts broad-reach/run speed');

  const arcadeWaves = solveFoilAndManeuver({ ...base, simRealism: 0.1, weather: { ...base.weather, waveHeightM: 3.1 } }, -50, 22, 0);
  assert.equal(arcadeWaves.waveSlamDragN, 0);
  assert.equal(arcadeWaves.waveSurfPushN, 0);
});

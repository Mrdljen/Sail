import test from 'node:test';
import assert from 'node:assert/strict';
import {
  byTheLeeCalcLocalForce,
  evaluateFoilCoefficients,
  solveFoilAndManeuver,
  tillerLuffFactor,
  tillerOptimalBoomAngle,
  tillerOptimalSheet,
} from './foilPhysics';
import { BOAT_SPECS } from './boats';
import { evaluateHullResistance } from './hullPhysics';
import { createInitialSimulationState, FIXED_PHYSICS_DT, stepSimulation } from './physics';
import { computeRiggingFailureChance, evaluateWearFactors, getBoatReefGeometry } from './tuning';

/**
 * Golden reference tests generated directly by running:
 *  - /tmp/gh-refs/bythelee (ClCdCurve "Sail", ClCd.calcLiftDragMoment, Foil.calcLocalForce)
 *  - /tmp/gh-refs/tiller (optimalBoomAngle, optimalSheet, luffFactor, POLAR sanity band, state machine)
 */

test('bythelee "Sail" natural cubic spline Cl/Cd/Cm matches reference outputs (including symmetry)', () => {
  const golden: Array<[number, number, number, number]> = [
    [-90, -0.43, 1.27, -0.5],
    [-35, -1.34, 0.46, -0.457],
    [-18, -0.60328004, 0.15984068, -0.37490481],
    [0, 0, 0.25, 0.465],
    [11, 0.33, 0.12, 0.359],
    [15, 0.48, 0.13, 0.363],
    [20, 0.71, 0.18, 0.386],
    [27.5, 1.09091694, 0.29051055, 0.43426377],
    [35, 1.34, 0.46, 0.457],
    [45, 1.17, 0.6, 0.466],
    [60, 1.0, 0.89, 0.479],
    [65, 0.92602249, 0.96810475, 0.48266712],
    [90, 0.43, 1.27, 0.5],
    [110, -0.06, 1.33, 0.513],
    [140, -0.76, 1.23, 0.538],
    [165, -1.16, 0.76, 0.637],
    [170, -1.13, 0.6, 0.637],
    [180, 0, 0.25, 0.535],
  ];

  for (const [aoa, expCl, expCd, expCm] of golden) {
    const res = evaluateFoilCoefficients(aoa);
    assert.ok(Math.abs(res.cl - expCl) < 1e-5, `AoA ${aoa} Cl: got ${res.cl}, expected ${expCl}`);
    assert.ok(Math.abs(res.cd - expCd) < 1e-5, `AoA ${aoa} Cd: got ${res.cd}, expected ${expCd}`);
    assert.ok(Math.abs(res.cm - expCm) < 1e-5, `AoA ${aoa} Cm: got ${res.cm}, expected ${expCm}`);
  }
});

test('bythelee ClCd.calcLiftDragMoment & Foil.calcLocalForce match reference vectors (rho=1.204, AR=3)', () => {
  // Reference boat: Tubby mainsail (boats.json:L337-345): area=11.01, aspectRatio=3, chord=2, qInf=8 m/s
  const goldenForces: Array<{
    aoa: number;
    lift: number;
    drag: number;
    inducedDrag: number;
    fx: number;
    fy: number;
    mz: number;
  }> = [
    { aoa: 15, lift: 203.612774, drag: 55.145126, inducedDrag: 10.369913, fx: 10.583805, fy: 213.631377, mz: 153.147846 },
    { aoa: 20, lift: 301.177229, drag: 76.35479, inducedDrag: 22.688686, fx: -9.938255, fy: 316.888884, mz: 238.647508 },
    { aoa: 35, lift: 568.418995, drag: 195.128909, inducedDrag: 80.816912, fx: -99.990158, fy: 623.897603, mz: 527.874234 },
    { aoa: 65, lift: 392.812519, drag: 410.66353, inducedDrag: 38.595416, fx: -166.14401, fy: 573.176626, mz: 519.540286 },
    { aoa: 90, lift: 182.40311, drag: 538.725466, inducedDrag: 8.322036, fx: -182.40311, fy: 547.047501, mz: 538.725466 },
    { aoa: 140, lift: -322.386893, drag: 521.757734, inducedDrag: 25.996797, fx: -212.378015, fy: 599.052514, mz: 626.600094 },
    { aoa: -35, lift: -568.418995, drag: 195.128909, inducedDrag: 80.816912, fx: -99.990158, fy: -623.897603, mz: -527.874234 },
  ];

  for (const g of goldenForces) {
    const rad = (g.aoa * Math.PI) / 180;
    const out = byTheLeeCalcLocalForce(
      11.01,
      3,
      2,
      8 * Math.cos(rad),
      8 * Math.sin(rad),
    );
    assert.ok(Math.abs(out.lift - g.lift) < 1e-3, `AoA ${g.aoa} lift: ${out.lift} vs ${g.lift}`);
    assert.ok(Math.abs(out.drag - g.drag) < 1e-3, `AoA ${g.aoa} drag: ${out.drag} vs ${g.drag}`);
    assert.ok(Math.abs(out.inducedDrag - g.inducedDrag) < 1e-3, `AoA ${g.aoa} cdi: ${out.inducedDrag} vs ${g.inducedDrag}`);
    assert.ok(Math.abs(out.fx - g.fx) < 1e-3, `AoA ${g.aoa} fx: ${out.fx} vs ${g.fx}`);
    assert.ok(Math.abs(out.fy - g.fy) < 1e-3, `AoA ${g.aoa} fy: ${out.fy} vs ${g.fy}`);
    assert.ok(Math.abs(out.mz - g.mz) < 1e-3, `AoA ${g.aoa} mz: ${out.mz} vs ${g.mz}`);
  }
});

test('tiller optimalBoomAngle, optimalSheet, and luffFactor match reference outputs', () => {
  const golden: Array<[number, number, number, number, number]> = [
    [0, 5, 1, 1, 1],
    [15, 7.5, 0.96875, 1, 1],
    [30, 15, 0.875, 1, 1],
    [43, 21.5, 0.79375, 1, 1],
    [45, 22.5, 0.78125, 0.833333, 0.833333],
    [60, 30, 0.6875, 0, 0.54],
    [90, 45, 0.5, 0, 0.54],
    [120, 60, 0.3125, 0, 0.465],
    [150, 75, 0.125, 0, 0.09],
    [170, 85, 0, 0, 0],
    [180, 85, 0, 0, 0],
  ];

  for (const [aTwa, expBoom, expSheet, expLuffOpt, expLuffEased] of golden) {
    assert.ok(Math.abs(tillerOptimalBoomAngle(aTwa) - expBoom) < 1e-5, `boom@${aTwa}`);
    assert.ok(Math.abs(tillerOptimalSheet(aTwa) - expSheet) < 1e-5, `sheet@${aTwa}`);
    assert.ok(
      Math.abs(tillerLuffFactor(aTwa, expSheet) - expLuffOpt) < 1e-5,
      `luffOpt@${aTwa}`,
    );
    assert.ok(
      Math.abs(tillerLuffFactor(aTwa, Math.max(0, expSheet - 0.35)) - expLuffEased) < 1e-5,
      `luffEased@${aTwa}`,
    );
  }
});

test('Port & starboard tack symmetry and multi-sail independent bythelee foil summation', () => {
  const base = createInitialSimulationState('rustler-36');
  const stbdTack = solveFoilAndManeuver(
    { ...base, boomSide: -1, mainsheetPct: 70, jibsheetPct: 70, jibDeployed: true, staysailDeployed: true, simRealism: 1 },
    65,
    16,
  );
  const portTack = solveFoilAndManeuver(
    { ...base, boomSide: 1, mainsheetPct: 70, jibsheetPct: 70, jibDeployed: true, staysailDeployed: true, simRealism: 1 },
    -65,
    16,
  );

  assert.ok(Math.abs(stbdTack.fDriveN - portTack.fDriveN) < 1e-3, 'Equal forward drive on port & starboard tack');
  assert.ok(Math.abs(stbdTack.fLatSignedN + portTack.fLatSignedN) < 1e-3, 'Opposite lateral drift force');
  assert.ok(stbdTack.fLatSignedN < 0, 'Wind from starboard pushes boat leeward toward port (-)');
  assert.ok(portTack.fLatSignedN > 0, 'Wind from port pushes boat leeward toward starboard (+)');

  // Verify independent foil summation: Main + Jib + Staysail > Main + Jib > Main alone
  const mainOnly = solveFoilAndManeuver(
    { ...base, boomSide: -1, mainsheetPct: 70, jibDeployed: false, staysailDeployed: false, simRealism: 1 },
    65,
    16,
  );
  const mainAndJib = solveFoilAndManeuver(
    { ...base, boomSide: -1, mainsheetPct: 70, jibsheetPct: 70, jibDeployed: true, staysailDeployed: false, simRealism: 1 },
    65,
    16,
  );
  assert.ok(mainAndJib.fDriveN > mainOnly.fDriveN, 'Deployed jib foil adds independent drive force');
  assert.ok(stbdTack.fDriveN > mainAndJib.fDriveN, 'Deployed staysail foil adds independent drive force');
  assert.ok(stbdTack.sailLiftN > mainAndJib.sailLiftN);
});

test('tiller maneuver state machine: SAILING, IN_IRONS, TACKING, GYBING (controlled vs CRASH_GYBE)', () => {
  const base = createInitialSimulationState('elan-19');

  const sailing = solveFoilAndManeuver({ ...base, boomSide: -1, boatSpeedKts: 5, simRealism: 1 }, 60, 15);
  assert.equal(sailing.maneuverState, 'sailing');

  const inIrons = solveFoilAndManeuver({ ...base, boomSide: -1, boatSpeedKts: 0.4, yawRateDegS: 1, simRealism: 1 }, 12, 15);
  assert.equal(inIrons.maneuverState, 'in-irons');

  const tacking = solveFoilAndManeuver({ ...base, boomSide: -1, boatSpeedKts: 4.5, yawRateDegS: 14, simRealism: 1 }, -55, 15);
  assert.equal(tacking.maneuverState, 'tacking');
  assert.equal(tacking.boomSide, 1);

  // Controlled gybe: sheet >= 0.7 (70%) prevents crash gybe per tiller constants.ts:L81
  const controlledGybe = solveFoilAndManeuver(
    { ...base, boomSide: 1, mainsheetPct: 75, boatSpeedKts: 5.2, simRealism: 1 },
    140,
    16,
  );
  assert.equal(controlledGybe.maneuverState, 'gybing');
  assert.equal(controlledGybe.accidentalGybeSlam, false);

  // Crash gybe: sheet < 0.7 (eased) and speed >= 4 kts triggers CRASH_GYBE per tiller sim.ts:L565-588
  const crashGybe = solveFoilAndManeuver(
    { ...base, boomSide: 1, mainsheetPct: 40, boatSpeedKts: 5.2, simRealism: 1 },
    140,
    16,
  );
  assert.equal(crashGybe.maneuverState, 'crash-gybe');
  assert.equal(crashGybe.accidentalGybeSlam, true);
});

test('Sanity band check vs tiller POLAR & pure F=ma momentum integration (no ACCEL_TAU)', () => {
  // Verify mass drives speed smoothly at FIXED_PHYSICS_DT (momentum preserves speed without instant lookup)
  let s = createInitialSimulationState('contessa-32');
  s.simRealism = 1.0;
  s.surgeVelMs = 0;
  s.boatSpeedKts = 0;
  s.headingDeg = 90; // TWA = -65° close/beam reach

  for (let i = 0; i < 30; i++) {
    s = stepSimulation(s, FIXED_PHYSICS_DT);
  }
  const speedAtHalfSec = s.boatSpeedKts;
  for (let i = 0; i < 150; i++) {
    s = stepSimulation(s, FIXED_PHYSICS_DT);
  }
  const speedAtThreeSec = s.boatSpeedKts;

  assert.ok(speedAtHalfSec > 0.05 && speedAtHalfSec < 2.5, 'Starts accelerating smoothly from 0 under real mass inertia');
  assert.ok(speedAtThreeSec > speedAtHalfSec, 'Momentum continues building speed over 3s');

  // Rough sanity band against tiller POLAR: close-hauled < beam reach > dead downwind, positive finite speeds
  const elan = createInitialSimulationState('elan-19');
  const closeHauled = solveFoilAndManeuver({ ...elan, boomSide: -1, mainsheetPct: 80, jibsheetPct: 80, simRealism: 1 }, 48, 15);
  const beamReach = solveFoilAndManeuver({ ...elan, boomSide: -1, mainsheetPct: 50, jibsheetPct: 50, simRealism: 1 }, 90, 15);
  const broadReach = solveFoilAndManeuver({ ...elan, boomSide: -1, mainsheetPct: 25, jibsheetPct: 25, simRealism: 1 }, 135, 15);
  assert.ok(beamReach.targetSpeedKts > closeHauled.targetSpeedKts, 'Beam reach exceeds close-hauled speed');
  assert.ok(broadReach.targetSpeedKts > 3.0 && beamReach.targetSpeedKts > 4.0);
});

test('Step 3: Geometric per-boat reefPoints reduce area & CE height arm without sailDrive^0.75 fudge', () => {
  const elan = BOAT_SPECS['elan-19'];
  const r0 = getBoatReefGeometry(elan, 0);
  const r1 = getBoatReefGeometry(elan, 1);
  const r2 = getBoatReefGeometry(elan, 2);

  assert.equal(r0.mainAreaFrac, 1.0);
  assert.ok(r1.mainAreaFrac < r0.mainAreaFrac && r2.mainAreaFrac < r1.mainAreaFrac);
  assert.ok(r1.mainCeHeightM < r0.mainCeHeightM && r2.mainCeHeightM < r1.mainCeHeightM);

  const base = createInitialSimulationState('contessa-32');
  const full = solveFoilAndManeuver({ ...base, reefLevel: 0, simRealism: 1 }, -75, 28);
  const reef1 = solveFoilAndManeuver({ ...base, reefLevel: 1, simRealism: 1 }, -75, 28);
  const reef2 = solveFoilAndManeuver({ ...base, reefLevel: 2, simRealism: 1 }, -75, 28);

  assert.ok(reef1.ceHeightArmM < full.ceHeightArmM, 'Reef 1 lowers geometric Center of Effort arm');
  assert.ok(reef2.ceHeightArmM < reef1.ceHeightArmM, 'Reef 2 lowers geometric Center of Effort arm further');
  assert.ok(Math.abs(reef2.heelingTorqueNm) < Math.abs(full.heelingTorqueNm) * 0.5, 'Combined area + CE height drop sharply reduces heel moment');
});

test('Step 3: tides-of-fortune hullF/rigF wear applies Cl mult + extra Cd and raises rigging failure chance', () => {
  // 1. Sail wear lowers Cl and adds parasitic Cd on the foil directly
  const fresh = evaluateWearFactors({ hull: 100, mainsail: 100, rigging: 100 });
  const blown = evaluateWearFactors({ hull: 20, mainsail: 20, rigging: 20 });

  assert.equal(fresh.sailClMult, 1);
  assert.equal(fresh.sailExtraCd, 0);
  assert.ok(blown.sailClMult < 1 && blown.sailExtraCd > 0);

  const rad = (35 * Math.PI) / 180;
  const foilFresh = byTheLeeCalcLocalForce(12, 3, 2, 8 * Math.cos(rad), 8 * Math.sin(rad), {
    clMult: fresh.sailClMult,
    extraCd: fresh.sailExtraCd,
  });
  const foilWorn = byTheLeeCalcLocalForce(12, 3, 2, 8 * Math.cos(rad), 8 * Math.sin(rad), {
    clMult: blown.sailClMult,
    extraCd: blown.sailExtraCd,
  });
  assert.ok(foilWorn.cl < foilFresh.cl, 'Worn sail reduces Cl via multiplier');
  assert.ok(foilWorn.cd > foilFresh.cd, 'Worn sail increases parasitic Cd');
  assert.ok(foilWorn.lift < foilFresh.lift, 'Worn sail produces less aerodynamic lift');

  // 2. Hull wear lowers hullF -> raises hydrodynamic hull drag
  assert.ok(blown.hullF < fresh.hullF && blown.hullDragMult > fresh.hullDragMult);
  const contessa = BOAT_SPECS['contessa-32'];
  const cleanHull = evaluateHullResistance('contessa-32', contessa.delftHull, 3.0, 10, contessa.keelType, 1, 1, fresh.hullDragMult, false);
  const fouledHull = evaluateHullResistance('contessa-32', contessa.delftHull, 3.0, 10, contessa.keelType, 1, 1, blown.hullDragMult, false);
  assert.ok(fouledHull.totalDragN > cleanHull.totalDragN, 'Fouled hull (low hullF) increases Delft/ITTC-57 resistance');

  // 3. Rigging wear reduces rigF and escalates failure probability without altering sail m^2 force
  const riskHealthy = computeRiggingFailureChance(95, 34, true, false);
  const riskWorn = computeRiggingFailureChance(20, 34, true, false);
  const riskCrash = computeRiggingFailureChance(20, 34, true, true);
  assert.ok(riskWorn > riskHealthy * 10, 'Low rigF sharply raises parting probability in squall');
  assert.ok(riskCrash > riskWorn, 'Crash gybe further raises rigging failure chance');
});


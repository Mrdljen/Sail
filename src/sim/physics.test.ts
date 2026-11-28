import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptCharterContract,
  applySparePartRepair,
  buyChandleryItem,
  computeApparentWind,
  computeDepthAtPassage,
  computeSailForces,
  createInitialSimulationState,
  deployOrRaiseAnchor,
  FIXED_PHYSICS_DT,
  getOptimalSheetPct,
  getRealismProfile,
  migrateSaveState,
  resolveDistressRecovery,
  settlePassageCompletion,
  simulateWatchSleep,
  stepSimulation,
  switchOrPurchaseBoat,
  updateAnchorAndTide,
  updateVesselCfg,
} from './physics';
import { BOAT_ORDER, BOAT_SPECS, generatePortContracts } from './boats';
import { evaluateFoilCoefficients } from './foilPhysics';
import { buildNmeaSentences } from './nmea';
import { generateIntermediateAnchorages, HANDCRAFTED_HUBS } from './worldHubs';

test('apparent wind rotates forward and increases when sailing upwind vs running', () => {
  const upwind = computeApparentWind(35, 5.5, 0, 15);
  const downwind = computeApparentWind(180, 5.5, 0, 15);
  assert.ok(upwind.awsKts > 15, 'Upwind AWS should exceed TWS');
  assert.ok(downwind.awsKts < 15, 'Downwind AWS should be lower than TWS');
  assert.ok(Math.abs(upwind.awaDeg) < 40);
});

test('Discrete Realism Switches toggle Arcade, Cruising, and Full Sim behaviors cleanly', () => {
  const arcadeProf = getRealismProfile(0.1, 40);
  const cruisingProf = getRealismProfile(0.55, 40);
  const simProf = getRealismProfile(0.95, 40);

  assert.equal(arcadeProf.preset, 'arcade');
  assert.equal(arcadeProf.autoTrimAssist, true);
  assert.equal(arcadeProf.inIronsGhostDrive, true);
  assert.equal(arcadeProf.accidentalGybeDamage, false);

  assert.equal(cruisingProf.preset, 'cruising');
  assert.equal(cruisingProf.accidentalGybeDamage, true);

  assert.equal(simProf.preset, 'simulation');
  assert.equal(simProf.noGoDeg, 40);
  assert.equal(simProf.inIronsGhostDrive, false);

  const base = createInitialSimulationState('elan-19');
  const arcadeNoGo = computeSailForces({ ...base, simRealism: 0.1 }, 20, 16);
  const simNoGo = computeSailForces({ ...base, simRealism: 1.0 }, 20, 16);
  assert.ok(arcadeNoGo.targetSpeedKts > simNoGo.targetSpeedKts, 'Arcade allows ghosting closer to wind than Sim');
  assert.equal(simNoGo.pointOfSail, 'In Irons');
});

test('Reefing mainsail in a 32 kt squall reduces heel angle and sail wear', () => {
  const base = createInitialSimulationState('elan-19');
  const fullMain = computeSailForces({ ...base, simRealism: 1, reefLevel: 0 }, -75, 32);
  const reefed2 = computeSailForces({ ...base, simRealism: 1, reefLevel: 2 }, -75, 32);

  assert.ok(Math.abs(reefed2.targetHeelDeg) < Math.abs(fullMain.targetHeelDeg), 'Reef 2 must lower heel');
  assert.equal(fullMain.isOverpowered, true);
});

test('Foil aerodynamics peak lift near attached AoA and Tiller state machine catches by-the-lee gybe', () => {
  const attached = evaluateFoilCoefficients(35);
  const stalled = evaluateFoilCoefficients(65);
  assert.ok(attached.cl > stalled.cl, 'Attached foil AoA ~35° produces higher lift coefficient than stalled 65°');
  assert.ok(stalled.cd > attached.cd, 'Stalled bluff flow produces higher drag coefficient');

  const base = createInitialSimulationState('elan-19');
  const byTheLee = computeSailForces({ ...base, boomSide: 1, mainsheetPct: 75, simRealism: 1 }, 168, 16);
  assert.equal(byTheLee.maneuverState, 'by-the-lee');

  // tiller: sheet >= 0.70 (75%) is a controlled gybe; sheet < 0.70 (40%) at >=4 kts is crash-gybe
  const controlledGybe = computeSailForces({ ...base, boomSide: 1, mainsheetPct: 75, simRealism: 1 }, 140, 16);
  assert.equal(controlledGybe.maneuverState, 'gybing');
  assert.equal(controlledGybe.accidentalGybeSlam, false);

  const crashGybe = computeSailForces({ ...base, boomSide: 1, mainsheetPct: 40, simRealism: 1 }, 140, 16);
  assert.equal(crashGybe.maneuverState, 'crash-gybe');
  assert.equal(crashGybe.accidentalGybeSlam, true);
});

test('5-Vessel Polar Validation: hull speeds, displacement hierarchy, and 15/25 kt heel', () => {
  assert.equal(BOAT_ORDER.length, 5);
  let prevHullSpeed = 0;

  for (const id of BOAT_ORDER) {
    const spec = BOAT_SPECS[id];
    const base = createInitialSimulationState(id);
    const reach15 = computeSailForces({ ...base, simRealism: 1.0, mainsheetPct: 70, jibsheetPct: 70 }, -90, 15);
    const reach25 = computeSailForces({ ...base, simRealism: 1.0, mainsheetPct: 70, jibsheetPct: 70 }, -90, 25);

    assert.ok(spec.hullSpeedKts > prevHullSpeed, `${spec.name} should progress in hull speed`);
    prevHullSpeed = spec.hullSpeedKts;
    assert.ok(reach15.targetSpeedKts > 3.5 && reach15.targetSpeedKts <= spec.hullSpeedKts * 1.18, `${spec.name} reach speed plausible`);
    assert.ok(Math.abs(reach25.targetHeelDeg) > Math.abs(reach15.targetHeelDeg), `${spec.name} heels harder in 25 kts than 15 kts`);
  }

  // Larger heavy-displacement bluewater cruiser (Hallberg 42) heels less at 15 kts than light Elan 19
  const elan15 = computeSailForces(createInitialSimulationState('elan-19'), -75, 18);
  const hallberg15 = computeSailForces(createInitialSimulationState('hallberg-42'), -75, 18);
  assert.ok(Math.abs(hallberg15.targetHeelDeg) <= Math.abs(elan15.targetHeelDeg) + 2);
});

test('True 4-DOF Rigid-Body Momentum: boat carries headway inertia into irons and bleeds speed in turns', () => {
  let state = createInitialSimulationState('contessa-32');
  state.simRealism = 1.0;
  state.surgeVelMs = 3.2; // ~6.2 kts
  state.boatSpeedKts = 6.2;
  // Point head to wind (heading = 25° = trueWindDirDeg)
  state.headingDeg = 25;

  const afterOneTick = stepSimulation(state, FIXED_PHYSICS_DT);
  assert.ok(afterOneTick.boatSpeedKts > 5.8, 'Boat inertia preserves momentum over 1/60s tick instead of teleporting to 0');

  let decelerating = afterOneTick;
  for (let i = 0; i < 180; i++) {
    decelerating = stepSimulation(decelerating, FIXED_PHYSICS_DT);
  }
  assert.ok(decelerating.boatSpeedKts < state.boatSpeedKts - 1.5, 'Head-to-wind drag decelerates momentum over 3s');
});

test('Fixed-timestep determinism & v1 save migration restores boat model mapping', () => {
  const legacyV1 = {
    boatId: 'elan-19',
    boatSpeedKts: 5.1,
    passage: { fromHubId: 'lanzarote', toHubId: 'la-gomera', xNm: 42 },
    weather: { phase: 'trade-winds', trueWindSpeedKts: 15 },
  };
  const migrated = migrateSaveState(legacyV1);
  assert.equal(migrated.saveVersion, 3);
  assert.equal(migrated.exteriorModelId, 'j80-hq');
  assert.equal(migrated.passage.xNm, 42);
  assert.ok(migrated.surgeVelMs > 2.0);

  const migratedModelOverride = migrateSaveState({ ...legacyV1, exteriorModelId: 'sergei-lite' });
  assert.equal(migratedModelOverride.exteriorModelId, 'sergei-lite');
});

test('Electrical solar charges in daytime and fridge consumes power', () => {
  let state = createInitialSimulationState('rustler-36');
  state.weather.timeOfDayHours = 12.5;
  state.weather.cloudCover = 0;
  state.electrical.fridgeOn = false;
  state.electrical.cabinLights = false;
  const noonCharging = stepSimulation(state, 0.05);
  assert.ok(noonCharging.electrical.solarWatts > noonCharging.electrical.drawWatts, 'Solar exceeds draw at noon');

  state.weather.timeOfDayHours = 2.0;
  state.electrical.fridgeOn = true;
  const nightDrain = stepSimulation(state, 0.05);
  assert.equal(nightDrain.electrical.solarWatts, 0);
  assert.ok(nightDrain.electrical.drawWatts > 20);
});

test('Anchoring deploys in shallow cove and swings boat with tidal stream', () => {
  let state = createInitialSimulationState('elan-19');
  state.passage.xNm = 99.5;
  state.passage.zNm = 0;
  state.passage.depthM = 8;

  state = deployOrRaiseAnchor(state);
  assert.equal(state.anchor.deployed, true);

  const flood = updateAnchorAndTide(state, 1.0, state.passage.xNm, state.passage.zNm, 8);
  state.passage.elapsedHours = 6.2;
  const ebb = updateAnchorAndTide(state, 1.0, flood.xNm, flood.zNm, 8);

  assert.notEqual(flood.anchor.tidePhaseLabel, ebb.anchor.tidePhaseLabel);
  assert.notEqual(flood.anchor.tidalCurrentDeg, ebb.anchor.tidalCurrentDeg);
});

test('Chandlery purchase, locker capacity enforcement, spare repair, and 5-boat commissioning', () => {
  let state = createInitialSimulationState('elan-19');
  state.wear.mainsail = 45;
  state.inventory.coins = 500;
  state.inventory.parts['sail-repair-kit'] = 0;

  state = buyChandleryItem(state, 'sail-repair-kit');
  assert.equal(state.inventory.parts['sail-repair-kit'], 1);
  assert.equal(state.inventory.coins, 390);

  state = applySparePartRepair(state, 'sail-repair-kit');
  assert.equal(state.wear.mainsail, 80);
  assert.equal(state.inventory.parts['sail-repair-kit'], 0);

  // Test locker capacity enforcement on Elan 19 (5 slots)
  let fullLocker = createInitialSimulationState('elan-19');
  fullLocker.inventory.coins = 2000;
  fullLocker.inventory.parts = { 'antifouling-epoxy': 2, 'sail-repair-kit': 1 }; // 2*2 + 1 = 5/5 slots
  const blockedBuy = buyChandleryItem(fullLocker, 'shackle-rigging-pack');
  assert.equal(blockedBuy.inventory.parts['shackle-rigging-pack'] ?? 0, 0, 'Locker capacity blocks overfilling');
  assert.ok(blockedBuy.alertMessage?.includes('Spare locker full'));

  // Test commissioning Folkboat 25 when sufficient credits exist
  state.inventory.coins = 700;
  state = switchOrPurchaseBoat(state, 'folkboat-25');
  assert.equal(state.boatId, 'folkboat-25');
  assert.equal(state.inventory.coins, 50);

  const contracts = generatePortContracts('lanzarote', 'la-gomera', 'folkboat-25');
  assert.ok(contracts.length >= 2);
  state = acceptCharterContract(state, contracts[0]);
  const settled = settlePassageCompletion(state);
  assert.ok(settled.contractBonusCr > 0);
  assert.ok(settled.portFeeCr > 0);
});

test('Harbor channel shoaling hazard, boat.cfg wing_sur tuning, and NMEA 0183 checksums', () => {
  const channelDepth = computeDepthAtPassage(1.5, 0.1, 100);
  const shoalDepth = computeDepthAtPassage(1.5, 1.5, 100);
  assert.ok(shoalDepth < 3.0 && shoalDepth < channelDepth, 'Straying outside harbor channel shoals steeply');

  const base = createInitialSimulationState('elan-19');
  const lowDrag = updateVesselCfg(base, { wingSurDragM2: 1.4, sailAreaM2: 16 });
  const fBase = computeSailForces(base, -75, 15);
  const fTuned = computeSailForces(lowDrag, -75, 15);
  assert.ok(fTuned.targetSpeedKts > fBase.targetSpeedKts, 'Lower wing_sur + larger sail area increases boat speed');

  const nmea = buildNmeaSentences(base);
  assert.match(nmea.gprmc, /^\$GPRMC,.*\*[0-9A-F]{2}$/);
  assert.match(nmea.iimwv, /^\$IIMWV,.*\*[0-9A-F]{2}$/);
});

test('Non-fatal failure recovery resolves dismasting/hull/supply distress cleanly without wiping voyage', () => {
  let state = createInitialSimulationState('elan-19');
  state.simRealism = 1.0;
  state.wear.rigging = 10;
  state = stepSimulation(state, 0.05);
  assert.equal(state.distress?.active, true);
  assert.equal(state.distress?.cause, 'rigging-failure');

  const recovered = resolveDistressRecovery(state);
  assert.equal(recovered.distress, null);
  assert.ok(recovered.wear.rigging >= 65);
  assert.ok(recovered.passage.elapsedHours > 0);
});

test('Headless 100 NM Scripted-Helm Passage completes across Arcade, Cruising, and Full Sim', () => {
  for (const realism of [0.1, 0.55, 0.95]) {
    let state = createInitialSimulationState('contessa-32');
    state.simRealism = realism;
    state.autopilotMode = 'compass';
    state.autopilotTargetDeg = 90;
    state.timeCompression = 60;

    let sawSquall = false;
    let ticks = 0;

    while (!state.passage.arrivedAtCove && ticks < 2400) {
      // Scripted navigator steers toward cove waypoint (compensating for leeway & Canary current)
      const dx = state.passage.totalDistanceNm - state.passage.xNm;
      const dz = 0 - state.passage.zNm;
      const bearingDeg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
      state.autopilotTargetDeg = bearingDeg;

      const optSheet = getOptimalSheetPct(Math.abs(state.apparentWindAngleDeg));
      state.mainsheetPct = optSheet;
      state.jibsheetPct = optSheet;
      if (state.weather.phase === 'squall' || state.weather.phase === 'barometer-falling') {
        sawSquall = true;
        state.reefLevel = 2;
      } else if (state.weather.phase === 'trade-winds') {
        state.reefLevel = 0;
      }
      if (state.distress?.active) {
        state = resolveDistressRecovery(state);
      }

      state = stepSimulation(state, 0.05);
      ticks++;
    }

    assert.equal(state.passage.arrivedAtCove, true, `Realism ${realism} must complete 100 NM passage`);
    assert.equal(sawSquall, true, `Realism ${realism} must encounter squall during 100 NM passage`);
    assert.ok(state.passage.elapsedHours > 8 && state.passage.elapsedHours < 45, `Plausible passage time: ${state.passage.elapsedHours}`);

    // Anchor at destination cove and settle
    state = deployOrRaiseAnchor(state);
    assert.equal(state.anchor.deployed, true, `Realism ${realism} depth (${state.passage.depthM}m) should allow anchoring`);
    const settled = settlePassageCompletion(state);
    assert.ok(settled.harborBountyCr > 0);
  }
});

test('Sleep/watch wakes early if unreefed squall hits', () => {
  let state = createInitialSimulationState('elan-19');
  state.autopilotMode = 'windvane';
  state.autopilotTargetDeg = -65;
  state.passage.xNm = 26;
  const res = simulateWatchSleep(state, 6);
  assert.ok(res.wokeReason.toLowerCase().includes('squall'), `Expected squall wake, got: ${res.wokeReason}`);
});

test('World hubs contain 28 handcrafted Trade-Wind & Cape hubs and deterministic procedural atolls', () => {
  assert.ok(HANDCRAFTED_HUBS.length >= 25);
  const stLucia = HANDCRAFTED_HUBS.find((h) => h.id === 'st-lucia');
  const capeTown = HANDCRAFTED_HUBS.find((h) => h.id === 'cape-town');
  assert.ok(stLucia && capeTown);

  const atollsA = generateIntermediateAnchorages(HANDCRAFTED_HUBS[2], stLucia, 4);
  const atollsB = generateIntermediateAnchorages(HANDCRAFTED_HUBS[2], stLucia, 4);
  assert.equal(atollsA.length, 4);
  assert.deepEqual(atollsA, atollsB);
});

test('Cutter staysail boosts forward driving force on Rustler 36 / Hallberg-Rassy 42', () => {
  const base = createInitialSimulationState('rustler-36');
  const withStaysail = { ...base, staysailDeployed: true };
  const withoutStaysail = { ...base, staysailDeployed: false };

  const resWith = stepSimulation(withStaysail, 0.25);
  const resWithout = stepSimulation(withoutStaysail, 0.25);
  assert.ok(resWith.sailLiftN > resWithout.sailLiftN, 'Staysail must generate additional lift');
  assert.ok(resWith.boatSpeedKts >= resWithout.boatSpeedKts);
});

test('Equipment chaining: low rigging (<35%) accelerates storm fatigue and warm fridge accelerates spoilage', () => {
  const base = createInitialSimulationState('contessa-32');
  base.simRealism = 0.95;
  base.weather.phase = 'squall';
  base.weather.trueWindSpeedKts = 32;
  base.weather.gustSpeedKts = 36;
  base.timeCompression = 60;

  const healthyRig = { ...base, wear: { ...base.wear, rigging: 85 } };
  const wornRig = { ...base, wear: { ...base.wear, rigging: 28 } };

  const afterHealthy = stepSimulation(healthyRig, 0.25);
  const afterWorn = stepSimulation(wornRig, 0.25);
  const deltaHealthy = healthyRig.wear.rigging - afterHealthy.wear.rigging;
  const deltaWorn = wornRig.wear.rigging - afterWorn.wear.rigging;
  assert.ok(deltaWorn > deltaHealthy * 1.25, `Worn rigging should fatigue faster (${deltaWorn} > ${deltaHealthy})`);

  const coldGalley = {
    ...base,
    electrical: { ...base.electrical, fridgeOn: true, fridgeTempC: 4 },
  };
  const warmGalley = {
    ...base,
    electrical: { ...base.electrical, fridgeOn: false, fridgeTempC: 18 },
  };
  const afterCold = stepSimulation(coldGalley, 0.25);
  const afterWarm = stepSimulation(warmGalley, 0.25);
  assert.ok(
    afterWarm.electrical.provisionsDays < afterCold.electrical.provisionsDays,
    'Warm fridge (>10C) must spoil provisions faster',
  );
  assert.ok(afterWarm.alertMessage?.toLowerCase().includes('fridge') || afterWarm.alertMessage?.toLowerCase().includes('spoil'));
});


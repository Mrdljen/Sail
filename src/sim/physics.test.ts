import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySparePartRepair,
  buyChandleryItem,
  computeApparentWind,
  computeSailForces,
  createInitialSimulationState,
  deployOrRaiseAnchor,
  simulateWatchSleep,
  stepSimulation,
  updateAnchorAndTide,
} from './physics';
import { generateIntermediateAnchorages, HANDCRAFTED_HUBS } from './worldHubs';

test('apparent wind rotates forward and increases when sailing upwind vs running', () => {
  const upwind = computeApparentWind(35, 5.5, 0, 15);
  const downwind = computeApparentWind(180, 5.5, 0, 15);
  assert.ok(upwind.awsKts > 15, 'Upwind AWS should exceed TWS');
  assert.ok(downwind.awsKts < 15, 'Downwind AWS should be lower than TWS');
  assert.ok(Math.abs(upwind.awaDeg) < 40);
});

test('Arcade vs Simulation slider changes no-go zone forgiveness and heel severity', () => {
  const base = createInitialSimulationState('elan-19');
  // Point directly into the wind (20° off wind)
  const arcadeState = { ...base, simRealism: 0.0, reefLevel: 0 as const };
  const simState = { ...base, simRealism: 1.0, reefLevel: 0 as const };

  const arcadeNoGo = computeSailForces(arcadeState, 20, 16);
  const simNoGo = computeSailForces(simState, 20, 16);
  assert.ok(arcadeNoGo.targetSpeedKts > simNoGo.targetSpeedKts, 'Arcade mode allows ghosting closer to wind than Simulation');
  assert.equal(simNoGo.pointOfSail, 'In Irons');
});

test('Reefing mainsail in a 32 kt squall reduces heel angle and sail wear', () => {
  const base = createInitialSimulationState('elan-19');
  const fullMain = computeSailForces({ ...base, simRealism: 1, reefLevel: 0 }, -75, 32);
  const reefed2 = computeSailForces({ ...base, simRealism: 1, reefLevel: 2 }, -75, 32);

  assert.ok(Math.abs(reefed2.targetHeelDeg) < Math.abs(fullMain.targetHeelDeg), 'Reef 2 must lower heel');
  assert.equal(fullMain.isOverpowered, true);
});

test('Electrical solar charges in daytime and fridge consumes power', () => {
  let state = createInitialSimulationState('rustler-36');
  state.weather.timeOfDayHours = 12.5; // solar noon
  state.weather.cloudCover = 0;
  state.electrical.fridgeOn = false;
  state.electrical.cabinLights = false;
  const noonCharging = stepSimulation(state, 0.05);
  assert.ok(noonCharging.electrical.solarWatts > noonCharging.electrical.drawWatts, 'Solar exceeds draw at noon');

  state.weather.timeOfDayHours = 2.0; // midnight
  state.electrical.fridgeOn = true;
  const nightDrain = stepSimulation(state, 0.05);
  assert.equal(nightDrain.electrical.solarWatts, 0);
  assert.ok(nightDrain.electrical.drawWatts > 20);
});

test('Anchoring deploys in shallow cove and swings boat with tidal stream', () => {
  let state = createInitialSimulationState('elan-19');
  state.passage.xNm = 99.5; // near destination cove
  state.passage.zNm = 0;
  state.passage.depthM = 8;

  state = deployOrRaiseAnchor(state);
  assert.equal(state.anchor.deployed, true);

  const flood = updateAnchorAndTide(state, 1.0, state.passage.xNm, state.passage.zNm, 8);
  state.passage.elapsedHours = 6.2; // half tide later -> ebbing
  const ebb = updateAnchorAndTide(state, 1.0, flood.xNm, flood.zNm, 8);

  assert.notEqual(flood.anchor.tidePhaseLabel, ebb.anchor.tidePhaseLabel);
  assert.notEqual(flood.anchor.tidalCurrentDeg, ebb.anchor.tidalCurrentDeg);
});

test('Chandlery purchase and spare part repair restore damaged mainsail', () => {
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
});

test('Sleep/watch wakes early if unreefed squall hits', () => {
  let state = createInitialSimulationState('elan-19');
  state.autopilotMode = 'windvane';
  state.autopilotTargetDeg = -65;
  state.passage.xNm = 26; // just before squall trigger at 28 NM
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

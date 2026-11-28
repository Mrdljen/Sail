import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialSimulationState } from './physics';
import { toMarineInstrumentData, UPWIND_TARGET_MARGIN_DEG } from './instrumentData';

test('Signal K instrument readings include waypoint bearing, VMG, and a hull-relative upwind target', () => {
  const state = createInitialSimulationState('elan-19');
  state.sogKts = 5;
  state.cogDeg = 90;
  const data = toMarineInstrumentData(state, 40);

  assert.equal(data.navigation.headingTrue.units, 'rad');
  assert.equal(data.route.bearingToWaypointDeg, 90);
  assert.equal(data.navigation.velocityMadeGoodToWaypoint.value, 5);
  assert.equal(data.sailing.targetUpwindAngleDeg, 40 + UPWIND_TARGET_MARGIN_DEG);

  const sailingAway = toMarineInstrumentData({ ...state, cogDeg: 270 }, 40);
  assert.ok(sailingAway.navigation.velocityMadeGoodToWaypoint.value < 0);
});

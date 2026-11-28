import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialSimulationState } from './physics';
import { getSailingLessonSteps } from './lessonProgress';

test('sailing guide completes from live helm, trim, route, reef, and anchor state', () => {
  const initial = createInitialSimulationState('elan-19');
  const activeSteps = getSailingLessonSteps(initial, 40);
  assert.equal(activeSteps.find((step) => step.id === 'wind')?.complete, true);
  assert.equal(activeSteps.find((step) => step.id === 'landfall')?.complete, false);

  const practiced = {
    ...initial,
    apparentWindAngleDeg: 55,
    autopilotMode: 'windvane' as const,
    isOverpowered: true,
    reefLevel: 1 as const,
    passage: { ...initial.passage, arrivedAtCove: true },
    anchor: { ...initial.anchor, deployed: true },
  };
  const completedSteps = getSailingLessonSteps(practiced, 40);
  assert.ok(completedSteps.every((step) => step.complete));
});

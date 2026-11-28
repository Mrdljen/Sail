import assert from 'node:assert/strict';
import test from 'node:test';
import {
  archetypeForHub,
  createIslandHeightSamplerFromNoise,
  generateIslandFromNoise,
  generatePort,
  portRegionForHub,
} from './generationAlgorithms';
import { HANDCRAFTED_HUBS } from '../sim/worldHubs';

const seededNoise = (x: number, y: number, z: number): number =>
  Math.sin(x * 1.73 + y * 2.11 + z * 0.37) * 0.52 + Math.cos(x * 0.81 - y * 1.29 + z) * 0.31;

test('Canary hubs use stable Lanzarote and La Gomera world profiles', () => {
  const lanzarote = HANDCRAFTED_HUBS.find((hub) => hub.id === 'lanzarote');
  const laGomera = HANDCRAFTED_HUBS.find((hub) => hub.id === 'la-gomera');
  assert.ok(lanzarote);
  assert.ok(laGomera);
  assert.equal(archetypeForHub(lanzarote), 'volcanic');
  assert.equal(archetypeForHub(laGomera), 'steep');
  assert.equal(portRegionForHub(lanzarote), 'Canary Islands');
});

test('island terrain and instances reproduce from the hub seed', () => {
  const first = generateIslandFromNoise('lanzarote', 'volcanic', 'near', seededNoise);
  const repeat = generateIslandFromNoise('lanzarote', 'volcanic', 'near', seededNoise);
  assert.deepEqual(first.positions, repeat.positions);
  assert.deepEqual(first.colors, repeat.colors);
  assert.deepEqual(first.trees, repeat.trees);
  assert.deepEqual(first.rocks, repeat.rocks);

  const other = generateIslandFromNoise('la-gomera', 'volcanic', 'near', seededNoise);
  assert.notDeepEqual(first.positions, other.positions);
});

test('navigation sampler returns the same seeded coastline and seabed as rendered terrain', () => {
  const terrain = generateIslandFromNoise('lanzarote:Canary Islands', 'volcanic', 'near', seededNoise);
  const sampler = createIslandHeightSamplerFromNoise('lanzarote:Canary Islands', 'volcanic', seededNoise);
  const rowLength = Math.sqrt(terrain.positions.length / 3) | 0;
  const centerIndex = (rowLength >> 1) * rowLength + (rowLength >> 1);

  assert.equal(sampler.radiusM, terrain.radiusM);
  assert.equal(sampler.portCoastX, terrain.portCoastX);
  assert.ok(Math.abs(sampler.heightAt(0, 0) - terrain.positions[centerIndex * 3 + 1]) < 0.00001);
});

test('far island LOD has fewer terrain and vegetation instances', () => {
  const near = generateIslandFromNoise('la-gomera', 'steep', 'near', seededNoise);
  const far = generateIslandFromNoise('la-gomera', 'steep', 'far', seededNoise);
  assert.ok(far.positions.length < near.positions.length);
  assert.ok(far.indices.length < near.indices.length);
  assert.ok(far.trees.length < near.trees.length);
  assert.ok(far.rocks.length < near.rocks.length);
});

test('atoll profile keeps its lagoon below water and ring above water', () => {
  const atoll = generateIslandFromNoise('direction-island', 'atoll', 'near', seededNoise);
  const segments = Math.sqrt(atoll.positions.length / 3) - 1;
  const extent = atoll.radiusM * 1.38;
  const center = Math.round(segments / 2) * (segments + 1) + Math.round(segments / 2);
  assert.ok(atoll.positions[center * 3 + 1] < 0);

  let highestRingHeight = -Infinity;
  for (let i = 0; i < atoll.positions.length / 3; i++) {
    const x = atoll.positions[i * 3];
    const z = atoll.positions[i * 3 + 2];
    if (Math.hypot(x, z) > atoll.radiusM * 0.62 && Math.hypot(x, z) < atoll.radiusM * 0.88) {
      highestRingHeight = Math.max(highestRingHeight, atoll.positions[i * 3 + 1]);
    }
  }
  assert.ok(highestRingHeight > 0, `Expected a raised ring inside extent ${extent}`);
});

test('port layouts are stable and choose a regional style', () => {
  const canary = generatePort('lanzarote', 'Canary Islands');
  const repeat = generatePort('lanzarote', 'Canary Islands');
  const tropical = generatePort('st-lucia', 'Eastern Caribbean');
  assert.deepEqual(canary, repeat);
  assert.equal(canary.style, 'canary');
  assert.equal(tropical.style, 'tropical');
  assert.notDeepEqual(canary.buildings, tropical.buildings);
});

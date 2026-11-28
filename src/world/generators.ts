import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import {
  generateIslandFromNoise,
  createIslandHeightSamplerFromNoise,
  generatePort,
  archetypeForHub,
  islandRadiusForArchetype,
  portRegionForHub,
  type IslandArchetype,
  type IslandHeightSampler,
  type IslandTerrainData,
  type PortLayout,
  type Seed,
  type TerrainDetail,
} from './generationAlgorithms';

export type { HubWorldDescription, IslandArchetype, IslandHeightSampler, IslandTerrainData, PortLayout, TerrainDetail } from './generationAlgorithms';
export { archetypeForHub, portRegionForHub };
export { generatePort };
export { islandRadiusForArchetype };

/** Build a stable island from a hub seed with Three.js's bundled ImprovedNoise. */
export function generateIsland(
  seed: Seed,
  archetype: IslandArchetype,
  detail: TerrainDetail = 'near',
): IslandTerrainData {
  const perlin = new ImprovedNoise();
  return generateIslandFromNoise(seed, archetype, detail, (x, y, z) => perlin.noise(x, y, z));
}

/** Uses the renderer's same seeded ImprovedNoise height field for live soundings. */
export function createIslandHeightSampler(seed: Seed, archetype: IslandArchetype): IslandHeightSampler {
  const perlin = new ImprovedNoise();
  return createIslandHeightSamplerFromNoise(seed, archetype, (x, y, z) => perlin.noise(x, y, z));
}

export type { Seed };

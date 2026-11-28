import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import {
  generateIslandFromNoise,
  generatePort,
  archetypeForHub,
  portRegionForHub,
  type IslandArchetype,
  type IslandTerrainData,
  type PortLayout,
  type Seed,
  type TerrainDetail,
} from './generationAlgorithms';

export type { HubWorldDescription, IslandArchetype, IslandTerrainData, PortLayout, TerrainDetail } from './generationAlgorithms';
export { archetypeForHub, portRegionForHub };
export { generatePort };

/** Build a stable island from a hub seed with Three.js's bundled ImprovedNoise. */
export function generateIsland(
  seed: Seed,
  archetype: IslandArchetype,
  detail: TerrainDetail = 'near',
): IslandTerrainData {
  const perlin = new ImprovedNoise();
  return generateIslandFromNoise(seed, archetype, detail, (x, y, z) => perlin.noise(x, y, z));
}

export type { Seed };

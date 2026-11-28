import {
  createIslandHeightSampler,
  type IslandArchetype,
  type IslandHeightSampler,
} from './generators';

export const PASSAGE_NM_TO_WORLD_M = 55;
export const COVE_ARRIVAL_DISTANCE_NM = 2.2;
export const SHORELINE_CLEARANCE_M = 35;

const samplerCache = new Map<string, IslandHeightSampler>();

function getSampler(hubId: string, region: string, archetype: IslandArchetype): IslandHeightSampler {
  const key = `${hubId}:${region}:${archetype}`;
  let sampler = samplerCache.get(key);
  if (!sampler) {
    sampler = createIslandHeightSampler(`${hubId}:${region}`, archetype);
    samplerCache.set(key, sampler);
  }
  return sampler;
}

/** Keep visible island centers and simulated shoreline coordinates on the same scale. */
export function islandApproachOffsetM(hubId: string, region: string, archetype: IslandArchetype): number {
  const coast = getSampler(hubId, region, archetype).portCoastX;
  return coast -
    COVE_ARRIVAL_DISTANCE_NM * PASSAGE_NM_TO_WORLD_M +
    SHORELINE_CLEARANCE_M;
}

/** Returns signed soundings from the visible mesh: positive in water and negative on generated land. */
export function sampleIslandDepthM(
  hubId: string,
  region: string,
  archetype: IslandArchetype,
  localX: number,
  localZ: number,
): number | null {
  const sampler = getSampler(hubId, region, archetype);
  if (Math.abs(localX) > sampler.extentM || Math.abs(localZ) > sampler.extentM) return null;
  return -sampler.heightAt(localX, localZ);
}

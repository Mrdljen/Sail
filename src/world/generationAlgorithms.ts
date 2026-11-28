export type IslandArchetype = 'volcanic' | 'steep' | 'tropical' | 'atoll';
export type TerrainDetail = 'near' | 'far';
export type Noise3D = (x: number, y: number, z: number) => number;
export type Seed = string | number;

export interface HubWorldDescription {
  id: string;
  region: string;
  harborType: string;
}

export function archetypeForHub(hub: HubWorldDescription): IslandArchetype {
  if (hub.id === 'lanzarote') return 'volcanic';
  if (hub.id === 'la-gomera') return 'steep';
  if (hub.harborType === 'Atoll') return 'atoll';
  if (hub.harborType === 'Great Cape') return 'steep';
  if (/caribbean|windward|pacific|society|mascarene/i.test(hub.region)) return 'tropical';
  return 'volcanic';
}

export function portRegionForHub(hub: Pick<HubWorldDescription, 'region' | 'harborType'>): string {
  return hub.harborType === 'Atoll' ? 'Atoll' : hub.region;
}

export interface IslandTerrainData {
  seed: number;
  archetype: IslandArchetype;
  detail: TerrainDetail;
  radiusM: number;
  portCoastX: number;
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint16Array;
  trees: Float32Array;
  rocks: Float32Array;
}

export interface PortBuilding {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  yaw: number;
}

export interface PortLayout {
  style: 'canary' | 'tropical' | 'atoll' | 'temperate';
  quayLengthM: number;
  quayWidthM: number;
  pierLengthM: number;
  breakwaterLengthM: number;
  lighthouseHeightM: number;
  buildings: PortBuilding[];
  mooringCount: number;
  boatCount: number;
  wallColor: number;
  roofColor: number;
  trimColor: number;
  stoneColor: number;
}

interface IslandProfile {
  radiusM: number;
  peakHeightM: number;
  slopePower: number;
  coastNoiseM: number;
  treeCount: number;
  rockCount: number;
}

const ISLAND_PROFILES: Record<IslandArchetype, IslandProfile> = {
  volcanic: { radiusM: 250, peakHeightM: 215, slopePower: 0.74, coastNoiseM: 20, treeCount: 22, rockCount: 58 },
  steep: { radiusM: 205, peakHeightM: 410, slopePower: 0.58, coastNoiseM: 26, treeCount: 116, rockCount: 48 },
  tropical: { radiusM: 300, peakHeightM: 190, slopePower: 0.92, coastNoiseM: 24, treeCount: 170, rockCount: 24 },
  atoll: { radiusM: 315, peakHeightM: 14, slopePower: 1.15, coastNoiseM: 18, treeCount: 28, rockCount: 18 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function seedNumber(seed: Seed): number {
  if (typeof seed === 'number') return seed >>> 0;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function paletteForHeight(archetype: IslandArchetype, height: number, slope: number): [number, number, number] {
  let lowland: [number, number, number];
  let highland: [number, number, number];
  if (archetype === 'volcanic') {
    lowland = [0.35, 0.27, 0.20];
    highland = [0.31, 0.29, 0.27];
  } else if (archetype === 'atoll') {
    lowland = [0.76, 0.67, 0.44];
    highland = [0.30, 0.43, 0.31];
  } else if (archetype === 'tropical') {
    lowland = [0.30, 0.46, 0.26];
    highland = [0.32, 0.39, 0.29];
  } else {
    lowland = [0.34, 0.42, 0.29];
    highland = [0.36, 0.34, 0.30];
  }

  if (height < 2.5 && slope < 0.52) return [toLinear(220), toLinear(199), toLinear(151)];
  const t = smoothstep(0, archetype === 'steep' ? 280 : 120, height);
  const rock = smoothstep(0.35, 0.9, slope);
  const base: [number, number, number] = [
    lowland[0] + (highland[0] - lowland[0]) * t,
    lowland[1] + (highland[1] - lowland[1]) * t,
    lowland[2] + (highland[2] - lowland[2]) * t,
  ];
  return [
    base[0] * (1 - rock * 0.24),
    base[1] * (1 - rock * 0.24),
    base[2] * (1 - rock * 0.24),
  ];
}

function makeHeightSampler(
  seed: number,
  archetype: IslandArchetype,
  noise: Noise3D,
): { profile: IslandProfile; heightAt: (x: number, z: number) => number } {
  const profile = ISLAND_PROFILES[archetype];
  const random = seededRandom(seed);
  const offsetX = random() * 8192;
  const offsetZ = random() * 8192;
  const phase = random() * Math.PI * 2;

  const heightAt = (x: number, z: number): number => {
    const coast =
      noise(x * 0.006 + offsetX, z * 0.006 + offsetZ, 0.2) * 0.58 +
      noise(x * 0.018 - offsetZ, z * 0.018 + offsetX, 1.7) * 0.27 +
      noise(x * 0.045 + offsetZ, z * 0.045 - offsetX, 2.8) * 0.15;
    const coastRadius = profile.radiusM + coast * profile.coastNoiseM;
    const radialDistance = Math.hypot(x, z);
    const normalized = radialDistance / Math.max(1, coastRadius);
    const inland = 1 - normalized;

    if (archetype === 'atoll') {
      const ring = Math.exp(-Math.pow((normalized - 0.76) / 0.13, 2));
      const crown = profile.peakHeightM * ring * smoothstep(0.02, 0.19, inland);
      const texture = noise(x * 0.022 + offsetX, z * 0.022 + offsetZ, 4.1) * 1.6;
      if (inland < 0) return -18 - 42 * smoothstep(0, 0.45, -inland);
      return Math.max(-5.5, crown + texture - (1 - ring) * 4.5);
    }

    if (inland <= 0) return -14 - 52 * smoothstep(0, 0.62, -inland);

    const lowFrequency = noise(x * 0.0025 + offsetX, z * 0.0025 + offsetZ, 5.2);
    const mediumFrequency = noise(x * 0.009 + offsetZ, z * 0.009 - offsetX, 6.3);
    const fineFrequency = noise(x * 0.027 - offsetX, z * 0.027 + offsetZ, 7.4);
    const roughness = lowFrequency * 0.52 + mediumFrequency * 0.31 + fineFrequency * 0.17;
    const base = profile.peakHeightM * Math.pow(clamp(inland, 0, 1), profile.slopePower);
    let feature = 1;

    if (archetype === 'volcanic') {
      const craterRing = Math.exp(-Math.pow((normalized - 0.34) / 0.13, 2));
      const caldera = Math.exp(-Math.pow(normalized / 0.15, 2));
      feature = 0.52 + craterRing * 0.56 - caldera * 0.18;
    } else if (archetype === 'steep') {
      const ridgeOffset = noise(z * 0.003 + offsetZ, 0.7, 8.5) * profile.radiusM * 0.14;
      const ridge = Math.exp(-Math.pow((x - ridgeOffset) / (profile.radiusM * 0.34), 2));
      const peakGroups = 0.82 + 0.18 * Math.max(0, Math.sin(z * 0.013 + phase));
      feature = 0.34 + ridge * 0.72 * peakGroups;
    } else {
      feature = 0.82 + Math.max(0, lowFrequency) * 0.24;
    }

    const beach = smoothstep(0, 0.075, inland);
    const texture = 1 + roughness * (archetype === 'steep' ? 0.24 : 0.19);
    return Math.max(0, base * feature * texture * beach);
  };

  return { profile, heightAt };
}

function scatterInstances(
  seed: number,
  profile: IslandProfile,
  archetype: IslandArchetype,
  detail: TerrainDetail,
  heightAt: (x: number, z: number) => number,
): { trees: Float32Array; rocks: Float32Array } {
  const random = seededRandom(seed ^ (detail === 'near' ? 0x5a17 : 0x8b31));
  const detailScale = detail === 'near' ? 1 : 0.28;
  const treeTarget = Math.round(profile.treeCount * detailScale);
  const rockTarget = Math.round(profile.rockCount * detailScale);
  const trees: number[] = [];
  const rocks: number[] = [];
  const candidateCount = Math.max(treeTarget, rockTarget) * 18;

  for (let i = 0; i < candidateCount && (trees.length / 5 < treeTarget || rocks.length / 5 < rockTarget); i++) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * profile.radiusM * 0.9;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const y = heightAt(x, z);
    if (y <= 5) continue;
    const slope = Math.hypot(heightAt(x + 4, z) - heightAt(x - 4, z), heightAt(x, z + 4) - heightAt(x, z - 4)) / 8;

    if (trees.length / 5 < treeTarget && y < profile.peakHeightM * 0.78 && slope < (archetype === 'steep' ? 1.0 : 0.62)) {
      const density = archetype === 'volcanic' ? 0.34 : 0.78;
      if (random() < density) {
        trees.push(x, y, z, 0.66 + random() * 0.72, random() * Math.PI * 2);
      }
    }

    const nearShore = Math.hypot(x, z) > profile.radiusM * 0.67;
    if (rocks.length / 5 < rockTarget && nearShore && (slope > 0.22 || archetype === 'volcanic')) {
      rocks.push(x, y, z, 0.7 + random() * 1.8, random() * Math.PI * 2);
    }
  }

  return { trees: new Float32Array(trees), rocks: new Float32Array(rocks) };
}

/**
 * Generate independent heightfield buffers for one island LOD. Noise is supplied by
 * Three.js ImprovedNoise in the worker so this algorithm stays deterministic and testable.
 */
export function generateIslandFromNoise(
  seed: Seed,
  archetype: IslandArchetype,
  detail: TerrainDetail,
  noise: Noise3D,
): IslandTerrainData {
  const numericSeed = seedNumber(seed);
  const { profile, heightAt } = makeHeightSampler(numericSeed, archetype, noise);
  const segments = detail === 'near' ? 112 : 28;
  const extent = profile.radiusM * 1.38;
  const spacing = (extent * 2) / segments;
  const vertexCount = (segments + 1) * (segments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const heights = new Float32Array(vertexCount);
  const indices = new Uint16Array(segments * segments * 6);

  for (let iz = 0; iz <= segments; iz++) {
    const z = -extent + iz * spacing;
    for (let ix = 0; ix <= segments; ix++) {
      const x = -extent + ix * spacing;
      const index = iz * (segments + 1) + ix;
      const height = heightAt(x, z);
      heights[index] = height;
      positions[index * 3] = x;
      positions[index * 3 + 1] = height;
      positions[index * 3 + 2] = z;
    }
  }

  const rowLength = segments + 1;
  let indexOffset = 0;
  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * rowLength + ix;
      const b = a + 1;
      const d = a + rowLength;
      const c = d + 1;
      indices[indexOffset++] = a;
      indices[indexOffset++] = c;
      indices[indexOffset++] = b;
      indices[indexOffset++] = a;
      indices[indexOffset++] = d;
      indices[indexOffset++] = c;
    }
  }

  for (let iz = 0; iz <= segments; iz++) {
    for (let ix = 0; ix <= segments; ix++) {
      const index = iz * rowLength + ix;
      const left = heights[iz * rowLength + Math.max(0, ix - 1)];
      const right = heights[iz * rowLength + Math.min(segments, ix + 1)];
      const back = heights[Math.max(0, iz - 1) * rowLength + ix];
      const front = heights[Math.min(segments, iz + 1) * rowLength + ix];
      const dx = (right - left) / (spacing * (ix === 0 || ix === segments ? 1 : 2));
      const dz = (front - back) / (spacing * (iz === 0 || iz === segments ? 1 : 2));
      const rgb = paletteForHeight(archetype, heights[index], Math.hypot(dx, dz));
      colors[index * 3] = rgb[0];
      colors[index * 3 + 1] = rgb[1];
      colors[index * 3 + 2] = rgb[2];
    }
  }

  let portCoastX = profile.radiusM;
  let crossedLand = false;
  for (let x = -profile.radiusM * 1.15; x <= profile.radiusM * 1.45; x += 3) {
    const isLand = heightAt(x, 0) > 0;
    if (isLand) crossedLand = true;
    else if (crossedLand) {
      portCoastX = x;
      break;
    }
  }

  const scattered = scatterInstances(numericSeed, profile, archetype, detail, heightAt);
  return {
    seed: numericSeed,
    archetype,
    detail,
    radiusM: profile.radiusM,
    portCoastX,
    positions,
    colors,
    indices,
    ...scattered,
  };
}

/** Deterministic port blocks and moorings derived from a hub seed and regional palette. */
export function generatePort(seed: Seed, region: string): PortLayout {
  const numericSeed = seedNumber(seed);
  const random = seededRandom(numericSeed ^ 0x4f17a9b3);
  const regionLower = region.toLowerCase();
  const style: PortLayout['style'] = regionLower.includes('canary')
    ? 'canary'
    : regionLower.includes('atoll')
      ? 'atoll'
      : regionLower.includes('caribbean') || regionLower.includes('windward') || regionLower.includes('pacific') || regionLower.includes('tropical')
        ? 'tropical'
        : 'temperate';
  const palette =
    style === 'canary'
      ? { wallColor: 0xe6dfd1, roofColor: 0xb46549, trimColor: 0x4d7374, stoneColor: 0x655e55 }
      : style === 'tropical'
        ? { wallColor: 0xf0e8d9, roofColor: 0x9f5942, trimColor: 0x4aa1a1, stoneColor: 0x766c5d }
        : style === 'atoll'
          ? { wallColor: 0xf0e7c5, roofColor: 0x688d76, trimColor: 0x328d95, stoneColor: 0x9c9273 }
          : { wallColor: 0xd8d3c5, roofColor: 0x515764, trimColor: 0x536b79, stoneColor: 0x625f5b };
  const quayLengthM = 38 + random() * 18;
  const quayWidthM = 8 + random() * 3.5;
  const buildingCount = 7 + Math.floor(random() * 5);
  const buildings: PortBuilding[] = [];

  for (let i = 0; i < buildingCount; i++) {
    const row = Math.floor(i / 4);
    const column = i % 4;
    buildings.push({
      x: -18 - row * (8 + random() * 5) - random() * 5,
      z: (column - 1.5) * (13 + random() * 3) + (random() - 0.5) * 5,
      width: 5 + random() * 5,
      depth: 5 + random() * 4,
      height: 4 + random() * 6,
      yaw: (random() - 0.5) * 0.24,
    });
  }

  return {
    style,
    quayLengthM,
    quayWidthM,
    pierLengthM: 42 + random() * 22,
    breakwaterLengthM: 48 + random() * 28,
    lighthouseHeightM: style === 'canary' ? 20 + random() * 7 : 16 + random() * 8,
    buildings,
    mooringCount: 8 + Math.floor(random() * 5),
    boatCount: 2 + Math.floor(random() * 3),
    ...palette,
  };
}

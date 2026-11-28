import type { BoatId, BoatSpec, ChandleryItem, CharterContract, ExteriorModelId, WorldHub } from '../types/sailing';
import { computeGreatCircleNm, HANDCRAFTED_HUBS } from './worldHubs';

export interface ExteriorModelMeta {
  id: ExteriorModelId;
  label: string;
  shortLabel: string;
  glbUrl: string;
  shipFamily: 'j80' | 'sergei';
  variant: 'HQ' | 'Compact';
  author: string;
  license: string;
  fileSizeMb: number;
}

export const EXTERIOR_MODEL_ORDER: ExteriorModelId[] = ['j80-hq', 'j80-lite', 'sergei-hq', 'sergei-lite'];

export const EXTERIOR_MODELS: Record<ExteriorModelId, ExteriorModelMeta> = {
  'j80-hq': {
    id: 'j80-hq',
    label: 'J-80 Sailboat (HQ · BoatUS)',
    shortLabel: 'J-80 HQ (BoatUS)',
    glbUrl: '/models/j-80_sailboat.glb',
    shipFamily: 'j80',
    variant: 'HQ',
    author: 'BoatUS Foundation',
    license: 'CC-BY-NC-ND-4.0',
    fileSizeMb: 3.68,
  },
  'j80-lite': {
    id: 'j80-lite',
    label: 'J-80 Sailboat (Compact · BoatUS)',
    shortLabel: 'J-80 Compact',
    glbUrl: '/models/j-80_sailboat%20(1).glb',
    shipFamily: 'j80',
    variant: 'Compact',
    author: 'BoatUS Foundation',
    license: 'CC-BY-NC-ND-4.0',
    fileSizeMb: 4.33,
  },
  'sergei-hq': {
    id: 'sergei-hq',
    label: 'Sailboat by Sergei (HQ)',
    shortLabel: 'Sergei HQ',
    glbUrl: '/models/sailboat.glb',
    shipFamily: 'sergei',
    variant: 'HQ',
    author: 'Sergei',
    license: 'CC-BY-4.0',
    fileSizeMb: 2.02,
  },
  'sergei-lite': {
    id: 'sergei-lite',
    label: 'Sailboat by Sergei (Compact)',
    shortLabel: 'Sergei Compact',
    glbUrl: '/models/sailboat%20(1).glb',
    shipFamily: 'sergei',
    variant: 'Compact',
    author: 'Sergei',
    license: 'CC-BY-4.0',
    fileSizeMb: 1.97,
  },
};

export const BOAT_ORDER: BoatId[] = [
  'elan-19',
  'folkboat-25',
  'contessa-32',
  'rustler-36',
  'hallberg-42',
];

export const BOAT_SPECS: Record<BoatId, BoatSpec> = {
  'elan-19': {
    id: 'elan-19',
    name: 'Elan 19',
    subtitle: '19 ft Coastal & Passage Sloop',
    lengthFt: 19,
    beamFt: 7.8,
    displacementKg: 950,
    hullSpeedKts: 6.4,
    noGoAngleDeg: 40,
    maxSafeHeelDeg: 26,
    rightingMoment: 0.78,
    solarPeakWatts: 55,
    batteryCapacityAh: 95,
    fridgeCapacityDays: 7,
    waterTankLiters: 75,
    spareLockerCapacity: 5,
    priceCoins: 0,
    hullColorHex: 0xf4f1ea,
    trimColorHex: 0x1e3a5f,
    deckLengthM: 5.8,
    deckBeamM: 2.38,
    mastHeightM: 7.8,
    keelType: 'fin',
    hasWheel: false,
    hasWindvane: true,
    hasStaysail: false,
    hasHardDodger: false,
    exteriorModelId: 'j80-hq',
    description:
      'Nimble, responsive 19-foot coastal sloop. Accelerates eagerly in light airs, tender in squalls—demands timely reefing and careful battery management.',
    delftHull: {
      lwlM: 5.05, // published Elan 19 LWL
      bwlM: 1.98, // guess: derived from 2.38m max beam
      tcM: 0.34, // guess: light canoe body draft
      delCM3: 0.88, // guess: canoe-body displacement from 950kg
      cp: 0.56, // guess
      cm: 0.74, // guess
      lcbPct: 0.03, // guess
      lcfPct: 0.06, // guess
      awM2: 7.1, // guess
      swcM2: 8.2, // guess
      roughnessK: 5e-6, // guess: smooth gelcoat
    },
    gzCurve: {
      gm0M: 0.72, // guess: initial GM_0 for 950 kg fin-keel sloop
      gzMaxM: 0.42, // guess: peak GZ arm (m)
      maxGzAngleDeg: 50, // guess: peak GZ angle (deg)
      vanishingStabilityDeg: 112, // guess: AVS (deg)
    },
    reefPoints: [
      { mainAreaFrac: 1.0, mainCeHeightM: 2.60, jibAreaFrac: 1.0, jibCeHeightM: 2.30, staysailAreaFrac: 0, staysailCeHeightM: 0 },
      { mainAreaFrac: 0.72, mainCeHeightM: 2.15, jibAreaFrac: 0.85, jibCeHeightM: 2.02, staysailAreaFrac: 0, staysailCeHeightM: 0 },
      { mainAreaFrac: 0.46, mainCeHeightM: 1.72, jibAreaFrac: 0.62, jibCeHeightM: 1.78, staysailAreaFrac: 0, staysailCeHeightM: 0 },
    ], // guess: slab reef & headsail furl geometry
    defaultCfg: {
      boatLengthM: 5.8,
      massKg: 950,
      sailAreaM2: 12.5,
      jibAreaM2: 7.2,
      staysailAreaM2: 0,
      keelAreaM2: 0.88,
      rudderAreaM2: 0.34,
      wingSurDragM2: 2.15,
      stabilityBody: 0.82,
      stabilitySails: 2.65,
      pitchDampening: 0.85,
      dailyUpkeepCr: 18,
    },
  },
  'folkboat-25': {
    id: 'folkboat-25',
    name: 'Nordic Folkboat 25',
    subtitle: '25 ft Clinker Long-Keel Cruiser',
    lengthFt: 25,
    beamFt: 7.3,
    displacementKg: 1950,
    hullSpeedKts: 6.9,
    noGoAngleDeg: 38,
    maxSafeHeelDeg: 30,
    rightingMoment: 1.02,
    solarPeakWatts: 85,
    batteryCapacityAh: 140,
    fridgeCapacityDays: 11,
    waterTankLiters: 110,
    spareLockerCapacity: 7,
    priceCoins: 650,
    hullColorHex: 0xdfd3bf,
    trimColorHex: 0x7c2d12,
    deckLengthM: 7.64,
    deckBeamM: 2.22,
    mastHeightM: 9.6,
    keelType: 'long',
    hasWheel: false,
    hasWindvane: true,
    hasStaysail: false,
    hasHardDodger: false,
    exteriorModelId: 'sergei-hq',
    description:
      'Lapstrake clinker classic with a long keel and doghouse cabin. Sea-kindly motion in steep chop and forgiving directional tracking under tiller or windvane.',
    delftHull: {
      lwlM: 6.00, // published Nordic Folkboat LWL (6.0m)
      bwlM: 1.94, // guess: derived from 2.22m max beam
      tcM: 0.54, // guess: long-keel canoe transition
      delCM3: 1.65, // guess: canoe body portion of 1950kg
      cp: 0.55, // guess
      cm: 0.73, // guess
      lcbPct: 0.03, // guess
      lcfPct: 0.05, // guess
      awM2: 8.5, // guess
      swcM2: 11.4, // guess
      roughnessK: 8e-6, // guess: clinker planking roughness
    },
    gzCurve: {
      gm0M: 0.84, // guess: Folkboat initial GM_0
      gzMaxM: 0.56, // guess: peak GZ arm (m)
      maxGzAngleDeg: 58, // guess
      vanishingStabilityDeg: 128, // guess: AVS (deg)
    },
    reefPoints: [
      { mainAreaFrac: 1.0, mainCeHeightM: 3.05, jibAreaFrac: 1.0, jibCeHeightM: 2.68, staysailAreaFrac: 0, staysailCeHeightM: 0 },
      { mainAreaFrac: 0.74, mainCeHeightM: 2.52, jibAreaFrac: 0.84, jibCeHeightM: 2.36, staysailAreaFrac: 0, staysailCeHeightM: 0 },
      { mainAreaFrac: 0.48, mainCeHeightM: 2.02, jibAreaFrac: 0.64, jibCeHeightM: 2.06, staysailAreaFrac: 0, staysailCeHeightM: 0 },
    ], // guess: Folkboat deep-reefing luff/CE geometry
    defaultCfg: {
      boatLengthM: 7.64,
      massKg: 1950,
      sailAreaM2: 16.5,
      jibAreaM2: 8.8,
      staysailAreaM2: 0,
      keelAreaM2: 1.65,
      rudderAreaM2: 0.46,
      wingSurDragM2: 2.85,
      stabilityBody: 1.05,
      stabilitySails: 3.1,
      pitchDampening: 1.02,
      dailyUpkeepCr: 24,
    },
  },
  'contessa-32': {
    id: 'contessa-32',
    name: 'Contessa 32',
    subtitle: '32 ft Fastnet Fin-and-Skeg Sloop',
    lengthFt: 32,
    beamFt: 9.5,
    displacementKg: 4300,
    hullSpeedKts: 7.8,
    noGoAngleDeg: 35,
    maxSafeHeelDeg: 33,
    rightingMoment: 1.28,
    solarPeakWatts: 130,
    batteryCapacityAh: 220,
    fridgeCapacityDays: 16,
    waterTankLiters: 165,
    spareLockerCapacity: 9,
    priceCoins: 1150,
    hullColorHex: 0x1e3a5f,
    trimColorHex: 0xe2e8f0,
    deckLengthM: 9.75,
    deckBeamM: 2.9,
    mastHeightM: 12.1,
    keelType: 'skeg',
    hasWheel: true,
    hasWindvane: true,
    hasStaysail: false,
    hasHardDodger: false,
    exteriorModelId: 'j80-hq',
    description:
      'Proven Fastnet storm survivor with deep fin-and-skeg keel, high ballast ratio, and crisp upwind pointing ability across open ocean troughs.',
    delftHull: {
      lwlM: 7.32, // published Contessa 32 LWL (24 ft = 7.32m)
      bwlM: 2.45, // guess: derived from 2.90m max beam
      tcM: 0.58, // guess
      delCM3: 3.92, // guess: canoe body portion of 4300kg
      cp: 0.54, // guess
      cm: 0.76, // guess
      lcbPct: 0.03, // guess
      lcfPct: 0.06, // guess
      awM2: 12.8, // guess
      swcM2: 16.8, // guess
      roughnessK: 5e-6, // guess
    },
    gzCurve: {
      gm0M: 1.02, // guess: Contessa 32 high ballast ratio GM_0
      gzMaxM: 0.68, // guess: peak GZ arm (m)
      maxGzAngleDeg: 64, // guess
      vanishingStabilityDeg: 136, // published Fastnet-class Contessa 32 AVS (~136 deg)
    },
    reefPoints: [
      { mainAreaFrac: 1.0, mainCeHeightM: 3.78, jibAreaFrac: 1.0, jibCeHeightM: 3.35, staysailAreaFrac: 0, staysailCeHeightM: 0 },
      { mainAreaFrac: 0.72, mainCeHeightM: 3.12, jibAreaFrac: 0.85, jibCeHeightM: 2.95, staysailAreaFrac: 0, staysailCeHeightM: 0 },
      { mainAreaFrac: 0.46, mainCeHeightM: 2.48, jibAreaFrac: 0.65, jibCeHeightM: 2.56, staysailAreaFrac: 0, staysailCeHeightM: 0 },
    ], // guess: Contessa 32 offshore slab-reef geometry
    defaultCfg: {
      boatLengthM: 9.75,
      massKg: 4300,
      sailAreaM2: 24.5,
      jibAreaM2: 18.0,
      staysailAreaM2: 0,
      keelAreaM2: 2.35,
      rudderAreaM2: 0.62,
      wingSurDragM2: 4.05,
      stabilityBody: 1.28,
      stabilitySails: 3.85,
      pitchDampening: 1.15,
      dailyUpkeepCr: 34,
    },
  },
  'rustler-36': {
    id: 'rustler-36',
    name: 'Rustler 36',
    subtitle: '36 ft Bluewater Long-Keel Cutter',
    lengthFt: 36,
    beamFt: 11.0,
    displacementKg: 7600,
    hullSpeedKts: 8.4,
    noGoAngleDeg: 36,
    maxSafeHeelDeg: 35,
    rightingMoment: 1.48,
    solarPeakWatts: 185,
    batteryCapacityAh: 320,
    fridgeCapacityDays: 24,
    waterTankLiters: 260,
    spareLockerCapacity: 12,
    priceCoins: 1800,
    hullColorHex: 0x1b3b4b,
    trimColorHex: 0xc29248,
    deckLengthM: 10.7,
    deckBeamM: 3.35,
    mastHeightM: 13.8,
    keelType: 'long',
    hasWheel: true,
    hasWindvane: true,
    hasStaysail: true,
    hasHardDodger: false,
    exteriorModelId: 'sergei-hq',
    description:
      'Iconic British bluewater cutter with encapsulated long keel, inner staysail for storm balance, deep-freeze galley, and twin solar arch for the Great Capes.',
    delftHull: {
      lwlM: 8.23, // published Rustler 36 LWL (27 ft = 8.23m)
      bwlM: 2.82, // guess: derived from 3.35m max beam
      tcM: 1.05, // guess: deep encapsulated long-keel canoe trunk (outside Delft fin-keel range)
      delCM3: 6.95, // guess: heavy cruiser displacement from 7600kg (LWL/delC^(1/3) = 4.31 < 4.34)
      cp: 0.54, // guess
      cm: 0.78, // guess
      lcbPct: 0.03, // guess
      lcfPct: 0.05, // guess
      awM2: 16.8, // guess
      swcM2: 23.4, // guess
      roughnessK: 5e-6, // guess
    },
    gzCurve: {
      gm0M: 1.12, // guess: Rustler 36 heavy displacement GM_0
      gzMaxM: 0.76, // guess: peak GZ arm (m)
      maxGzAngleDeg: 66, // guess
      vanishingStabilityDeg: 134, // guess: bluewater cruiser AVS (deg)
    },
    reefPoints: [
      { mainAreaFrac: 1.0, mainCeHeightM: 4.25, jibAreaFrac: 1.0, jibCeHeightM: 3.75, staysailAreaFrac: 1.0, staysailCeHeightM: 2.52 },
      { mainAreaFrac: 0.73, mainCeHeightM: 3.52, jibAreaFrac: 0.82, jibCeHeightM: 3.32, staysailAreaFrac: 1.0, staysailCeHeightM: 2.52 },
      { mainAreaFrac: 0.47, mainCeHeightM: 2.82, jibAreaFrac: 0.60, jibCeHeightM: 2.90, staysailAreaFrac: 0.90, staysailCeHeightM: 2.35 },
    ], // guess: Rustler 36 cutter reef-point & inner staysail geometry
    defaultCfg: {
      boatLengthM: 10.7,
      massKg: 7600,
      sailAreaM2: 31.0,
      jibAreaM2: 22.0,
      staysailAreaM2: 9.5,
      keelAreaM2: 3.1,
      rudderAreaM2: 0.76,
      wingSurDragM2: 5.2,
      stabilityBody: 1.48,
      stabilitySails: 4.35,
      pitchDampening: 1.25,
      dailyUpkeepCr: 44,
    },
  },
  'hallberg-42': {
    id: 'hallberg-42',
    name: 'Hallberg-Rassy 42',
    subtitle: '42 ft Center-Cockpit Expedition Cutter',
    lengthFt: 42,
    beamFt: 12.9,
    displacementKg: 11800,
    hullSpeedKts: 9.1,
    noGoAngleDeg: 35,
    maxSafeHeelDeg: 37,
    rightingMoment: 1.72,
    solarPeakWatts: 280,
    batteryCapacityAh: 460,
    fridgeCapacityDays: 34,
    waterTankLiters: 420,
    spareLockerCapacity: 16,
    priceCoins: 2900,
    hullColorHex: 0xf8fafc,
    trimColorHex: 0x1d4ed8,
    deckLengthM: 12.85,
    deckBeamM: 3.94,
    mastHeightM: 16.4,
    keelType: 'skeg',
    hasWheel: true,
    hasWindvane: true,
    hasStaysail: true,
    hasHardDodger: true,
    exteriorModelId: 'sergei-hq',
    description:
      'Swedish center-cockpit circumnavigator featuring a fixed hard dodger, heavy cutter rig, massive tankage, and high solar autonomy for multi-week crossings.',
    delftHull: {
      lwlM: 10.35, // published Hallberg-Rassy 42 LWL
      bwlM: 3.28, // guess: derived from 3.94m max beam
      tcM: 0.78, // guess
      delCM3: 10.9, // guess: canoe body portion of 11800kg
      cp: 0.55, // guess
      cm: 0.77, // guess
      lcbPct: 0.032, // guess
      lcfPct: 0.062, // guess
      awM2: 24.4, // guess
      swcM2: 30.8, // guess
      roughnessK: 5e-6, // guess
    },
    gzCurve: {
      gm0M: 1.26, // guess: Hallberg-Rassy 42 stiff cruiser GM_0
      gzMaxM: 0.84, // guess: peak GZ arm (m)
      maxGzAngleDeg: 65, // guess
      vanishingStabilityDeg: 132, // guess: AVS (deg)
    },
    reefPoints: [
      { mainAreaFrac: 1.0, mainCeHeightM: 4.85, jibAreaFrac: 1.0, jibCeHeightM: 4.28, staysailAreaFrac: 1.0, staysailCeHeightM: 2.88 },
      { mainAreaFrac: 0.73, mainCeHeightM: 4.02, jibAreaFrac: 0.84, jibCeHeightM: 3.78, staysailAreaFrac: 1.0, staysailCeHeightM: 2.88 },
      { mainAreaFrac: 0.48, mainCeHeightM: 3.22, jibAreaFrac: 0.64, jibCeHeightM: 3.32, staysailAreaFrac: 0.90, staysailCeHeightM: 2.68 },
    ], // guess: Hallberg-Rassy 42 expedition cutter reef-point geometry
    defaultCfg: {
      boatLengthM: 12.85,
      massKg: 11800,
      sailAreaM2: 39.0,
      jibAreaM2: 29.0,
      staysailAreaM2: 12.5,
      keelAreaM2: 3.9,
      rudderAreaM2: 0.94,
      wingSurDragM2: 6.45,
      stabilityBody: 1.72,
      stabilitySails: 4.95,
      pitchDampening: 1.38,
      dailyUpkeepCr: 60,
    },
  },
};

export const CHANDLERY_ITEMS: ChandleryItem[] = [
  {
    id: 'sail-repair-kit',
    name: 'Dacron Sail Repair Kit',
    description: 'Waxed twine, palm, and heavy adhesive Dacron patches (+35% Mainsail).',
    price: 110,
    lockerSlots: 1,
    targetSystem: 'mainsail',
    repairAmount: 35,
  },
  {
    id: 'shackle-rigging-pack',
    name: '316 Stainless Rigging Pack',
    description: 'Turnbuckle pins, halyard shackles, and Dyneema strop (+35% Rigging).',
    price: 140,
    lockerSlots: 1,
    targetSystem: 'rigging',
    repairAmount: 35,
  },
  {
    id: 'antifouling-epoxy',
    name: 'Copper Antifoul & Epoxy',
    description: 'Marine barrier putty and copper bottom paint (+35% Hull).',
    price: 160,
    lockerSlots: 2,
    targetSystem: 'hull',
    repairAmount: 35,
  },
  {
    id: 'rudder-pintle-kit',
    name: 'Bronze Rudder Pintle & Line',
    description: 'Replacement pintle bushing and spectra steering cable (+40% Rudder).',
    price: 130,
    lockerSlots: 1,
    targetSystem: 'rudder',
    repairAmount: 40,
  },
  {
    id: 'agm-cell-kit',
    name: 'AGM Deep-Cycle Cell',
    description: 'Restores house bank capacity and solar regulator (+40% Battery Health).',
    price: 150,
    lockerSlots: 2,
    targetSystem: 'battery',
    repairAmount: 40,
  },
  {
    id: 'compressor-seal',
    name: 'Danfoss Fridge Seal & Gas',
    description: 'Recharges 12V keel-cooled evaporator and door gasket (+40% Fridge).',
    price: 120,
    lockerSlots: 1,
    targetSystem: 'fridge',
    repairAmount: 40,
  },
  {
    id: 'provisions-crate',
    name: 'Galley Provisions & Fresh Water',
    description: 'Restocks dry stores, cold provisions (+5 days) and 60L fresh water.',
    price: 85,
    provisionsDaysAdd: 5,
    waterLitersAdd: 60,
  },
];

export function countLockerSlotsUsed(parts: Record<string, number>): number {
  let used = 0;
  for (const [itemId, qty] of Object.entries(parts)) {
    if (qty <= 0) continue;
    const item = CHANDLERY_ITEMS.find((c) => c.id === itemId);
    used += (item?.lockerSlots ?? 1) * qty;
  }
  return used;
}

export function generatePortContracts(
  fromHubId: string,
  toHubId: string,
  boatId: BoatId,
): CharterContract[] {
  const origin = HANDCRAFTED_HUBS.find((h) => h.id === fromHubId) ?? HANDCRAFTED_HUBS[0];
  const dest = HANDCRAFTED_HUBS.find((h) => h.id === toHubId) ?? HANDCRAFTED_HUBS[1];
  const network = dest.routeNetwork ?? 'trade-wind';
  const sameNetworkHubs = HANDCRAFTED_HUBS.filter((hub) => (hub.routeNetwork ?? 'trade-wind') === network);
  const onward =
    sameNetworkHubs.find((hub) => hub.orderIndex === dest.orderIndex + 1 && hub.id !== origin.id) ??
    sameNetworkHubs.find((hub) => hub.id !== origin.id && hub.id !== dest.id) ??
    sameNetworkHubs[0];

  const legNm =
    origin.id === 'lanzarote' && dest.id === 'la-gomera'
      ? 100
      : Math.max(45, computeGreatCircleNm(origin.lat, origin.lon, dest.lat, dest.lon));
  const onwardNm = Math.max(60, computeGreatCircleNm(origin.lat, origin.lon, onward.lat, onward.lon));
  const spec = BOAT_SPECS[boatId];
  const vesselMult = 0.85 + spec.lengthFt * 0.017;

  return [
    {
      id: `charter-${origin.id}-${dest.id}-mail`,
      title: `${dest.name.split('(')[0].trim()} Diplomatic & Chart Pouch`,
      cargoType: 'Watertight Dispatch',
      fromHubId: origin.id,
      toHubId: dest.id,
      toName: dest.name,
      distanceNm: legNm,
      rewardCr: Math.round((220 + legNm * 2.2) * vesselMult),
      deadlineHours: Math.round(legNm / 3.4 + 14),
      fragile: false,
    },
    {
      id: `charter-${origin.id}-${dest.id}-gear`,
      title: 'Precision Barograph & Marine Spares',
      cargoType: 'Fragile Instruments',
      fromHubId: origin.id,
      toHubId: dest.id,
      toName: dest.name,
      distanceNm: legNm,
      rewardCr: Math.round((340 + legNm * 3.1) * vesselMult),
      deadlineHours: Math.round(legNm / 3.9 + 10),
      fragile: true,
    },
    {
      id: `charter-${origin.id}-${onward.id}-expedition`,
      title: `Bluewater Charter: ${onward.name.split(',')[0]}`,
      cargoType: 'Expedition Stores',
      fromHubId: origin.id,
      toHubId: onward.id,
      toName: onward.name,
      distanceNm: onwardNm,
      rewardCr: Math.round((380 + onwardNm * 2.8) * vesselMult),
      deadlineHours: Math.round(onwardNm / 4.0 + 18),
      fragile: false,
    },
  ];
}

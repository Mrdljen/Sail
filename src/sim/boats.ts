import type { BoatId, BoatSpec, ChandleryItem, CharterContract, WorldHub } from '../types/sailing';
import { computeGreatCircleNm, HANDCRAFTED_HUBS } from './worldHubs';

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
    priceCoins: 0,
    hullColorHex: 0xf4f1ea,
    trimColorHex: 0x1e3a5f,
    deckLengthM: 5.8,
    deckBeamM: 2.38,
    mastHeightM: 7.8,
    hasWheel: false,
    hasWindvane: true,
    description:
      'Nimble, responsive 19-foot trailer-sailer. Quick to accelerate in light airs, tender in squalls—demands timely reefing and careful battery management.',
    defaultCfg: {
      boatLengthM: 5.8,
      massKg: 950,
      sailAreaM2: 12.5,
      jibAreaM2: 7.2,
      keelAreaM2: 0.88,
      rudderAreaM2: 0.34,
      wingSurDragM2: 2.15,
      stabilityBody: 0.78,
      stabilitySails: 2.65,
      pitchDampening: 0.85,
      dailyUpkeepCr: 18,
    },
  },
  'rustler-36': {
    id: 'rustler-36',
    name: 'Rustler 36',
    subtitle: '36 ft Bluewater Long-Keel Cruiser',
    lengthFt: 36,
    beamFt: 11.0,
    displacementKg: 7600,
    hullSpeedKts: 8.4,
    noGoAngleDeg: 36,
    maxSafeHeelDeg: 35,
    rightingMoment: 1.45,
    solarPeakWatts: 180,
    batteryCapacityAh: 320,
    fridgeCapacityDays: 24,
    priceCoins: 1800,
    hullColorHex: 0x1b3b4b,
    trimColorHex: 0xc29248,
    deckLengthM: 10.7,
    deckBeamM: 3.35,
    mastHeightM: 13.8,
    hasWheel: true,
    hasWindvane: true,
    description:
      'Iconic British bluewater cruiser with an encapsulated long keel, deep-freeze galley, twin solar arch, and heavy-weather self-steering stability for the Great Capes.',
    defaultCfg: {
      boatLengthM: 10.7,
      massKg: 7600,
      sailAreaM2: 33.5,
      jibAreaM2: 26.0,
      keelAreaM2: 3.1,
      rudderAreaM2: 0.76,
      wingSurDragM2: 5.4,
      stabilityBody: 1.48,
      stabilitySails: 4.35,
      pitchDampening: 1.25,
      dailyUpkeepCr: 44,
    },
  },
};

export const CHANDLERY_ITEMS: ChandleryItem[] = [
  {
    id: 'sail-repair-kit',
    name: 'Dacron Sail Repair Kit',
    description: 'Waxed twine, palm, and heavy adhesive Dacron patches (+35% Mainsail).',
    price: 110,
    targetSystem: 'mainsail',
    repairAmount: 35,
  },
  {
    id: 'shackle-rigging-pack',
    name: '316 Stainless Rigging Pack',
    description: 'Turnbuckle pins, halyard shackles, and Dyneema strop (+35% Rigging).',
    price: 140,
    targetSystem: 'rigging',
    repairAmount: 35,
  },
  {
    id: 'antifouling-epoxy',
    name: 'Copper Antifoul & Epoxy',
    description: 'Marine barrier putty and copper bottom paint (+35% Hull).',
    price: 160,
    targetSystem: 'hull',
    repairAmount: 35,
  },
  {
    id: 'rudder-pintle-kit',
    name: 'Bronze Rudder Pintle & Line',
    description: 'Replacement pintle bushing and spectra steering cable (+40% Rudder).',
    price: 130,
    targetSystem: 'rudder',
    repairAmount: 40,
  },
  {
    id: 'agm-cell-kit',
    name: 'AGM Deep-Cycle Cell',
    description: 'Restores house bank capacity and solar regulator (+40% Battery Health).',
    price: 150,
    targetSystem: 'battery',
    repairAmount: 40,
  },
  {
    id: 'compressor-seal',
    name: 'Danfoss Fridge Seal & Gas',
    description: 'Recharges 12V keel-cooled evaporator and door gasket (+40% Fridge).',
    price: 120,
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

export function generatePortContracts(
  fromHubId: string,
  toHubId: string,
  boatId: BoatId,
): CharterContract[] {
  const origin = HANDCRAFTED_HUBS.find((h) => h.id === fromHubId) ?? HANDCRAFTED_HUBS[0];
  const dest = HANDCRAFTED_HUBS.find((h) => h.id === toHubId) ?? HANDCRAFTED_HUBS[1];
  const nextIdx = (dest.orderIndex + 1) % HANDCRAFTED_HUBS.length;
  const onward: WorldHub = HANDCRAFTED_HUBS[nextIdx];

  const legNm =
    origin.id === 'lanzarote' && dest.id === 'la-gomera'
      ? 100
      : Math.max(45, computeGreatCircleNm(origin.lat, origin.lon, dest.lat, dest.lon));
  const onwardNm = Math.max(60, computeGreatCircleNm(origin.lat, origin.lon, onward.lat, onward.lon));
  const vesselMult = boatId === 'rustler-36' ? 1.45 : 1.0;

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

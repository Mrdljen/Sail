import type { WorldHub } from '../types/sailing';

// 28 handcrafted iconic cruising hubs following the Trade-Wind ("Coconut Milk Run")
// and the Three Great Capes (Cape of Good Hope, Cape Leeuwin, Cape Horn)
export const HANDCRAFTED_HUBS: WorldHub[] = [
  {
    id: 'lanzarote',
    name: 'Lanzarote (Arrecife)',
    region: 'Canary Islands',
    lat: 28.96,
    lon: -13.55,
    prevailingWindDirDeg: 35,
    prevailingWindKts: 16,
    cycloneMonths: [],
    harborType: 'Trade Hub',
    chandleryTier: 3,
    orderIndex: 0,
    description: 'Volcanic Atlantic staging ground where trade-wind passages begin.',
  },
  {
    id: 'la-gomera',
    name: 'La Gomera (San Sebastián)',
    region: 'Canary Islands',
    lat: 28.09,
    lon: -17.11,
    prevailingWindDirDeg: 40,
    prevailingWindKts: 17,
    cycloneMonths: [],
    harborType: 'Trade Hub',
    chandleryTier: 2,
    orderIndex: 1,
    description: 'Steep basalt cliffs, sheltered cove anchorage, and classic 100 NM channel shakedown.',
  },
  {
    id: 'mindelo',
    name: 'Mindelo (São Vicente)',
    region: 'Cape Verde',
    lat: 16.89,
    lon: -24.99,
    prevailingWindDirDeg: 45,
    prevailingWindKts: 20,
    cycloneMonths: [8, 9],
    harborType: 'Trade Hub',
    chandleryTier: 2,
    orderIndex: 2,
    description: 'Final Atlantic provision stop riding brisk NE trades before the 2,100 NM crossing.',
  },
  {
    id: 'st-lucia',
    name: 'Rodney Bay, St. Lucia',
    region: 'Eastern Caribbean',
    lat: 14.08,
    lon: -60.95,
    prevailingWindDirDeg: 75,
    prevailingWindKts: 18,
    cycloneMonths: [7, 8, 9, 10],
    harborType: 'Trade Hub',
    chandleryTier: 3,
    orderIndex: 3,
    description: 'Iconic landfall of the Atlantic trade-wind crossing.',
  },
  {
    id: 'grenada',
    name: "St. George's, Grenada",
    region: 'Windward Islands',
    lat: 12.05,
    lon: -61.75,
    prevailingWindDirDeg: 85,
    prevailingWindKts: 16,
    cycloneMonths: [7, 8, 9, 10],
    harborType: 'Trade Hub',
    chandleryTier: 2,
    orderIndex: 4,
    description: 'Spice island anchorage at the southern rim of the hurricane belt.',
  },
  {
    id: 'curacao',
    name: 'Willemstad, Curaçao',
    region: 'Southern Caribbean',
    lat: 12.11,
    lon: -68.93,
    prevailingWindDirDeg: 95,
    prevailingWindKts: 19,
    cycloneMonths: [],
    harborType: 'Trade Hub',
    chandleryTier: 3,
    orderIndex: 5,
    description: 'Well-stocked Dutch Leeward chandlery outside the main cyclone track.',
  },
  {
    id: 'san-blas',
    name: 'San Blas (Guna Yala)',
    region: 'Caribbean Panama',
    lat: 9.57,
    lon: -78.82,
    prevailingWindDirDeg: 35,
    prevailingWindKts: 14,
    cycloneMonths: [],
    harborType: 'Atoll',
    chandleryTier: 1,
    orderIndex: 6,
    description: '365 coral cays guarding the approach to the Panama Canal.',
  },
  {
    id: 'panama-canal',
    name: 'Balboa / Panama Canal',
    region: 'Central America',
    lat: 8.95,
    lon: -79.57,
    prevailingWindDirDeg: 15,
    prevailingWindKts: 11,
    cycloneMonths: [],
    harborType: 'Canal',
    chandleryTier: 3,
    orderIndex: 7,
    description: 'Gateway to the Pacific Ocean; transit Gatun Lake and stock spare rigging.',
  },
  {
    id: 'galapagos',
    name: 'Puerto Ayora, Galápagos',
    region: 'Eastern Pacific',
    lat: -0.74,
    lon: -90.31,
    prevailingWindDirDeg: 135,
    prevailingWindKts: 13,
    cycloneMonths: [],
    harborType: 'Trade Hub',
    chandleryTier: 2,
    orderIndex: 8,
    description: 'Equatorial volcanic archipelago with strong Humboldt currents and sea lions.',
  },
  {
    id: 'marquesas',
    name: 'Nuku Hiva, Marquesas',
    region: 'French Polynesia',
    lat: -8.91,
    lon: -140.1,
    prevailingWindDirDeg: 105,
    prevailingWindKts: 17,
    cycloneMonths: [1, 2, 3],
    harborType: 'Trade Hub',
    chandleryTier: 2,
    orderIndex: 9,
    description: 'Towering emerald spires after 3,000 NM of open Pacific swells.',
  },
  {
    id: 'fakarava',
    name: 'Fakarava Atoll, Tuamotus',
    region: 'French Polynesia',
    lat: -16.05,
    lon: -145.61,
    prevailingWindDirDeg: 100,
    prevailingWindKts: 16,
    cycloneMonths: [12, 1, 2, 3],
    harborType: 'Atoll',
    chandleryTier: 1,
    orderIndex: 10,
    description: 'Low coral ring demanding exact slack-tide pass entry.',
  },
  {
    id: 'tahiti',
    name: 'Papeete, Tahiti',
    region: 'Society Islands',
    lat: -17.54,
    lon: -149.57,
    prevailingWindDirDeg: 95,
    prevailingWindKts: 15,
    cycloneMonths: [12, 1, 2, 3],
    harborType: 'Trade Hub',
    chandleryTier: 3,
    orderIndex: 11,
    description: 'Central South Pacific refit port with full rigging loft and provisions.',
  },
  {
    id: 'bora-bora',
    name: 'Bora Bora Lagoon',
    region: 'Society Islands',
    lat: -16.5,
    lon: -151.74,
    prevailingWindDirDeg: 105,
    prevailingWindKts: 15,
    cycloneMonths: [12, 1, 2, 3],
    harborType: 'Atoll',
    chandleryTier: 2,
    orderIndex: 12,
    description: 'Turquoise lagoon encircled by barrier reef and Mount Otemanu.',
  },
  {
    id: 'tonga',
    name: "Neiafu, Vava'u",
    region: 'Kingdom of Tonga',
    lat: -18.65,
    lon: -173.98,
    prevailingWindDirDeg: 115,
    prevailingWindKts: 16,
    cycloneMonths: [11, 12, 1, 2, 3, 4],
    harborType: 'Trade Hub',
    chandleryTier: 2,
    orderIndex: 13,
    description: 'Deep coral fjord hurricane hole famous with Coconut Milk Run crews.',
  },
  {
    id: 'fiji',
    name: 'Port Denarau / Savusavu',
    region: 'Fiji',
    lat: -17.77,
    lon: 177.38,
    prevailingWindDirDeg: 120,
    prevailingWindKts: 16,
    cycloneMonths: [11, 12, 1, 2, 3, 4],
    harborType: 'Trade Hub',
    chandleryTier: 3,
    orderIndex: 14,
    description: 'Crossroads of the South Pacific with reef-threaded passages.',
  },
  {
    id: 'vanuatu',
    name: 'Port Vila, Vanuatu',
    region: 'Melanesia',
    lat: -17.73,
    lon: 168.32,
    prevailingWindDirDeg: 125,
    prevailingWindKts: 17,
    cycloneMonths: [11, 12, 1, 2, 3, 4],
    harborType: 'Trade Hub',
    chandleryTier: 2,
    orderIndex: 15,
    description: 'Volcanic harbor stepping stone toward the Coral Sea.',
  },
  {
    id: 'torres-strait',
    name: 'Thursday Island (Torres Strait)',
    region: 'Northern Australia',
    lat: -10.58,
    lon: 142.22,
    prevailingWindDirDeg: 120,
    prevailingWindKts: 19,
    cycloneMonths: [12, 1, 2, 3],
    harborType: 'Trade Hub',
    chandleryTier: 2,
    orderIndex: 16,
    description: 'Fierce 5-knot tidal rips threading the reefs into the Indian Ocean.',
  },
  {
    id: 'darwin',
    name: 'Darwin Harbour',
    region: 'Australia',
    lat: -12.46,
    lon: 130.84,
    prevailingWindDirDeg: 110,
    prevailingWindKts: 15,
    cycloneMonths: [11, 12, 1, 2, 3, 4],
    harborType: 'Trade Hub',
    chandleryTier: 3,
    orderIndex: 17,
    description: 'Massive 7-meter tides and Indian Ocean staging port.',
  },
  {
    id: 'cocos-keeling',
    name: 'Direction Island, Cocos Keeling',
    region: 'Indian Ocean',
    lat: -12.09,
    lon: 96.88,
    prevailingWindDirDeg: 120,
    prevailingWindKts: 19,
    cycloneMonths: [12, 1, 2, 3],
    harborType: 'Atoll',
    chandleryTier: 1,
    orderIndex: 18,
    description: 'Remote palm atoll halfway across the Indian Ocean trade winds.',
  },
  {
    id: 'mauritius',
    name: 'Port Louis, Mauritius',
    region: 'Mascarene Islands',
    lat: -20.16,
    lon: 57.5,
    prevailingWindDirDeg: 115,
    prevailingWindKts: 18,
    cycloneMonths: [1, 2, 3],
    harborType: 'Trade Hub',
    chandleryTier: 3,
    orderIndex: 19,
    description: 'Last major haul-out and rigging check before rounding Southern Africa.',
  },
  {
    id: 'durban',
    name: 'Durban',
    region: 'South Africa',
    lat: -29.86,
    lon: 31.05,
    prevailingWindDirDeg: 55,
    prevailingWindKts: 21,
    cycloneMonths: [],
    harborType: 'Trade Hub',
    chandleryTier: 3,
    orderIndex: 20,
    description: 'Wait for a calm weather window before riding the Agulhas Current south.',
  },
  {
    id: 'cape-town',
    name: 'Cape Town (Cape of Good Hope)',
    region: 'Great Cape #1',
    lat: -33.91,
    lon: 18.42,
    prevailingWindDirDeg: 160,
    prevailingWindKts: 26,
    cycloneMonths: [],
    harborType: 'Great Cape',
    chandleryTier: 3,
    orderIndex: 21,
    description: 'Table Mountain and the Roaring Forties boundary; fierce Cape Doctor southeasters.',
  },
  {
    id: 'st-helena',
    name: 'Jamestown, St. Helena',
    region: 'South Atlantic',
    lat: -15.92,
    lon: -5.72,
    prevailingWindDirDeg: 135,
    prevailingWindKts: 17,
    cycloneMonths: [],
    harborType: 'Trade Hub',
    chandleryTier: 1,
    orderIndex: 22,
    description: 'Open roadstead anchorage beneath sheer volcanic cliffs in the SE trades.',
  },
  {
    id: 'fernando-noronha',
    name: 'Fernando de Noronha',
    region: 'Brazil',
    lat: -3.84,
    lon: -32.41,
    prevailingWindDirDeg: 120,
    prevailingWindKts: 16,
    cycloneMonths: [],
    harborType: 'Atoll',
    chandleryTier: 1,
    orderIndex: 23,
    description: 'Emerald Atlantic sanctuary just south of the Equator.',
  },
  {
    id: 'azores',
    name: 'Horta, Faial (Azores)',
    region: 'North Atlantic',
    lat: 38.53,
    lon: -28.62,
    prevailingWindDirDeg: 245,
    prevailingWindKts: 20,
    cycloneMonths: [],
    harborType: 'Trade Hub',
    chandleryTier: 3,
    orderIndex: 24,
    description: "Peter's Café Sport and painted breakwater seawall completing the Atlantic circle.",
  },
  {
    id: 'cape-leeuwin',
    name: 'Albany / Cape Leeuwin',
    region: 'Great Cape #2',
    lat: -35.03,
    lon: 117.88,
    prevailingWindDirDeg: 260,
    prevailingWindKts: 28,
    cycloneMonths: [],
    harborType: 'Great Cape',
    chandleryTier: 2,
    orderIndex: 25,
    description: 'Southern Ocean swells sweeping around Australia’s southwestern Great Cape.',
  },
  {
    id: 'hobart',
    name: 'Hobart, Tasmania',
    region: 'Southern Ocean',
    lat: -42.88,
    lon: 147.33,
    prevailingWindDirDeg: 270,
    prevailingWindKts: 25,
    cycloneMonths: [],
    harborType: 'Trade Hub',
    chandleryTier: 3,
    orderIndex: 26,
    description: 'Storm-tested timber and steel cruising haven at 42° South.',
  },
  {
    id: 'cape-horn',
    name: 'Ushuaia / Cape Horn',
    region: 'Great Cape #3',
    lat: -55.98,
    lon: -67.27,
    prevailingWindDirDeg: 275,
    prevailingWindKts: 34,
    cycloneMonths: [],
    harborType: 'Great Cape',
    chandleryTier: 2,
    orderIndex: 27,
    description: 'The Everest of sailing: ferocious westerlies, short steep seas, and albatrosses.',
  },
];

// Deterministic PRNG for procedural intermediate atolls and coves
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ATOLL_PREFIXES = [
  'Coral',
  'Tradewind',
  'Caldera',
  'Pelican',
  'Meridian',
  'Lagoon',
  'Basalt',
  'Albatross',
  'Crescent',
  'Turquoise',
  'Windward',
  'Leeward',
  'Sextant',
  'Petrel',
  'Compass',
  'Reef',
];

const ATOLL_SUFFIXES = ['Atoll', 'Cove', 'Cay', 'Bight', 'Anchorage', 'Bay', 'Haven', 'Sound'];

export function computeGreatCircleNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const rNm = 3440.065; // Earth radius in nautical miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(rNm * c);
}

/**
 * Generates deterministic procedural intermediate anchorages/atolls along a passage
 * between two hubs (or across the whole world grid), keeping storage tiny.
 */
export function generateIntermediateAnchorages(
  from: WorldHub,
  to: WorldHub,
  count = 4,
): WorldHub[] {
  const distNm = computeGreatCircleNm(from.lat, from.lon, to.lat, to.lon);
  if (distNm < 45) return [];

  let seed = 0;
  const key = `${from.id}-${to.id}`;
  for (let i = 0; i < key.length; i++) {
    seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  }
  const rng = mulberry32(seed);
  const actualCount = Math.min(count, Math.max(1, Math.floor(distNm / 120)));
  const results: WorldHub[] = [];

  for (let i = 1; i <= actualCount; i++) {
    const t = i / (actualCount + 1);
    const jitterLat = (rng() - 0.5) * 1.4;
    const jitterLon = (rng() - 0.5) * 1.6;
    const lat = from.lat + (to.lat - from.lat) * t + jitterLat;
    let lon = from.lon + (to.lon - from.lon) * t + jitterLon;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;

    const prefix = ATOLL_PREFIXES[Math.floor(rng() * ATOLL_PREFIXES.length)];
    const suffix = ATOLL_SUFFIXES[Math.floor(rng() * ATOLL_SUFFIXES.length)];
    const windDir = Math.round(
      (from.prevailingWindDirDeg + (to.prevailingWindDirDeg - from.prevailingWindDirDeg) * t + 360) % 360,
    );
    const windKts = Math.round(
      from.prevailingWindKts + (to.prevailingWindKts - from.prevailingWindKts) * t + (rng() - 0.5) * 4,
    );

    results.push({
      id: `proc-${from.id}-${to.id}-${i}`,
      name: `${prefix} ${suffix}`,
      region: 'Procedural Anchorage',
      lat: Number(lat.toFixed(2)),
      lon: Number(lon.toFixed(2)),
      prevailingWindDirDeg: windDir,
      prevailingWindKts: Math.max(8, windKts),
      cycloneMonths: from.cycloneMonths,
      harborType: 'Atoll',
      chandleryTier: 1,
      orderIndex: -1,
      isProcedural: true,
      description: `Uncharted ${suffix.toLowerCase()} offering lee protection, sand holding, and tidal swing.`,
    });
  }
  return results;
}

export function isCycloneRiskMonth(hub: WorldHub, month: number): boolean {
  return hub.cycloneMonths.includes(month);
}

export const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

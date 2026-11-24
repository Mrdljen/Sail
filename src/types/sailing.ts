export type BoatId = 'elan-19' | 'rustler-36';

export type CameraViewMode = 'third-person' | 'first-person-helm' | 'first-person-cabin';

export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type ReefLevel = 0 | 1 | 2; // 0 = Full main, 1 = Reef 1 (75%), 2 = Reef 2 (50%)

export type AutopilotMode = 'manual' | 'windvane' | 'compass';

export type WeatherPhase = 'trade-winds' | 'barometer-falling' | 'squall' | 'clearing';

export type PointOfSail =
  | 'In Irons'
  | 'Close-Hauled'
  | 'Close Reach'
  | 'Beam Reach'
  | 'Broad Reach'
  | 'Running';

export interface BoatSpec {
  id: BoatId;
  name: string;
  subtitle: string;
  lengthFt: number;
  beamFt: number;
  displacementKg: number;
  hullSpeedKts: number;
  noGoAngleDeg: number; // minimum AWA in full simulation
  maxSafeHeelDeg: number;
  rightingMoment: number; // higher = stiffer, resists heel in gusts
  solarPeakWatts: number;
  batteryCapacityAh: number;
  fridgeCapacityDays: number;
  priceCoins: number;
  hullColorHex: number;
  trimColorHex: number;
  deckLengthM: number;
  deckBeamM: number;
  mastHeightM: number;
  hasWheel: boolean;
  hasWindvane: boolean;
  description: string;
}

export interface ElectricalState {
  navLights: boolean;
  cabinLights: boolean;
  vhfRadio: boolean;
  instruments: boolean;
  fridgeOn: boolean;
  bilgePump: boolean;
  batteryAh: number; // current charge in Ah
  batteryCapacityAh: number;
  solarWatts: number; // live generation in W
  drawWatts: number; // live consumption in W
  voltage: number; // 11.2V - 14.2V
  fridgeTempC: number; // 2°C - 16°C
  provisionsDays: number; // food & fresh water remaining
  waterLiters: number;
}

export interface BoatWearState {
  mainsail: number; // 0 - 100
  rigging: number; // 0 - 100
  hull: number; // 0 - 100
  rudder: number; // 0 - 100
  battery: number; // 0 - 100
  fridge: number; // 0 - 100
}

export type SystemKey = keyof BoatWearState;

export interface ChandleryItem {
  id: string;
  name: string;
  description: string;
  price: number;
  targetSystem?: SystemKey;
  repairAmount?: number;
  provisionsDaysAdd?: number;
  waterLitersAdd?: number;
}

export interface InventoryState {
  coins: number;
  parts: Record<string, number>; // itemId -> count
}

export interface AnchorState {
  deployed: boolean;
  anchorLatNm: number; // local NM coords where anchor rests
  anchorLonNm: number;
  rodeLengthM: number;
  depthAtAnchorM: number;
  holdingQuality: 'Sand' | 'Coral' | 'Mud' | 'Deep';
  holdingFactor: number; // 0 - 1
  dragging: boolean;
  tideHeightM: number; // -1.2 to +1.2m
  tidePhaseLabel: 'Flooding' | 'High Slack' | 'Ebbing' | 'Low Slack';
  tidalCurrentDeg: number;
  tidalCurrentKts: number;
  swingAngleDeg: number; // current rode angle from anchor to boat
}

export interface WeatherState {
  phase: WeatherPhase;
  trueWindDirDeg: number; // wind blowing FROM this compass angle
  trueWindSpeedKts: number;
  gustSpeedKts: number;
  barometerHpa: number; // 1020 normal -> 998 squall
  barometerTrend: 'Steady' | 'Falling Rapidly' | 'Rising';
  waveHeightM: number;
  cloudCover: number; // 0 - 1
  rainIntensity: number; // 0 - 1
  timeOfDayHours: number; // 0 - 24
  squallTriggered: boolean;
  squallCleared: boolean;
  forecastText: string;
}

export interface WorldHub {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  prevailingWindDirDeg: number;
  prevailingWindKts: number;
  cycloneMonths: number[]; // 1-12 unsafe cyclone window
  harborType: 'Trade Hub' | 'Great Cape' | 'Atoll' | 'Canal';
  chandleryTier: 1 | 2 | 3;
  orderIndex: number;
  description: string;
  isProcedural?: boolean;
}

export interface PassageState {
  fromHubId: string;
  toHubId: string;
  fromName: string;
  toName: string;
  totalDistanceNm: number;
  distanceSailedNm: number;
  xNm: number; // local east-west NM (0 = start harbor, totalDistanceNm = destination cove)
  zNm: number; // local cross-track NM
  depthM: number;
  elapsedHours: number;
  peakSpeedKts: number;
  maxGustKts: number;
  arrivedAtCove: boolean;
  voyageComplete: boolean;
  visitedHubIds: string[];
  monthOfYear: number; // 1-12 for cyclone window check
}

export interface SimulationState {
  boatId: BoatId;
  simRealism: number; // 0 = Arcade, 1 = Full Simulation
  headingDeg: number; // 0 = North, 90 = East
  rudderAngleDeg: number; // -35 to +35
  boatSpeedKts: number;
  leewayDeg: number;
  heelDeg: number; // positive = heeling starboard
  pitchDeg: number;
  apparentWindAngleDeg: number; // -180 to +180 relative to bow
  apparentWindSpeedKts: number;
  pointOfSail: PointOfSail;
  mainsheetPct: number; // 0 (eased/luffing) to 100 (strapped)
  jibsheetPct: number; // 0 to 100
  jibDeployed: boolean;
  reefLevel: ReefLevel;
  sailEfficiency: number; // 0 - 1
  isLuffing: boolean;
  isOverpowered: boolean;
  autopilotMode: AutopilotMode;
  autopilotTargetDeg: number; // heading for compass or AWA for windvane
  timeCompression: 1 | 10 | 60;
  electrical: ElectricalState;
  wear: BoatWearState;
  inventory: InventoryState;
  anchor: AnchorState;
  weather: WeatherState;
  passage: PassageState;
  alertMessage: string | null;
  lastLogEntry: string;
}

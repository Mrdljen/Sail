export type BoatId = 'elan-19' | 'folkboat-25' | 'contessa-32' | 'rustler-36' | 'hallberg-42';
export type ExteriorModelId = 'j80-hq' | 'j80-lite' | 'sergei-hq' | 'sergei-lite';

export type CameraViewMode = 'third-person' | 'first-person-helm' | 'first-person-cabin';

export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type ReefLevel = 0 | 1 | 2; // 0 = Full main, 1 = Reef 1 (75%), 2 = Reef 2 (50%)

export type AutopilotMode = 'manual' | 'windvane' | 'compass';

export type WeatherPhase = 'trade-winds' | 'barometer-falling' | 'squall' | 'clearing';

export type RealismPreset = 'arcade' | 'cruising' | 'simulation';

export interface RealismSwitchProfile {
  preset: RealismPreset;
  label: string;
  noGoDeg: number;
  autoTrimAssist: boolean;
  inIronsGhostDrive: boolean;
  accidentalGybeDamage: boolean;
  waveSlamAndSurf: boolean;
  forgivingHeelCapDeg: number;
  wearRateScale: number;
  leewayScale: number;
}

export type PointOfSail =
  | 'In Irons'
  | 'Close-Hauled'
  | 'Close Reach'
  | 'Beam Reach'
  | 'Broad Reach'
  | 'Running';

export type TackSide = 'port' | 'starboard';

export type ManeuverState =
  | 'sailing'
  | 'in-irons'
  | 'tacking'
  | 'gybing'
  | 'by-the-lee'
  | 'crash-gybe';

/**
 * Virtual Sailor NG-inspired moddable boat.cfg / elements.cfg physical surface tuning
 */
export interface VesselCfgParams {
  boatLengthM: number;
  massKg: number;
  sailAreaM2: number;
  jibAreaM2: number;
  staysailAreaM2: number;
  keelAreaM2: number;
  rudderAreaM2: number;
  wingSurDragM2: number; // [wing_sur] hydrodynamic skin & hull drag area
  stabilityBody: number; // hull form righting coefficient
  stabilitySails: number; // heeling moment lever arm
  pitchDampening: number;
  dailyUpkeepCr: number; // Ship Happens daily running & insurance cost
}

export interface CharterContract {
  id: string;
  title: string;
  cargoType: string;
  fromHubId: string;
  toHubId: string;
  toName: string;
  distanceNm: number;
  rewardCr: number;
  deadlineHours: number;
  fragile: boolean;
}

export interface DelftHullParams {
  lwlM: number; // waterline length LWL (m)
  bwlM: number; // waterline beam BWL (m) — "guess" when derived from max beam
  tcM: number; // canoe body draft Tc (m) — "guess"
  delCM3: number; // canoe body volumetric displacement (m^3) — "guess" from dispKg
  cp: number; // prismatic coefficient CP — "guess"
  cm: number; // midship section coefficient CM — "guess"
  lcbPct: number; // LCB offset aft of midship as fraction of LWL — "guess"
  lcfPct: number; // LCF offset aft of midship as fraction of LWL — "guess"
  awM2: number; // waterplane area AW (m^2) — "guess"
  swcM2: number; // unheeled canoe-body wetted surface Swc (m^2) — "guess"
  roughnessK: number; // equivalent uniform surface roughness k (m), default 5e-6
}

export interface GzCurveParams {
  gm0M: number; // initial transverse metacentric height GM_0 (m) — "guess"
  gzMaxM: number; // peak righting arm GZ_max (m) — "guess"
  maxGzAngleDeg: number; // heel angle (deg) of maximum righting arm — "guess"
  vanishingStabilityDeg: number; // Angle of Vanishing Stability (AVS, deg) — "guess"
}

export interface ReefPointSpec {
  mainAreaFrac: number; // geometric remaining mainsail area fraction — "guess"
  mainCeHeightM: number; // geometric mainsail CE height above waterline (m) — "guess"
  jibAreaFrac: number; // geometric foresail/jib area fraction — "guess"
  jibCeHeightM: number; // geometric jib CE height above waterline (m) — "guess"
  staysailAreaFrac: number; // geometric staysail area fraction — "guess"
  staysailCeHeightM: number; // geometric staysail CE height above waterline (m) — "guess"
}

export interface BoatSpec {
  id: BoatId;
  exteriorModelId: ExteriorModelId;
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
  waterTankLiters: number;
  spareLockerCapacity: number;
  priceCoins: number;
  hullColorHex: number;
  trimColorHex: number;
  deckLengthM: number;
  deckBeamM: number;
  mastHeightM: number;
  keelType: 'fin' | 'long' | 'skeg';
  hasWheel: boolean;
  hasWindvane: boolean;
  hasStaysail: boolean;
  hasHardDodger: boolean;
  description: string;
  delftHull: DelftHullParams;
  gzCurve: GzCurveParams;
  reefPoints: readonly [ReefPointSpec, ReefPointSpec, ReefPointSpec]; // [Reef 0, Reef 1, Reef 2]
  defaultCfg: VesselCfgParams;
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
  lockerSlots?: number;
  targetSystem?: SystemKey;
  repairAmount?: number;
  provisionsDaysAdd?: number;
  waterLitersAdd?: number;
}

export interface InventoryState {
  coins: number;
  parts: Record<string, number>; // itemId -> count
  activeContract: CharterContract | null;
  totalRunningCostsCr: number;
  totalChartersCompleted: number;
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
  oceanCurrentDirDeg: number; // direction surface current sets TOWARD
  oceanCurrentKts: number;
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
  routeNetwork?: 'trade-wind' | 'croatia-adriatic';
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
  channelHazardWarning: boolean;
  groundingCount: number;
  upkeepChargedDays: number;
}

export interface DistressRecoveryState {
  active: boolean;
  cause: 'rigging-failure' | 'hull-breach' | 'provisions-depleted';
  title: string;
  description: string;
  towCostCr: number;
  timePenaltyHours: number;
}

export interface SimulationState {
  saveVersion: number;
  boatId: BoatId;
  exteriorModelId: ExteriorModelId;
  vesselCfg: VesselCfgParams;
  simRealism: number; // 0 = Arcade, 0.5 = Cruising, 1 = Full Simulation
  realismPreset: RealismPreset;
  headingDeg: number; // 0 = North, 90 = East
  cogDeg: number; // Course Over Ground (deg)
  rudderAngleDeg: number; // -35 to +35
  // True integrated rigid-body velocities (4-DOF)
  surgeVelMs: number;
  swayVelMs: number;
  yawRateDegS: number;
  rollVelDegS: number;
  wavePitchDeg: number;
  boatSpeedKts: number; // Speed Through Water (STW)
  sogKts: number; // Speed Over Ground (SOG)
  leewayDeg: number;
  heelDeg: number; // positive = heeling starboard
  pitchDeg: number;
  apparentWindAngleDeg: number; // -180 to +180 relative to bow
  apparentWindSpeedKts: number;
  pointOfSail: PointOfSail;
  tackSide: TackSide;
  boomSide: -1 | 1; // -1 = boom out to port, +1 = boom out to starboard
  boomAngleDeg: number; // signed boom swing relative to centerline
  maneuverState: ManeuverState;
  angleOfAttackDeg: number; // live aerodynamic AoA on mainsail foil
  sailLiftN: number;
  sailDragN: number;
  mainsheetPct: number; // 0 (eased/luffing) to 100 (strapped)
  jibsheetPct: number; // 0 to 100
  jibDeployed: boolean;
  staysailDeployed: boolean;
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
  distress: DistressRecoveryState | null;
  alertMessage: string | null;
  lastLogEntry: string;
}

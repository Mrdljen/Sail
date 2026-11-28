import { BOAT_SPECS, CHANDLERY_ITEMS, EXTERIOR_MODELS, countLockerSlotsUsed } from './boats';
import {
  classifyPointOfSail,
  getOptimalSheetPct,
  getReefAreaFactor,
  KTS_TO_MS,
  MS_TO_KTS,
  solveFoilAndManeuver,
  WATER_RHO,
  type FoilForceOutput,
} from './foilPhysics';
import { computeGzRightingMomentNm, evaluateHullResistance } from './hullPhysics';
import { getRealismProfile } from './realism';
import { computeRiggingFailureChance, evaluateWearFactors, HYDRO_TUNING, WEAR_TUNING } from './tuning';
import { computeGreatCircleNm, HANDCRAFTED_HUBS } from './worldHubs';
import type {
  BoatId,
  CharterContract,
  DistressRecoveryState,
  ExteriorModelId,
  ReefLevel,
  SimulationState,
  SystemKey,
  VesselCfgParams,
  WorldHub,
} from '../types/sailing';

export { classifyPointOfSail, getOptimalSheetPct, getReefAreaFactor, getRealismProfile };

export const CURRENT_SAVE_VERSION = 3;
export const FIXED_PHYSICS_DT = 1 / 60; // 60 Hz deterministic fixed physics step

export function normalizeAngle360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

export function normalizeAngle180(deg: number): number {
  let r = normalizeAngle360(deg);
  if (r > 180) r -= 360;
  return r;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Computes Apparent Wind Angle (relative to bow, -180..+180; positive = wind from starboard)
 * and Apparent Wind Speed (knots).
 */
export function computeApparentWind(
  headingDeg: number,
  boatSpeedKts: number,
  trueWindDirDeg: number,
  trueWindSpeedKts: number,
): { awaDeg: number; awsKts: number } {
  const hRad = degToRad(headingDeg);
  const wFromRad = degToRad(trueWindDirDeg);

  const wToRad = wFromRad + Math.PI;
  const windVx = Math.sin(wToRad) * trueWindSpeedKts;
  const windVz = -Math.cos(wToRad) * trueWindSpeedKts;

  const boatVx = Math.sin(hRad) * boatSpeedKts;
  const boatVz = -Math.cos(hRad) * boatSpeedKts;

  const appToVx = windVx - boatVx;
  const appToVz = windVz - boatVz;
  const awsKts = Math.hypot(appToVx, appToVz);

  const appFromVx = -appToVx;
  const appFromVz = -appToVz;
  const appFromDirDeg = normalizeAngle360(radToDeg(Math.atan2(appFromVx, -appFromVz)));

  const awaDeg = normalizeAngle180(appFromDirDeg - headingDeg);
  return { awaDeg, awsKts };
}

/**
 * Computes water depth in meters along the passage, including Ship Happens-style
 * harbor approach channel shoals if straying outside |zNm| > 0.72 NM near port.
 */
export function computeDepthAtPassage(xNm: number, zNm: number, totalDistanceNm: number): number {
  const distFromStart = Math.hypot(xNm, zNm);
  const distFromDest = Math.hypot(totalDistanceNm - xNm, zNm);
  const nearestCoastNm = Math.min(distFromStart, distFromDest);

  if (nearestCoastNm < 3.2 && Math.abs(zNm) > 0.72) {
    const shoalFactor = clamp((Math.abs(zNm) - 0.72) / 1.1, 0, 1);
    return lerp(4.4, 1.5, shoalFactor);
  }

  if (nearestCoastNm < 0.35) return 5.8;
  if (nearestCoastNm < 1.2) return lerp(6.0, 14.0, (nearestCoastNm - 0.35) / 0.85);
  if (nearestCoastNm < 4.0) return lerp(14.0, 85.0, (nearestCoastNm - 1.2) / 2.8);
  return lerp(85, 2400, clamp((nearestCoastNm - 4.0) / 18.0, 0, 1));
}

export function createInitialSimulationState(
  boatId: BoatId = 'elan-19',
  fromHub?: WorldHub,
  toHub?: WorldHub,
): SimulationState {
  const spec = BOAT_SPECS[boatId] ?? BOAT_SPECS['elan-19'];
  const origin = fromHub ?? HANDCRAFTED_HUBS[0];
  const dest = toHub ?? HANDCRAFTED_HUBS[1];

  const isDefaultVerticalSlice = origin.id === 'lanzarote' && dest.id === 'la-gomera';
  const totalDistanceNm = isDefaultVerticalSlice
    ? 100
    : Math.max(45, computeGreatCircleNm(origin.lat, origin.lon, dest.lat, dest.lon));

  const initSpeedKts = Math.min(spec.hullSpeedKts * 0.72, 4.8 + (spec.lengthFt - 19) * 0.08);
  const simRealism = 0.65;
  const profile = getRealismProfile(simRealism, spec.noGoAngleDeg);

  return {
    saveVersion: CURRENT_SAVE_VERSION,
    boatId: spec.id,
    exteriorModelId: spec.exteriorModelId,
    vesselCfg: { ...spec.defaultCfg },
    simRealism,
    realismPreset: profile.preset,
    headingDeg: 90,
    cogDeg: 90,
    rudderAngleDeg: 0,
    surgeVelMs: initSpeedKts * KTS_TO_MS,
    swayVelMs: 0.08,
    yawRateDegS: 0,
    rollVelDegS: 0,
    wavePitchDeg: 0,
    boatSpeedKts: initSpeedKts,
    sogKts: initSpeedKts + 0.4,
    leewayDeg: 1.5,
    heelDeg: -8, // Port tack (wind from port = AWA -65) -> heels starboard (negative rotation around Z? Let's keep sign consistent with solveFoil)
    pitchDeg: 0,
    apparentWindAngleDeg: -65,
    apparentWindSpeedKts: 15.2,
    pointOfSail: 'Close Reach',
    tackSide: 'port',
    boomSide: 1,
    boomAngleDeg: 24,
    maneuverState: 'sailing',
    angleOfAttackDeg: 22,
    sailLiftN: 680,
    sailDragN: 190,
    mainsheetPct: 76,
    jibsheetPct: 74,
    jibDeployed: true,
    staysailDeployed: spec.hasStaysail,
    reefLevel: 0,
    sailEfficiency: 0.92,
    isLuffing: false,
    isOverpowered: false,
    autopilotMode: 'manual',
    autopilotTargetDeg: 90,
    timeCompression: 1,
    electrical: {
      navLights: false,
      cabinLights: true,
      vhfRadio: true,
      instruments: true,
      fridgeOn: true,
      bilgePump: false,
      batteryAh: spec.batteryCapacityAh * 0.88,
      batteryCapacityAh: spec.batteryCapacityAh,
      solarWatts: Math.round(spec.solarPeakWatts * 0.78),
      drawWatts: 34,
      voltage: 12.7,
      fridgeTempC: 4.2,
      provisionsDays: spec.fridgeCapacityDays,
      waterLiters: spec.waterTankLiters * 0.85,
    },
    wear: {
      mainsail: 96,
      rigging: 97,
      hull: 95,
      rudder: 98,
      battery: 96,
      fridge: 95,
    },
    inventory: {
      coins: 650,
      parts: {
        'sail-repair-kit': 1,
      },
      activeContract: null,
      totalRunningCostsCr: 0,
      totalChartersCompleted: 0,
    },
    anchor: {
      deployed: false,
      anchorLatNm: 0,
      anchorLonNm: 0,
      rodeLengthM: 35,
      depthAtAnchorM: 8,
      holdingQuality: 'Sand',
      holdingFactor: 0.9,
      dragging: false,
      tideHeightM: 0.4,
      tidePhaseLabel: 'Flooding',
      tidalCurrentDeg: 90,
      tidalCurrentKts: 0.8,
      swingAngleDeg: 0,
    },
    weather: {
      phase: 'trade-winds',
      trueWindDirDeg: 25,
      trueWindSpeedKts: 15,
      gustSpeedKts: 17,
      barometerHpa: 1018,
      barometerTrend: 'Steady',
      waveHeightM: 1.1,
      oceanCurrentDirDeg: 110,
      oceanCurrentKts: 0.7,
      cloudCover: 0.25,
      rainIntensity: 0,
      timeOfDayHours: 10.5,
      squallTriggered: false,
      squallCleared: false,
      forecastText:
        'VHF Ch 16 Weatherfax: NE Trade Winds 14-18 kts, barometer 1018 hPa steady. Watch for afternoon squall trough near 40 NM.',
    },
    passage: {
      fromHubId: origin.id,
      toHubId: dest.id,
      fromName: origin.name,
      toName: dest.name,
      totalDistanceNm,
      distanceSailedNm: 0,
      xNm: 2.2,
      zNm: 0,
      depthM: 28,
      elapsedHours: 0,
      peakSpeedKts: initSpeedKts,
      maxGustKts: 17,
      arrivedAtCove: false,
      voyageComplete: false,
      visitedHubIds: [origin.id],
      monthOfYear: 11,
      channelHazardWarning: false,
      groundingCount: 0,
      upkeepChargedDays: 0,
    },
    distress: null,
    alertMessage: null,
    lastLogEntry: `Cleared ${origin.name} harbor mouth bound for ${dest.name} (${totalDistanceNm} NM).`,
  };
}

/**
 * Safely migrates persisted v1 or partial v2 localStorage payloads to current v2 SimulationState.
 */
export function migrateSaveState(rawParsed: unknown): SimulationState {
  if (!rawParsed || typeof rawParsed !== 'object') {
    return createInitialSimulationState('elan-19');
  }
  const parsed = rawParsed as Partial<SimulationState>;
  const validBoatId: BoatId =
    parsed.boatId && parsed.boatId in BOAT_SPECS ? parsed.boatId : 'elan-19';
  const base = createInitialSimulationState(validBoatId);
  const spec = BOAT_SPECS[validBoatId];
  const simRealism = typeof parsed.simRealism === 'number' ? clamp(parsed.simRealism, 0, 1) : base.simRealism;
  const profile = getRealismProfile(simRealism, spec.noGoAngleDeg);

  return {
    ...base,
    ...parsed,
    saveVersion: CURRENT_SAVE_VERSION,
    boatId: validBoatId,
    exteriorModelId:
      parsed.exteriorModelId && parsed.exteriorModelId in EXTERIOR_MODELS
        ? (parsed.exteriorModelId as ExteriorModelId)
        : spec.exteriorModelId,
    simRealism,
    realismPreset: profile.preset,
    surgeVelMs:
      typeof parsed.surgeVelMs === 'number'
        ? parsed.surgeVelMs
        : (parsed.boatSpeedKts ?? base.boatSpeedKts) * KTS_TO_MS,
    swayVelMs: typeof parsed.swayVelMs === 'number' ? parsed.swayVelMs : 0,
    yawRateDegS: typeof parsed.yawRateDegS === 'number' ? parsed.yawRateDegS : 0,
    rollVelDegS: typeof parsed.rollVelDegS === 'number' ? parsed.rollVelDegS : 0,
    wavePitchDeg: typeof parsed.wavePitchDeg === 'number' ? parsed.wavePitchDeg : 0,
    staysailDeployed:
      typeof parsed.staysailDeployed === 'boolean' ? parsed.staysailDeployed : spec.hasStaysail,
    vesselCfg: { ...base.vesselCfg, ...(parsed.vesselCfg ?? {}) },
    electrical: { ...base.electrical, ...(parsed.electrical ?? {}) },
    wear: { ...base.wear, ...(parsed.wear ?? {}) },
    inventory: { ...base.inventory, ...(parsed.inventory ?? {}) },
    anchor: { ...base.anchor, ...(parsed.anchor ?? {}) },
    weather: { ...base.weather, ...(parsed.weather ?? {}) },
    passage: { ...base.passage, ...(parsed.passage ?? {}) },
    distress: parsed.distress ?? null,
  };
}

export type SailForceResult = FoilForceOutput;

export function computeSailForces(
  state: SimulationState,
  apparentWindAngleDeg: number,
  apparentWindSpeedKts: number,
): SailForceResult {
  return solveFoilAndManeuver(state, apparentWindAngleDeg, apparentWindSpeedKts);
}

export function updateWeather(
  state: SimulationState,
  simHoursDelta: number,
  forceSquall = false,
): SimulationState['weather'] {
  const w = { ...state.weather };
  w.timeOfDayHours = (w.timeOfDayHours + simHoursDelta) % 24;

  const progressRatio = state.passage.xNm / Math.max(1, state.passage.totalDistanceNm);
  const squallMultiplier = lerp(0.55, 1.0, state.simRealism);

  if (
    !w.squallCleared &&
    (forceSquall || (!w.squallTriggered && progressRatio >= 0.28 && progressRatio <= 0.65))
  ) {
    if (w.phase === 'trade-winds') {
      w.phase = 'barometer-falling';
      w.barometerTrend = 'Falling Rapidly';
      w.squallTriggered = true;
      w.forecastText =
        'SQUALL WARNING: Barometer dropping sharply! Darkening cumulonimbus front ahead—reef mainsail now.';
    }
  }

  if (w.phase === 'barometer-falling') {
    w.barometerHpa = Math.max(999, w.barometerHpa - simHoursDelta * 14);
    w.cloudCover = clamp(w.cloudCover + simHoursDelta * 0.65, 0, 0.92);
    w.trueWindSpeedKts = lerp(w.trueWindSpeedKts, 21, clamp(simHoursDelta * 0.8, 0, 1));
    w.gustSpeedKts = w.trueWindSpeedKts + 5;
    w.waveHeightM = clamp(w.waveHeightM + simHoursDelta * 0.9, 1.0, 2.4);

    if (forceSquall || w.barometerHpa <= 1003 || progressRatio >= 0.38) {
      w.phase = 'squall';
      w.barometerHpa = 999;
      w.cloudCover = 0.96;
      w.rainIntensity = 0.9;
      w.trueWindSpeedKts = lerp(24, 34, squallMultiplier);
      w.gustSpeedKts = lerp(28, 39, squallMultiplier);
      w.waveHeightM = lerp(2.1, 3.3, squallMultiplier);
      w.forecastText =
        'ACTIVE SQUALL: 30+ kt gusts and steep beam chop! Drop to Reef 1 or Reef 2 to protect sails and rigging.';
    }
  } else if (w.phase === 'squall') {
    const gustPulse = Math.sin(state.passage.elapsedHours * 9.0) * 4.5;
    const baseSquall = lerp(24, 33, squallMultiplier);
    w.trueWindSpeedKts = baseSquall + gustPulse * 0.5;
    w.gustSpeedKts = baseSquall + 5.5 + Math.abs(gustPulse);
    w.rainIntensity = 0.85;

    if (progressRatio >= 0.66) {
      w.phase = 'clearing';
      w.barometerTrend = 'Rising';
      w.squallCleared = true;
      w.forecastText =
        'Squall front passing astern. Barometer rising; steady trade winds returning toward landfall.';
    }
  } else if (w.phase === 'clearing') {
    w.barometerHpa = Math.min(1019, w.barometerHpa + simHoursDelta * 10);
    w.cloudCover = Math.max(0.22, w.cloudCover - simHoursDelta * 0.5);
    w.rainIntensity = Math.max(0, w.rainIntensity - simHoursDelta * 0.9);
    w.trueWindSpeedKts = lerp(w.trueWindSpeedKts, 16, clamp(simHoursDelta * 0.8, 0, 1));
    w.gustSpeedKts = w.trueWindSpeedKts + 2.5;
    w.waveHeightM = Math.max(1.1, w.waveHeightM - simHoursDelta * 0.7);
    if (w.barometerHpa >= 1016) {
      w.phase = 'trade-winds';
      w.barometerTrend = 'Steady';
    }
  } else {
    const breezeCycle = Math.sin(w.timeOfDayHours * 0.5) * 2.0;
    w.trueWindSpeedKts = clamp(15 + breezeCycle, 11, 21);
    w.gustSpeedKts = w.trueWindSpeedKts + 2.5;
    w.barometerHpa = 1018;
    w.rainIntensity = 0;
  }

  return w;
}

export function updateElectricalAndGalley(
  state: SimulationState,
  simHoursDelta: number,
): SimulationState['electrical'] {
  const spec = BOAT_SPECS[state.boatId];
  const e = { ...state.electrical };

  const tod = state.weather.timeOfDayHours;
  const sunElevation = Math.max(0, Math.sin(((tod - 6) / 12) * Math.PI));
  const cloudFactor = 1 - state.weather.cloudCover * 0.75;
  e.solarWatts = spec.solarPeakWatts * sunElevation * cloudFactor;

  let draw = 4;
  if (e.instruments) draw += 12;
  if (e.vhfRadio) draw += 8;
  if (e.navLights) draw += 18;
  if (e.cabinLights) draw += 10;
  if (e.fridgeOn) draw += e.fridgeTempC > 5 ? 36 : 16;
  if (e.bilgePump) draw += 28;
  if (state.autopilotMode === 'compass') draw += 26;
  e.drawWatts = draw;

  const netWatts = e.solarWatts - e.drawWatts;
  const effectiveCap = e.batteryCapacityAh * clamp(state.wear.battery / 100, 0.45, 1.0);
  const deltaAh = (netWatts / 12.5) * simHoursDelta;
  e.batteryAh = clamp(e.batteryAh + deltaAh, 0, effectiveCap);

  const soc = e.batteryAh / Math.max(1, effectiveCap);
  e.voltage = 11.1 + soc * 2.1 + (e.solarWatts > e.drawWatts ? 0.6 : 0);

  if (e.batteryAh <= 0.5) {
    e.fridgeOn = false;
    e.cabinLights = false;
    e.instruments = false;
  }

  const fridgeHealth = clamp(state.wear.fridge / 100, 0.3, 1.0);
  if (e.fridgeOn && e.batteryAh > 0.5) {
    const targetTemp = lerp(7.0, 3.2, fridgeHealth);
    e.fridgeTempC = lerp(e.fridgeTempC, targetTemp, clamp(simHoursDelta * 1.4, 0, 1));
  } else {
    e.fridgeTempC = lerp(e.fridgeTempC, 24.0, clamp(simHoursDelta * 0.35, 0, 1));
  }

  const spoilageMultiplier = e.fridgeTempC > 10 ? 2.1 : 1.0;
  e.provisionsDays = Math.max(0, e.provisionsDays - (simHoursDelta / 24) * spoilageMultiplier);
  e.waterLiters = Math.max(0, e.waterLiters - (simHoursDelta / 24) * 3.5);

  return e;
}

export function updateAnchorAndTide(
  state: SimulationState,
  simHoursDelta: number,
  xNm: number,
  zNm: number,
  _depthM: number,
): { anchor: SimulationState['anchor']; xNm: number; zNm: number; headingDeg: number } {
  const a = { ...state.anchor };

  const tideCycleRad = (state.passage.elapsedHours / 12.42) * Math.PI * 2;
  a.tideHeightM = Math.sin(tideCycleRad) * 1.15;
  const tideSlope = Math.cos(tideCycleRad);

  if (Math.abs(tideSlope) < 0.18) {
    a.tidePhaseLabel = a.tideHeightM >= 0 ? 'High Slack' : 'Low Slack';
  } else {
    a.tidePhaseLabel = tideSlope > 0 ? 'Flooding' : 'Ebbing';
  }

  a.tidalCurrentDeg = tideSlope >= 0 ? 75 : 255;
  a.tidalCurrentKts = Math.abs(tideSlope) * 1.4;

  if (!a.deployed) {
    return { anchor: a, xNm, zNm, headingDeg: state.headingDeg };
  }

  const totalVerticalM = Math.max(2, a.depthAtAnchorM + a.tideHeightM + 1.2);
  const scopeRatio = a.rodeLengthM / totalVerticalM;
  const windLoad = state.weather.trueWindSpeedKts / 25;
  const requiredScope = 3.2 + windLoad * 2.2;
  a.holdingFactor = clamp(scopeRatio / requiredScope, 0.25, 1.0);
  a.dragging = a.holdingFactor < 0.68 && state.weather.trueWindSpeedKts > 20;

  const windToRad = degToRad(state.weather.trueWindDirDeg + 180);
  const tideToRad = degToRad(a.tidalCurrentDeg);
  const wx = Math.sin(windToRad) * (state.weather.trueWindSpeedKts * 0.08);
  const wz = -Math.cos(windToRad) * (state.weather.trueWindSpeedKts * 0.08);
  const tx = Math.sin(tideToRad) * a.tidalCurrentKts;
  const tz = -Math.cos(tideToRad) * a.tidalCurrentKts;

  const netVx = wx + tx;
  const netVz = wz + tz;
  const targetSwingRad = Math.atan2(netVx, -netVz);
  const targetSwingDeg = normalizeAngle360(radToDeg(targetSwingRad));

  const diff = normalizeAngle180(targetSwingDeg - a.swingAngleDeg);
  a.swingAngleDeg = normalizeAngle360(a.swingAngleDeg + diff * clamp(simHoursDelta * 1.8, 0, 1));

  const scopeRadiusNm = Math.max(0.015, a.rodeLengthM / 1852);
  let nextAnchorLatNm = a.anchorLatNm;
  let nextAnchorLonNm = a.anchorLonNm;

  if (a.dragging) {
    const dragNm = 0.22 * simHoursDelta;
    nextAnchorLonNm += Math.sin(degToRad(a.swingAngleDeg)) * dragNm;
    nextAnchorLatNm += Math.cos(degToRad(a.swingAngleDeg)) * dragNm;
  }

  a.anchorLatNm = nextAnchorLatNm;
  a.anchorLonNm = nextAnchorLonNm;

  const swingRad = degToRad(a.swingAngleDeg);
  const nextX = nextAnchorLonNm + Math.sin(swingRad) * scopeRadiusNm;
  const nextZ = nextAnchorLatNm - Math.cos(swingRad) * scopeRadiusNm;
  const bowToAnchorDeg = normalizeAngle360(a.swingAngleDeg + 180);

  return {
    anchor: a,
    xNm: nextX,
    zNm: nextZ,
    headingDeg: bowToAnchorDeg,
  };
}

/**
 * Single fixed-timestep (`dt <= FIXED_PHYSICS_DT`) 4-DOF Newton-Euler integration step.
 * Keeps all physics quantities at full floating-point precision (never rounded inside physics).
 */
function stepFixedSubstep(
  prev: SimulationState,
  dt: number,
  controls?: { rudderInput?: number; forceSquall?: boolean },
): SimulationState {
  // Base rate: 1x = 0.008 sim hours/sec, 10x = 0.08, 60x = 0.48
  const simHoursDelta = dt * 0.008 * prev.timeCompression;
  const spec = BOAT_SPECS[prev.boatId];
  const cfg = prev.vesselCfg ?? spec.defaultCfg;
  const profile = getRealismProfile(prev.simRealism, spec.noGoAngleDeg);

  // If distress recovery dialog is active, freeze vessel motion until player chooses recovery
  if (prev.distress?.active) {
    return prev;
  }

  const weather = updateWeather(prev, simHoursDelta, controls?.forceSquall);
  const depthM = computeDepthAtPassage(
    prev.passage.xNm,
    prev.passage.zNm,
    prev.passage.totalDistanceNm,
  );

  // Anchored physics branch
  if (prev.anchor.deployed) {
    const anchored = updateAnchorAndTide(
      prev,
      simHoursDelta,
      prev.passage.xNm,
      prev.passage.zNm,
      depthM,
    );
    const { awaDeg, awsKts } = computeApparentWind(
      anchored.headingDeg,
      0,
      weather.trueWindDirDeg,
      weather.trueWindSpeedKts,
    );
    const electrical = updateElectricalAndGalley(prev, simHoursDelta);

    return {
      ...prev,
      realismPreset: profile.preset,
      headingDeg: anchored.headingDeg,
      cogDeg: anchored.headingDeg,
      surgeVelMs: 0,
      swayVelMs: 0,
      yawRateDegS: 0,
      rollVelDegS: 0,
      boatSpeedKts: 0,
      sogKts: 0,
      sailLiftN: 0,
      sailDragN: 0,
      maneuverState: 'sailing',
      heelDeg: Math.sin(degToRad(awaDeg)) * (awsKts / 25) * 4,
      apparentWindAngleDeg: awaDeg,
      apparentWindSpeedKts: awsKts,
      pointOfSail: classifyPointOfSail(Math.abs(awaDeg), profile.noGoDeg),
      electrical,
      weather,
      anchor: anchored.anchor,
      passage: {
        ...prev.passage,
        xNm: anchored.xNm,
        zNm: anchored.zNm,
        depthM,
        elapsedHours: prev.passage.elapsedHours + simHoursDelta,
        maxGustKts: Math.max(prev.passage.maxGustKts, weather.gustSpeedKts),
      },
      alertMessage: anchored.anchor.dragging
        ? 'Anchor dragging! Pay out more rode or reef sails.'
        : prev.alertMessage,
    };
  }

  // 1. Rudder & Autopilot Steering
  let rudderAngleDeg = prev.rudderAngleDeg;
  const rudderInput = controls?.rudderInput ?? 0;
  if (Math.abs(rudderInput) > 0.01) {
    rudderAngleDeg = clamp(rudderAngleDeg + rudderInput * 58 * dt, -35, 35);
  } else if (prev.autopilotMode === 'windvane') {
    const awaError = normalizeAngle180(prev.apparentWindAngleDeg - prev.autopilotTargetDeg);
    rudderAngleDeg = clamp(awaError * 0.55 - prev.yawRateDegS * 0.45, -24, 24);
  } else if (prev.autopilotMode === 'compass') {
    const hdgError = normalizeAngle180(prev.autopilotTargetDeg - prev.headingDeg);
    rudderAngleDeg = clamp(hdgError * 0.65 - prev.yawRateDegS * 0.5, -26, 26);
  } else {
    rudderAngleDeg = lerp(rudderAngleDeg, 0, clamp(dt * 2.2, 0, 1));
  }

  // 2. Apparent Wind from current integrated velocity
  const { awaDeg, awsKts } = computeApparentWind(
    prev.headingDeg,
    prev.boatSpeedKts,
    weather.trueWindDirDeg,
    weather.trueWindSpeedKts,
  );

  // 3. Evaluate Sail Foil & Hydrodynamic Parameters
  const waveCyclePhase = prev.passage.elapsedHours * 4.2;
  const forces = solveFoilAndManeuver(prev, awaDeg, awsKts, waveCyclePhase);

  // 4. True 4-DOF Rigid-Body Momentum Integration
  // Note: timeScale boosts physical acceleration slightly during 10x/60x time compression so momentum responds smoothly without multi-step instability
  const effMassKg = cfg.massKg * 1.08;
  const u = prev.surgeVelMs;
  const v = prev.swayVelMs;

  // Surge resistance: Delft residuary wave-making + ITTC-57 viscous friction + heeled wetted correction + hullF fouling
  const wearFactors = evaluateWearFactors(prev.wear);
  const lengthScale = cfg.boatLengthM / Math.max(1, spec.defaultCfg.boatLengthM);
  const wettedScale = cfg.wingSurDragM2 / Math.max(0.2, spec.defaultCfg.wingSurDragM2);
  const hullFouling = wearFactors.hullDragMult;
  const delftDrag = evaluateHullResistance(
    prev.boatId,
    spec.delftHull,
    u,
    prev.heelDeg,
    spec.keelType,
    lengthScale,
    wettedScale,
    hullFouling,
    true,
  );
  const overpowerDragMult = forces.isOverpowered
    ? 1 + (Math.abs(prev.heelDeg) - spec.maxSafeHeelDeg) * 0.04
    : 1.0;
  const rudRad = degToRad(rudderAngleDeg);
  const turningDragN =
    0.5 * WATER_RHO * cfg.rudderAreaM2 * 2.2 * Math.sin(rudRad) * Math.sin(rudRad) * (u * u + 0.5) +
    Math.abs(prev.yawRateDegS) * cfg.massKg * 0.015;

  const rSurgeN =
    delftDrag.totalDragN * overpowerDragMult * Math.sign(u || 1) +
    forces.waveSlamDragN +
    turningDragN * Math.sign(u || 1);

  const fNetSurgeN = forces.fDriveN + forces.waveSurfPushN - rSurgeN;
  // Scale physical time integration slightly for 1x responsiveness while preserving vessel mass inertia hierarchy
  const physAccelTimeScale = prev.timeCompression === 1 ? 1.85 : 2.6;
  const nextSurgeVelMs = clamp(
    u + (fNetSurgeN / effMassKg) * dt * physAccelTimeScale,
    -0.65,
    forces.hullSpeedMs * 1.24,
  );

  // Sway (lateral leeway) equation: Sail side force vs. Keel hydrodynamic lateral resistance
  const swayMassKg = cfg.massKg * 1.48;
  const uFlowMs = Math.max(0.65, Math.abs(nextSurgeVelMs));
  const keelLatResistanceN =
    0.5 * WATER_RHO * uFlowMs * cfg.keelAreaM2 * 4.6 * v +
    0.5 * WATER_RHO * cfg.wingSurDragM2 * 0.65 * v * Math.abs(v);
  const fNetSwayN = forces.fLatSignedN - keelLatResistanceN;
  const nextSwayVelMs = clamp(
    v + (fNetSwayN / swayMassKg) * dt * physAccelTimeScale,
    -1.6,
    1.6,
  );

  // Yaw rotational dynamics: Rudder hydrodynamic torque + subtle weather helm - keel yaw damping
  const rudderAreaRatio = clamp(cfg.rudderAreaM2 / spec.defaultCfg.rudderAreaM2, 0.5, 1.8);
  const rudderHealth = lerp(0.5, 1.0, prev.wear.rudder / 100);
  const rudderFlowFactor = clamp(Math.abs(nextSurgeVelMs) / 1.35, 0.16, 1.35);
  const lengthAgility = clamp(8.5 / cfg.boatLengthM, 0.68, 1.35);
  const yawInertia = Math.max(1200, cfg.massKg * cfg.boatLengthM * cfg.boatLengthM * 0.085);
  const turnTorque =
    rudderAngleDeg * rudderFlowFactor * rudderAreaRatio * rudderHealth * lengthAgility * yawInertia * 0.96;
  const weatherHelmDeg =
    profile.preset !== 'arcade' && Math.abs(prev.heelDeg) > 16
      ? -Math.sign(prev.heelDeg) * (Math.abs(prev.heelDeg) - 16) * 0.14
      : 0;
  const weatherHelmTorque = weatherHelmDeg * yawInertia * 0.9;
  const yawDampingTorque = prev.yawRateDegS * yawInertia * 2.6;
  const nextYawRateDegS = clamp(
    prev.yawRateDegS + ((turnTorque + weatherHelmTorque - yawDampingTorque) / yawInertia) * dt * physAccelTimeScale,
    -38,
    38,
  );
  const yawStepScale = prev.autopilotMode !== 'manual' ? clamp(Math.sqrt(prev.timeCompression), 1, 4) : 1;
  const headingDeg = normalizeAngle360(prev.headingDeg + nextYawRateDegS * dt * yawStepScale);

  // Roll / Heel 2nd-order rotational dynamics: M_heel * cos(phi)^k - M_GZ(phi) - c * phi_dot
  const heelRad = degToRad(prev.heelDeg);
  const rollInertia = Math.max(450, cfg.massKg * spec.deckBeamM * spec.deckBeamM * 0.14);
  const stabilityScale = cfg.stabilityBody / Math.max(0.1, spec.defaultCfg.stabilityBody);
  const rightingTorqueNm = computeGzRightingMomentNm(
    cfg.massKg,
    prev.heelDeg,
    spec.gzCurve,
    stabilityScale,
  );
  const effectiveHeelingNm =
    forces.heelingTorqueNm *
    Math.pow(Math.max(0.25, Math.cos(heelRad)), HYDRO_TUNING.heelAerodynamicCosExp);
  const rollDampingNm = prev.rollVelDegS * rollInertia * 0.082;
  const netRollTorqueNm = effectiveHeelingNm - rightingTorqueNm - rollDampingNm;
  const nextRollVelDegS = clamp(
    prev.rollVelDegS + radToDeg(netRollTorqueNm / rollInertia) * dt * 2.2,
    -55,
    55,
  );
  const nextHeelDeg = clamp(
    prev.heelDeg + nextRollVelDegS * dt * 2.2,
    -profile.forgivingHeelCapDeg,
    profile.forgivingHeelCapDeg,
  );

  const boatSpeedKts = Math.max(0, nextSurgeVelMs * MS_TO_KTS);
  const leewayRad = Math.atan2(nextSwayVelMs, Math.max(0.35, Math.abs(nextSurgeVelMs)));
  const leewayDeg =
    Math.abs(awaDeg) < 125 && boatSpeedKts > 0.25
      ? clamp(radToDeg(leewayRad) * profile.leewayScale, -14, 14)
      : 0;

  // Dynamic wave pitch (centralized "guess" swell encounter constants)
  const wavePitchDeg =
    Math.sin(waveCyclePhase * HYDRO_TUNING.wavePitchFreqMult) *
    ((HYDRO_TUNING.wavePitchBaseDeg + weather.waveHeightM * HYDRO_TUNING.wavePitchPerMeterDeg) /
      Math.max(0.5, cfg.pitchDampening));

  // 5. Position Integration in NM: STW + Leeway + Ocean Current + Coastal Tidal Stream
  const trackHeadingRad = degToRad(headingDeg + leewayDeg);
  const coastalTideFactor = depthM < 40 ? 0.35 : 0.05;
  const tideRad = degToRad(prev.anchor.tidalCurrentDeg);
  const currentRad = degToRad(weather.oceanCurrentDirDeg);

  const velX =
    Math.sin(trackHeadingRad) * boatSpeedKts +
    Math.sin(currentRad) * weather.oceanCurrentKts +
    Math.sin(tideRad) * prev.anchor.tidalCurrentKts * coastalTideFactor;
  const velZ =
    -Math.cos(trackHeadingRad) * boatSpeedKts -
    Math.cos(currentRad) * weather.oceanCurrentKts -
    Math.cos(tideRad) * prev.anchor.tidalCurrentKts * coastalTideFactor;

  const sogKts = Math.hypot(velX, velZ);
  const cogDeg = sogKts > 0.15 ? normalizeAngle360(radToDeg(Math.atan2(velX, -velZ))) : headingDeg;

  const distNmStep = boatSpeedKts * simHoursDelta;
  const nextX = prev.passage.xNm + velX * simHoursDelta;
  const nextZ = prev.passage.zNm + velZ * simHoursDelta;
  const nextDepthM = computeDepthAtPassage(nextX, nextZ, prev.passage.totalDistanceNm);

  // 6. Wear & Maintenance Degradation + Equipment Chaining
  const wearScale = profile.wearRateScale;
  const nextWear = { ...prev.wear };
  const overpowerPenalty = forces.isOverpowered ? 3.8 : 0.12;
  const luffingPenalty = forces.isLuffing ? 1.4 : 0;
  const gybeMainShock = forces.accidentalGybeSlam ? 4.5 * wearScale : 0;
  const gybeRigShock = forces.accidentalGybeSlam ? 3.8 * wearScale : 0;

  nextWear.mainsail = Math.max(
    5,
    nextWear.mainsail - (overpowerPenalty + luffingPenalty) * simHoursDelta * wearScale - gybeMainShock,
  );
  const riggingFatigueMult = weather.trueWindSpeedKts > 22 ? wearFactors.riggingFatigueMult : 1.0;
  nextWear.rigging = Math.max(
    5,
    nextWear.rigging -
      (forces.isOverpowered ? 2.4 : 0.08) * simHoursDelta * wearScale * riggingFatigueMult -
      gybeRigShock,
  );
  nextWear.hull = Math.max(5, nextWear.hull - 0.07 * simHoursDelta * wearScale);
  nextWear.rudder = Math.max(
    10,
    nextWear.rudder - (Math.abs(rudderAngleDeg) > 20 ? 0.35 : 0.06) * simHoursDelta * wearScale,
  );

  // Harbor channel shoal & grounding check
  let coins = prev.inventory.coins;
  let totalRunningCostsCr = prev.inventory.totalRunningCostsCr;
  let groundingCount = prev.passage.groundingCount;
  const channelHazardWarning = nextDepthM < 4.5 && !prev.anchor.deployed;
  let groundedThisTick = false;

  if (nextDepthM < 2.2 && !prev.anchor.deployed && boatSpeedKts > 1.2) {
    groundedThisTick = true;
    nextWear.hull = Math.max(5, nextWear.hull - 6.5 * wearScale);
    groundingCount += 1;
  }

  // Daily upkeep deduction
  const nextElapsedHours = prev.passage.elapsedHours + simHoursDelta;
  const totalWholeDays = Math.floor(nextElapsedHours / 24);
  let upkeepChargedDays = prev.passage.upkeepChargedDays;
  if (totalWholeDays > upkeepChargedDays) {
    const newDays = totalWholeDays - upkeepChargedDays;
    const dailyCost = cfg.dailyUpkeepCr ?? spec.defaultCfg.dailyUpkeepCr;
    const charge = newDays * dailyCost;
    coins = Math.max(0, coins - charge);
    totalRunningCostsCr += charge;
    upkeepChargedDays = totalWholeDays;
  }

  const electrical = updateElectricalAndGalley(prev, simHoursDelta);

  // Non-fatal failure recovery check (GDD §4: Coastguard Tow / Jury-Rig Harbor Recovery)
  // Standing rigging failure probability escalates nonlinearly as rigF declines under heavy loads
  const rigFailureHourlyChance = computeRiggingFailureChance(
    nextWear.rigging,
    weather.trueWindSpeedKts,
    forces.isOverpowered,
    forces.accidentalGybeSlam,
  );
  const rigLoadParted =
    nextWear.rigging < 24 &&
    (forces.isOverpowered || forces.accidentalGybeSlam) &&
    rigFailureHourlyChance > 0.35;

  let distress: DistressRecoveryState | null = prev.distress;
  if (!distress && profile.preset !== 'arcade') {
    if (nextWear.rigging <= WEAR_TUNING.rigCriticalPartingPct || rigLoadParted) {
      distress = {
        active: true,
        cause: 'rigging-failure',
        title: 'Dismasting Risk — Standing Rigging Parted',
        description:
          'Extreme rigging fatigue forced an emergency jury-rig under bare poles. Accept a Coastguard tow & emergency splice to recover safely.',
        towCostCr: Math.round(spec.defaultCfg.dailyUpkeepCr * 4.5),
        timePenaltyHours: 14,
      };
    } else if (nextWear.hull <= 12) {
      distress = {
        active: true,
        cause: 'hull-breach',
        title: 'Critical Hull Damage — Bilges Flooding',
        description:
          'Repeated shoal grounding strained hull planking. Coastguard salvage pump & haul-out repair will stabilize the vessel.',
        towCostCr: Math.round(spec.defaultCfg.dailyUpkeepCr * 5.0),
        timePenaltyHours: 18,
      };
    } else if (electrical.provisionsDays <= 0 || electrical.waterLiters <= 0) {
      distress = {
        active: true,
        cause: 'provisions-depleted',
        title: 'Galley & Fresh Water Depleted',
        description:
          'Fresh water tanks or sea stores ran dry offshore. Request an emergency supply drop from a passing freighter or patrol cutter.',
        towCostCr: 95,
        timePenaltyHours: 8,
      };
    }
  }

  const distToDest = Math.hypot(prev.passage.totalDistanceNm - nextX, nextZ);
  const arrivedAtCove = distToDest <= 2.2;

  let alertMessage: string | null = null;
  if (groundedThisTick) {
    alertMessage = `Shoal grounding! Steer back toward channel center (z ≈ 0 NM) — hull damaged (${Math.round(nextWear.hull)}%).`;
  } else if (forces.accidentalGybeSlam) {
    alertMessage = 'ACCIDENTAL GYBE! Boom slammed across cockpit from by-the-lee — ease mainsheet before gybing!';
  } else if (forces.maneuverState === 'by-the-lee') {
    alertMessage = 'Sailing BY THE LEE — wind on leeward side of main; gybe risk high!';
  } else if (channelHazardWarning) {
    alertMessage = `Harbor shoal warning (${nextDepthM.toFixed(1)}m depth) — keep inside marked channel!`;
  } else if (weather.phase === 'squall' && prev.reefLevel === 0 && forces.isOverpowered) {
    alertMessage = 'Squall gust overpowering full mainsail! Reef main (Reef 1 or 2) to reduce heel & sail wear.';
  } else if (weather.phase === 'barometer-falling') {
    alertMessage = 'Barometer falling rapidly — squall front approaching.';
  } else if (electrical.batteryAh / electrical.batteryCapacityAh < 0.2) {
    alertMessage = 'House battery low (<20%) — shed fridge or lights to preserve instruments.';
  } else if (electrical.fridgeTempC > 10 && electrical.provisionsDays > 0) {
    alertMessage = 'Galley fridge warm (>10°C) — sea provisions spoiling 2.1× faster!';
  } else if (nextWear.rigging < 35) {
    alertMessage = `Standing rigging worn (${Math.round(nextWear.rigging)}%) — splice at chandlery to prevent failure.`;
  } else if (arrivedAtCove && !prev.passage.arrivedAtCove) {
    alertMessage = `Landfall! Entered ${prev.passage.toName} sheltered anchorage. Keep clear of shoals & drop anchor.`;
  }

  return {
    ...prev,
    realismPreset: profile.preset,
    headingDeg,
    cogDeg,
    rudderAngleDeg,
    surgeVelMs: nextSurgeVelMs,
    swayVelMs: nextSwayVelMs,
    yawRateDegS: nextYawRateDegS,
    rollVelDegS: nextRollVelDegS,
    wavePitchDeg,
    boatSpeedKts,
    sogKts,
    leewayDeg,
    heelDeg: nextHeelDeg,
    pitchDeg: wavePitchDeg,
    apparentWindAngleDeg: awaDeg,
    apparentWindSpeedKts: awsKts,
    pointOfSail: forces.pointOfSail,
    tackSide: forces.tackSide,
    boomSide: forces.boomSide,
    boomAngleDeg: forces.boomAngleDeg,
    maneuverState: forces.maneuverState,
    angleOfAttackDeg: forces.angleOfAttackDeg,
    sailLiftN: forces.sailLiftN,
    sailDragN: forces.sailDragN,
    sailEfficiency: forces.sailEfficiency,
    isLuffing: forces.isLuffing,
    isOverpowered: forces.isOverpowered,
    electrical,
    wear: nextWear,
    inventory: {
      ...prev.inventory,
      coins,
      totalRunningCostsCr,
    },
    weather,
    passage: {
      ...prev.passage,
      xNm: nextX,
      zNm: nextZ,
      depthM: nextDepthM,
      distanceSailedNm: prev.passage.distanceSailedNm + distNmStep,
      elapsedHours: nextElapsedHours,
      peakSpeedKts: Math.max(prev.passage.peakSpeedKts, boatSpeedKts),
      maxGustKts: Math.max(prev.passage.maxGustKts, weather.gustSpeedKts),
      arrivedAtCove,
      channelHazardWarning,
      groundingCount,
      upkeepChargedDays,
    },
    distress,
    alertMessage,
    lastLogEntry: forces.accidentalGybeSlam
      ? 'Accidental gybe slammed boom across cockpit.'
      : prev.lastLogEntry,
  };
}

/**
 * Advances the simulation using deterministic fixed-timestep (`FIXED_PHYSICS_DT = 1/60s`) substeps.
 */
export function stepSimulation(
  prev: SimulationState,
  dtSeconds: number,
  controls?: { rudderInput?: number; forceSquall?: boolean },
): SimulationState {
  const clampedDt = clamp(dtSeconds, 0, 0.25);
  if (clampedDt <= 0) return prev;

  const substeps = Math.max(1, Math.round(clampedDt / FIXED_PHYSICS_DT));
  const stepDt = clampedDt / substeps;
  let current = prev;
  for (let i = 0; i < substeps; i++) {
    current = stepFixedSubstep(current, stepDt, i === 0 ? controls : { rudderInput: controls?.rudderInput });
  }
  return current;
}

/**
 * Frame-rate independent fixed-timestep accumulator for the live 3D render loop.
 */
export function stepSimulationWithAccumulator(
  prev: SimulationState,
  accumRef: { current: number },
  rawDtSeconds: number,
  controls?: { rudderInput?: number; forceSquall?: boolean },
): SimulationState {
  accumRef.current = Math.min(accumRef.current + clamp(rawDtSeconds, 0, 0.1), FIXED_PHYSICS_DT * 6);
  let current = prev;
  let first = true;
  while (accumRef.current >= FIXED_PHYSICS_DT) {
    current = stepFixedSubstep(
      current,
      FIXED_PHYSICS_DT,
      first ? controls : { rudderInput: controls?.rudderInput },
    );
    accumRef.current -= FIXED_PHYSICS_DT;
    first = false;
  }
  return current;
}

/**
 * Resolves a non-fatal emergency recovery (Coastguard tow / jury-rig / supply drop)
 * without wiping player progress.
 */
export function resolveDistressRecovery(prev: SimulationState): SimulationState {
  if (!prev.distress) return prev;
  const spec = BOAT_SPECS[prev.boatId];
  const d = prev.distress;
  const paid = Math.min(prev.inventory.coins, d.towCostCr);

  return {
    ...prev,
    inventory: {
      ...prev.inventory,
      coins: prev.inventory.coins - paid,
      totalRunningCostsCr: prev.inventory.totalRunningCostsCr + paid,
    },
    wear: {
      ...prev.wear,
      rigging: d.cause === 'rigging-failure' ? Math.max(prev.wear.rigging, 68) : prev.wear.rigging,
      hull: d.cause === 'hull-breach' ? Math.max(prev.wear.hull, 68) : prev.wear.hull,
    },
    electrical: {
      ...prev.electrical,
      provisionsDays:
        d.cause === 'provisions-depleted'
          ? Math.max(prev.electrical.provisionsDays, 4)
          : prev.electrical.provisionsDays,
      waterLiters:
        d.cause === 'provisions-depleted'
          ? Math.max(prev.electrical.waterLiters, Math.round(spec.waterTankLiters * 0.5))
          : prev.electrical.waterLiters,
    },
    passage: {
      ...prev.passage,
      zNm: d.cause === 'hull-breach' ? 0 : prev.passage.zNm, // Towed back into safe deep channel
      elapsedHours: prev.passage.elapsedHours + d.timePenaltyHours,
    },
    reefLevel: 1,
    surgeVelMs: 1.5,
    boatSpeedKts: 1.5 * MS_TO_KTS,
    distress: null,
    alertMessage: `Recovered: ${d.title} resolved (+${d.timePenaltyHours}h elapsed, -${paid} Cr).`,
    lastLogEntry: `Emergency assistance logged (-${paid} Cr, +${d.timePenaltyHours}h).`,
  };
}

/**
 * Simulates sleeping / standing off-watch for up to `hours` while Windvane or Compass
 * autopilot sails the boat (or while anchored). Wakes early if squall hits, battery runs low,
 * anchor drags, distress occurs, or destination cove is reached.
 */
export function simulateWatchSleep(
  prev: SimulationState,
  hours: number,
): { state: SimulationState; wokeReason: string } {
  let current = { ...prev };
  const steps = Math.max(1, Math.round(hours * 10));
  const stepSimHours = hours / steps;
  const savedCompression = current.timeCompression;

  let wokeReason = `Completed ${hours.toFixed(1)}h watch smoothly.`;
  const dtPerStep = stepSimHours / 0.008;

  for (let i = 0; i < steps; i++) {
    current.timeCompression = 60;
    const microDt = clamp(dtPerStep / 60, 0.01, 0.05);
    const reps = Math.max(1, Math.round(dtPerStep / (60 * microDt)));
    for (let r = 0; r < reps; r++) {
      current = stepSimulation(current, microDt);
    }

    if (current.distress?.active) {
      wokeReason = `Woken by emergency alarm: ${current.distress.title}`;
      break;
    }
    if (current.weather.phase === 'squall' && current.reefLevel === 0 && !current.anchor.deployed) {
      wokeReason = 'Woken by squall alarm! Wind > 28 kts — reef mainsail immediately.';
      break;
    }
    if (current.anchor.deployed && current.anchor.dragging) {
      wokeReason = 'Woken by anchor drag alarm!';
      break;
    }
    if (current.passage.arrivedAtCove && !prev.passage.arrivedAtCove) {
      wokeReason = `Woken by landfall alarm off ${current.passage.toName}!`;
      break;
    }
    if (current.electrical.batteryAh <= current.electrical.batteryCapacityAh * 0.15) {
      wokeReason = 'Woken by low-voltage battery alarm (<15%).';
      break;
    }
  }

  current.timeCompression = savedCompression;
  current.lastLogEntry = wokeReason;
  return { state: current, wokeReason };
}

export function deployOrRaiseAnchor(prev: SimulationState): SimulationState {
  if (prev.anchor.deployed) {
    return {
      ...prev,
      anchor: {
        ...prev.anchor,
        deployed: false,
        dragging: false,
      },
      lastLogEntry: 'Anchor weighed and secured on bow roller.',
      alertMessage: null,
    };
  }

  const depth = prev.passage.depthM;
  if (depth > 45) {
    return {
      ...prev,
      alertMessage: `Too deep to anchor here (${Math.round(depth)}m). Sail closer to cove (< 40m depth).`,
    };
  }

  const recommendedRode = Math.round((depth + 2) * 5);
  return {
    ...prev,
    surgeVelMs: 0,
    swayVelMs: 0,
    yawRateDegS: 0,
    rollVelDegS: 0,
    boatSpeedKts: 0,
    autopilotMode: 'manual',
    anchor: {
      ...prev.anchor,
      deployed: true,
      anchorLatNm: prev.passage.zNm,
      anchorLonNm: prev.passage.xNm,
      depthAtAnchorM: Math.round(depth),
      rodeLengthM: clamp(recommendedRode, 25, 85),
      holdingQuality: depth < 14 ? 'Sand' : 'Mud',
      holdingFactor: 0.92,
      dragging: false,
      swingAngleDeg: normalizeAngle360(prev.weather.trueWindDirDeg + 180),
    },
    lastLogEntry: `Anchor set in ${Math.round(depth)}m sand with ${clamp(recommendedRode, 25, 85)}m chain.`,
    alertMessage: null,
  };
}

export function buyChandleryItem(prev: SimulationState, itemId: string): SimulationState {
  const item = CHANDLERY_ITEMS.find((c) => c.id === itemId);
  if (!item || prev.inventory.coins < item.price) return prev;

  const spec = BOAT_SPECS[prev.boatId];

  // Consumables (provisions & water) apply immediately
  if (item.provisionsDaysAdd || item.waterLitersAdd) {
    const coins = prev.inventory.coins - item.price;
    return {
      ...prev,
      inventory: { ...prev.inventory, coins },
      electrical: {
        ...prev.electrical,
        provisionsDays: Math.min(
          spec.fridgeCapacityDays + 4,
          prev.electrical.provisionsDays + (item.provisionsDaysAdd ?? 0),
        ),
        waterLiters: Math.min(
          spec.waterTankLiters,
          prev.electrical.waterLiters + (item.waterLitersAdd ?? 0),
        ),
      },
      lastLogEntry: `Loaded ${item.name} aboard.`,
    };
  }

  // Enforce spare locker slot capacity
  const usedSlots = countLockerSlotsUsed(prev.inventory.parts);
  const itemSlots = item.lockerSlots ?? 1;
  if (usedSlots + itemSlots > spec.spareLockerCapacity) {
    return {
      ...prev,
      alertMessage: `Spare locker full (${usedSlots}/${spec.spareLockerCapacity} slots on ${spec.name}). Use parts or upgrade vessel.`,
    };
  }

  const coins = prev.inventory.coins - item.price;
  return {
    ...prev,
    inventory: {
      ...prev.inventory,
      coins,
      parts: {
        ...prev.inventory.parts,
        [item.id]: (prev.inventory.parts[item.id] ?? 0) + 1,
      },
    },
    alertMessage: null,
    lastLogEntry: `Purchased ${item.name} for spare locker (${usedSlots + itemSlots}/${spec.spareLockerCapacity} slots).`,
  };
}

export function applySparePartRepair(
  prev: SimulationState,
  itemId: string,
): SimulationState {
  const item = CHANDLERY_ITEMS.find((c) => c.id === itemId);
  const qty = prev.inventory.parts[itemId] ?? 0;
  if (!item || !item.targetSystem || !item.repairAmount || qty <= 0) return prev;

  const sys: SystemKey = item.targetSystem;
  const currentCond = prev.wear[sys];
  if (currentCond >= 100) return prev;

  return {
    ...prev,
    wear: {
      ...prev.wear,
      [sys]: Math.min(100, currentCond + item.repairAmount),
    },
    inventory: {
      ...prev.inventory,
      parts: {
        ...prev.inventory.parts,
        [itemId]: qty - 1,
      },
    },
    lastLogEntry: `Used ${item.name}: ${sys} restored to ${Math.min(100, Math.round(currentCond + item.repairAmount))}%.`,
  };
}

export function acceptCharterContract(
  prev: SimulationState,
  contract: CharterContract,
): SimulationState {
  return {
    ...prev,
    inventory: {
      ...prev.inventory,
      activeContract: contract,
    },
    lastLogEntry: `Signed charter: ${contract.title} (+${contract.rewardCr} Cr on arrival at ${contract.toName}).`,
  };
}

export function settlePassageCompletion(prev: SimulationState): {
  state: SimulationState;
  harborBountyCr: number;
  contractBonusCr: number;
  portFeeCr: number;
  netEarnedCr: number;
} {
  const spec = BOAT_SPECS[prev.boatId];
  const harborBountyCr = Math.round(450 + prev.passage.totalDistanceNm * 4);
  const portFeeCr = Math.round((prev.vesselCfg?.dailyUpkeepCr ?? spec.defaultCfg.dailyUpkeepCr) * 1.5);

  let contractBonusCr = 0;
  let totalChartersCompleted = prev.inventory.totalChartersCompleted;
  const contract = prev.inventory.activeContract;
  if (contract && contract.toHubId === prev.passage.toHubId) {
    const onTime = prev.passage.elapsedHours <= contract.deadlineHours;
    const intact = !contract.fragile || prev.passage.groundingCount === 0;
    contractBonusCr = Math.round(contract.rewardCr * (onTime ? 1.0 : 0.65) * (intact ? 1.0 : 0.7));
    totalChartersCompleted += 1;
  }

  const netEarnedCr = harborBountyCr + contractBonusCr - portFeeCr;
  const nextCoins = Math.max(0, prev.inventory.coins + netEarnedCr);

  const updated: SimulationState = {
    ...prev,
    inventory: {
      ...prev.inventory,
      coins: nextCoins,
      activeContract: contract && contract.toHubId === prev.passage.toHubId ? null : contract,
      totalRunningCostsCr: prev.inventory.totalRunningCostsCr + portFeeCr,
      totalChartersCompleted,
    },
    passage: {
      ...prev.passage,
      voyageComplete: true,
      visitedHubIds: Array.from(new Set([...prev.passage.visitedHubIds, prev.passage.toHubId])),
    },
    lastLogEntry: `Logged landfall at ${prev.passage.toName}. Harbor +${harborBountyCr} Cr, Charter +${contractBonusCr} Cr, Port dues -${portFeeCr} Cr.`,
  };

  return { state: updated, harborBountyCr, contractBonusCr, portFeeCr, netEarnedCr };
}

export function updateVesselCfg(
  prev: SimulationState,
  patch: Partial<VesselCfgParams>,
): SimulationState {
  return {
    ...prev,
    vesselCfg: {
      ...prev.vesselCfg,
      ...patch,
    },
    lastLogEntry: 'Updated boat.cfg / hydrodynamic surface parameters.',
  };
}

export function resetVesselCfg(prev: SimulationState): SimulationState {
  return {
    ...prev,
    vesselCfg: { ...BOAT_SPECS[prev.boatId].defaultCfg },
    lastLogEntry: `Reset ${BOAT_SPECS[prev.boatId].name} boat.cfg to factory spec.`,
  };
}

export function switchOrPurchaseBoat(prev: SimulationState, targetBoat: BoatId): SimulationState {
  if (prev.boatId === targetBoat) return prev;
  const spec = BOAT_SPECS[targetBoat];
  if (!spec) return prev;

  const cost = spec.priceCoins > 0 ? spec.priceCoins : 0;
  if (prev.inventory.coins < cost) {
    return {
      ...prev,
      alertMessage: `Need ${cost} Cr to commission the ${spec.name} (complete passages & charters to earn credits).`,
    };
  }

  return {
    ...prev,
    boatId: targetBoat,
    exteriorModelId: spec.exteriorModelId,
    vesselCfg: { ...spec.defaultCfg },
    staysailDeployed: spec.hasStaysail,
    inventory: {
      ...prev.inventory,
      coins: prev.inventory.coins - cost,
    },
    electrical: {
      ...prev.electrical,
      batteryCapacityAh: spec.batteryCapacityAh,
      batteryAh: spec.batteryCapacityAh * 0.9,
      provisionsDays: spec.fridgeCapacityDays,
      waterLiters: spec.waterTankLiters * 0.9,
    },
    wear: {
      mainsail: 100,
      rigging: 100,
      hull: 100,
      rudder: 100,
      battery: 100,
      fridge: 100,
    },
    lastLogEntry: `Commissioned ${spec.name} (${spec.subtitle}).`,
    alertMessage: null,
  };
}

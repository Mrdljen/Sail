import { BOAT_SPECS, CHANDLERY_ITEMS } from './boats';
import {
  classifyPointOfSail,
  getOptimalSheetPct,
  getReefAreaFactor,
  solveFoilAndManeuver,
  type FoilForceOutput,
} from './foilPhysics';
import { computeGreatCircleNm, HANDCRAFTED_HUBS } from './worldHubs';
import type {
  BoatId,
  CharterContract,
  PointOfSail,
  ReefLevel,
  SimulationState,
  SystemKey,
  VesselCfgParams,
  WorldHub,
} from '../types/sailing';

export { classifyPointOfSail, getOptimalSheetPct, getReefAreaFactor };

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
 * trueWindDirDeg is the compass direction the wind is blowing FROM (0=N, 90=E).
 */
export function computeApparentWind(
  headingDeg: number,
  boatSpeedKts: number,
  trueWindDirDeg: number,
  trueWindSpeedKts: number,
): { awaDeg: number; awsKts: number } {
  const hRad = degToRad(headingDeg);
  const wFromRad = degToRad(trueWindDirDeg);

  // Wind velocity vector (blowing TOWARD wFrom + 180)
  const wToRad = wFromRad + Math.PI;
  const windVx = Math.sin(wToRad) * trueWindSpeedKts;
  const windVz = -Math.cos(wToRad) * trueWindSpeedKts;

  // Boat velocity vector
  const boatVx = Math.sin(hRad) * boatSpeedKts;
  const boatVz = -Math.cos(hRad) * boatSpeedKts;

  // Apparent wind vector = True Wind - Boat Velocity (blowing toward)
  const appToVx = windVx - boatVx;
  const appToVz = windVz - boatVz;
  const awsKts = Math.hypot(appToVx, appToVz);

  // Apparent wind coming FROM vector = -appToV
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

  // Harbor approach channel shoaling hazard outside marked buoyed channel
  if (nearestCoastNm < 3.2 && Math.abs(zNm) > 0.72) {
    const shoalFactor = clamp((Math.abs(zNm) - 0.72) / 1.1, 0, 1);
    return Number(lerp(4.4, 1.5, shoalFactor).toFixed(1));
  }

  if (nearestCoastNm < 0.35) return 5.8;
  if (nearestCoastNm < 1.2) return lerp(6.0, 14.0, (nearestCoastNm - 0.35) / 0.85);
  if (nearestCoastNm < 4.0) return lerp(14.0, 85.0, (nearestCoastNm - 1.2) / 2.8);
  return Math.round(lerp(85, 2400, clamp((nearestCoastNm - 4.0) / 18.0, 0, 1)));
}

export function createInitialSimulationState(
  boatId: BoatId = 'elan-19',
  fromHub?: WorldHub,
  toHub?: WorldHub,
): SimulationState {
  const spec = BOAT_SPECS[boatId];
  const origin = fromHub ?? HANDCRAFTED_HUBS[0]; // Lanzarote
  const dest = toHub ?? HANDCRAFTED_HUBS[1]; // La Gomera

  // Vertical slice is calibrated as a crisp 100 NM passage when using default Canary run
  const isDefaultVerticalSlice = origin.id === 'lanzarote' && dest.id === 'la-gomera';
  const totalDistanceNm = isDefaultVerticalSlice
    ? 100
    : Math.max(45, computeGreatCircleNm(origin.lat, origin.lon, dest.lat, dest.lon));

  return {
    boatId,
    vesselCfg: { ...spec.defaultCfg },
    simRealism: 0.65, // 65% Simulation by default, user can slide 0 (Arcade) -> 1 (Sim)
    headingDeg: 90, // Heading due East toward destination along local +X axis
    cogDeg: 90,
    rudderAngleDeg: 0,
    boatSpeedKts: 4.8,
    sogKts: 5.2,
    leewayDeg: 1.5,
    heelDeg: 8,
    pitchDeg: 0,
    apparentWindAngleDeg: -65, // Port beam/close reach in trade winds
    apparentWindSpeedKts: 15.2,
    pointOfSail: 'Close Reach',
    tackSide: 'port',
    boomSide: 1, // port wind pushes boom to starboard
    boomAngleDeg: 24,
    maneuverState: 'sailing',
    angleOfAttackDeg: 22,
    sailLiftN: 680,
    sailDragN: 190,
    mainsheetPct: 76,
    jibsheetPct: 74,
    jibDeployed: true,
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
      waterLiters: boatId === 'elan-19' ? 48 : 180,
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
      trueWindDirDeg: 25, // NE Trade Wind relative to our 090° East course -> crisp port reach!
      trueWindSpeedKts: 15,
      gustSpeedKts: 17,
      barometerHpa: 1018,
      barometerTrend: 'Steady',
      waveHeightM: 1.1,
      oceanCurrentDirDeg: 110, // Canary Current setting ESE ~0.7 kts
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
      xNm: 2.2, // Clear of departure breakwater, open sea ahead
      zNm: 0,
      depthM: 28,
      elapsedHours: 0,
      peakSpeedKts: 4.8,
      maxGustKts: 17,
      arrivedAtCove: false,
      voyageComplete: false,
      visitedHubIds: [origin.id],
      monthOfYear: 11, // November trade-wind window
      channelHazardWarning: false,
      groundingCount: 0,
      upkeepChargedDays: 0,
    },
    alertMessage: null,
    lastLogEntry: `Cleared ${origin.name} harbor mouth bound for ${dest.name} (${totalDistanceNm} NM).`,
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

  // Trigger squall trough near ~32%–68% of passage (or forced by user/test)
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
      w.trueWindSpeedKts = Math.round(lerp(24, 34, squallMultiplier));
      w.gustSpeedKts = Math.round(lerp(28, 39, squallMultiplier));
      w.waveHeightM = Number(lerp(2.1, 3.3, squallMultiplier).toFixed(1));
      w.forecastText =
        'ACTIVE SQUALL: 30+ kt gusts and steep beam chop! Drop to Reef 1 or Reef 2 to protect sails and rigging.';
    }
  } else if (w.phase === 'squall') {
    // Squall lasts ~18 NM or ~2.2 hours, then clears into brisk trades
    const gustPulse = Math.sin(state.passage.elapsedHours * 9.0) * 4.5;
    const baseSquall = lerp(24, 33, squallMultiplier);
    w.trueWindSpeedKts = Number((baseSquall + gustPulse * 0.5).toFixed(1));
    w.gustSpeedKts = Number((baseSquall + 5.5 + Math.abs(gustPulse)).toFixed(1));
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
    // Trade winds subtle oscillation
    const breezeCycle = Math.sin(w.timeOfDayHours * 0.5) * 2.0;
    w.trueWindSpeedKts = Number(clamp(15 + breezeCycle, 11, 21).toFixed(1));
    w.gustSpeedKts = Number((w.trueWindSpeedKts + 2.5).toFixed(1));
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

  // Solar output peaks around solar noon (12:30) and drops with cloud cover & night
  const tod = state.weather.timeOfDayHours;
  const sunElevation = Math.max(0, Math.sin(((tod - 6) / 12) * Math.PI));
  const cloudFactor = 1 - state.weather.cloudCover * 0.75;
  e.solarWatts = Math.round(spec.solarPeakWatts * sunElevation * cloudFactor);

  // Electrical draws (Watts)
  let draw = 4; // parasitic / regulator
  if (e.instruments) draw += 12;
  if (e.vhfRadio) draw += 8;
  if (e.navLights) draw += 18;
  if (e.cabinLights) draw += 10;
  if (e.fridgeOn) draw += e.fridgeTempC > 5 ? 36 : 16; // compressor duty cycle
  if (e.bilgePump) draw += 28;
  if (state.autopilotMode === 'compass') draw += 26; // electric tillerpilot draws power; windvane draws 0!
  e.drawWatts = draw;

  const netWatts = e.solarWatts - e.drawWatts;
  const effectiveCap = e.batteryCapacityAh * clamp(state.wear.battery / 100, 0.45, 1.0);
  const deltaAh = (netWatts / 12.5) * simHoursDelta;
  e.batteryAh = clamp(e.batteryAh + deltaAh, 0, effectiveCap);

  const soc = e.batteryAh / Math.max(1, effectiveCap);
  e.voltage = Number((11.1 + soc * 2.1 + (e.solarWatts > e.drawWatts ? 0.6 : 0)).toFixed(2));

  // Auto-shed non-essential loads if battery critically empty
  if (e.batteryAh <= 0.5) {
    e.fridgeOn = false;
    e.cabinLights = false;
    e.instruments = false;
  }

  // Fridge temperature & provisions preservation
  const fridgeHealth = clamp(state.wear.fridge / 100, 0.3, 1.0);
  if (e.fridgeOn && e.batteryAh > 0.5) {
    const targetTemp = lerp(7.0, 3.2, fridgeHealth);
    e.fridgeTempC = Number(lerp(e.fridgeTempC, targetTemp, clamp(simHoursDelta * 1.4, 0, 1)).toFixed(1));
  } else {
    // Warms up toward ambient 24°C
    e.fridgeTempC = Number(lerp(e.fridgeTempC, 24.0, clamp(simHoursDelta * 0.35, 0, 1)).toFixed(1));
  }

  // Daily consumption + spoilage if fridge gets warm (> 10°C)
  const spoilageMultiplier = e.fridgeTempC > 10 ? 2.1 : 1.0;
  e.provisionsDays = Math.max(0, Number((e.provisionsDays - (simHoursDelta / 24) * spoilageMultiplier).toFixed(2)));
  e.waterLiters = Math.max(0, Number((e.waterLiters - (simHoursDelta / 24) * 3.5).toFixed(1)));

  return e;
}

export function updateAnchorAndTide(
  state: SimulationState,
  simHoursDelta: number,
  xNm: number,
  zNm: number,
  depthM: number,
): { anchor: SimulationState['anchor']; xNm: number; zNm: number; headingDeg: number } {
  const a = { ...state.anchor };

  // 12.42-hour semidiurnal tidal cycle
  const tideCycleRad = (state.passage.elapsedHours / 12.42) * Math.PI * 2;
  a.tideHeightM = Number((Math.sin(tideCycleRad) * 1.15).toFixed(2));
  const tideSlope = Math.cos(tideCycleRad);

  if (Math.abs(tideSlope) < 0.18) {
    a.tidePhaseLabel = a.tideHeightM >= 0 ? 'High Slack' : 'Low Slack';
  } else {
    a.tidePhaseLabel = tideSlope > 0 ? 'Flooding' : 'Ebbing';
  }

  // Tidal stream reverses 180° between flood (075°) and ebb (255°)
  a.tidalCurrentDeg = tideSlope >= 0 ? 75 : 255;
  a.tidalCurrentKts = Number((Math.abs(tideSlope) * 1.4).toFixed(2));

  if (!a.deployed) {
    return { anchor: a, xNm, zNm, headingDeg: state.headingDeg };
  }

  // Scope ratio = rode / (depth + tideHeight + bowHeight(1.2m))
  const totalVerticalM = Math.max(2, a.depthAtAnchorM + a.tideHeightM + 1.2);
  const scopeRatio = a.rodeLengthM / totalVerticalM;
  const windLoad = state.weather.trueWindSpeedKts / 25;
  const requiredScope = 3.2 + windLoad * 2.2;
  a.holdingFactor = clamp(scopeRatio / requiredScope, 0.25, 1.0);
  a.dragging = a.holdingFactor < 0.68 && state.weather.trueWindSpeedKts > 20;

  // Compute combined wind + tidal current vector to determine boat's swing heading & arc
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

  // Smoothly swing boat around anchor on rode arc
  const diff = normalizeAngle180(targetSwingDeg - a.swingAngleDeg);
  a.swingAngleDeg = normalizeAngle360(a.swingAngleDeg + diff * clamp(simHoursDelta * 1.8, 0, 1));

  // Position boat at rode radius (in NM, 1 NM = 1852m) along swing vector
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

  // Bow faces INTO the anchor rode (180° opposite swing angle)
  const bowToAnchorDeg = normalizeAngle360(a.swingAngleDeg + 180);

  return {
    anchor: a,
    xNm: nextX,
    zNm: nextZ,
    headingDeg: bowToAnchorDeg,
  };
}

/**
 * Advances the entire sailing simulation by `dtSeconds` (real frame seconds).
 * Note: At 1x timeCompression, 1 real second advances ~36 sim seconds (0.01 sim hours)
 * so a 100 NM passage flows meditatively yet reaches squalls and landfall within minutes,
 * and 10x / 60x or Sleep/Watch lets the player cross ocean legs smoothly.
 */
export function stepSimulation(
  prev: SimulationState,
  dtSeconds: number,
  controls?: { rudderInput?: number; forceSquall?: boolean },
): SimulationState {
  const dt = clamp(dtSeconds, 0, 0.05);
  // Base rate: 1x = 0.008 sim hours/sec (~29s per 0.23h), 10x = 0.08, 60x = 0.48
  const simHoursDelta = dt * 0.008 * prev.timeCompression;
  const spec = BOAT_SPECS[prev.boatId];

  const weather = updateWeather(prev, simHoursDelta, controls?.forceSquall);
  const depthM = computeDepthAtPassage(prev.passage.xNm, prev.passage.zNm, prev.passage.totalDistanceNm);

  // Rudder & Autopilot handling
  let rudderAngleDeg = prev.rudderAngleDeg;
  let headingDeg = prev.headingDeg;

  if (prev.anchor.deployed) {
    const anchored = updateAnchorAndTide(prev, simHoursDelta, prev.passage.xNm, prev.passage.zNm, depthM);
    const { awaDeg, awsKts } = computeApparentWind(
      anchored.headingDeg,
      0,
      weather.trueWindDirDeg,
      weather.trueWindSpeedKts,
    );
    const electrical = updateElectricalAndGalley(prev, simHoursDelta);

    return {
      ...prev,
      headingDeg: anchored.headingDeg,
      cogDeg: anchored.headingDeg,
      boatSpeedKts: 0,
      sogKts: 0,
      sailLiftN: 0,
      sailDragN: 0,
      maneuverState: 'sailing',
      heelDeg: Number((Math.sin(degToRad(awaDeg)) * (awsKts / 25) * 4).toFixed(1)),
      apparentWindAngleDeg: Number(awaDeg.toFixed(1)),
      apparentWindSpeedKts: Number(awsKts.toFixed(1)),
      pointOfSail: classifyPointOfSail(Math.abs(awaDeg), spec.noGoAngleDeg),
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

  // Active sailing steering
  const rudderInput = controls?.rudderInput ?? 0;
  if (Math.abs(rudderInput) > 0.01) {
    rudderAngleDeg = clamp(rudderAngleDeg + rudderInput * 55 * dt, -35, 35);
  } else if (prev.autopilotMode === 'windvane') {
    // Windvane holds Apparent Wind Angle constant!
    const awaError = normalizeAngle180(prev.apparentWindAngleDeg - prev.autopilotTargetDeg);
    rudderAngleDeg = clamp(awaError * 0.55, -22, 22);
  } else if (prev.autopilotMode === 'compass') {
    const hdgError = normalizeAngle180(prev.autopilotTargetDeg - headingDeg);
    rudderAngleDeg = clamp(hdgError * 0.6, -24, 24);
  } else {
    // Natural self-centering rudder return
    rudderAngleDeg = lerp(rudderAngleDeg, 0, clamp(dt * 2.2, 0, 1));
  }

  // Rudder turn rate depends on boat speed, rudder area (boat.cfg), & rudder health
  const rudderAreaRatio = clamp((prev.vesselCfg?.rudderAreaM2 ?? spec.defaultCfg.rudderAreaM2) / spec.defaultCfg.rudderAreaM2, 0.6, 1.6);
  const rudderAuthority =
    clamp(prev.boatSpeedKts / 2.2, 0.25, 1.2) *
    rudderAreaRatio *
    lerp(0.5, 1.0, prev.wear.rudder / 100);
  headingDeg = normalizeAngle360(headingDeg + rudderAngleDeg * rudderAuthority * dt * 0.85);

  const { awaDeg, awsKts } = computeApparentWind(
    headingDeg,
    prev.boatSpeedKts,
    weather.trueWindDirDeg,
    weather.trueWindSpeedKts,
  );

  const forces = solveFoilAndManeuver(prev, awaDeg, awsKts);
  const speedDamp = clamp(dt * 1.4, 0, 1);
  const boatSpeedKts = Number(lerp(prev.boatSpeedKts, forces.targetSpeedKts, speedDamp).toFixed(2));
  const heelDeg = Number(lerp(prev.heelDeg, forces.targetHeelDeg, clamp(dt * 2.4, 0, 1)).toFixed(1));

  // Position integration in NM: STW + Leeway + Ocean Current + Coastal Tidal Stream -> SOG & COG (Virtual Sailor NG)
  const trackHeadingRad = degToRad(headingDeg + forces.leewayDeg);
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

  const sogKts = Number(Math.hypot(velX, velZ).toFixed(2));
  const cogDeg = sogKts > 0.15 ? Number(normalizeAngle360(radToDeg(Math.atan2(velX, -velZ))).toFixed(1)) : headingDeg;

  const distNmStep = boatSpeedKts * simHoursDelta;
  const nextX = prev.passage.xNm + velX * simHoursDelta;
  const nextZ = prev.passage.zNm + velZ * simHoursDelta;
  const nextDepthM = computeDepthAtPassage(nextX, nextZ, prev.passage.totalDistanceNm);

  // Wear & maintenance degradation scaled by realism slider + Tiller accidental gybe shock
  const wearScale = lerp(0.2, 1.0, prev.simRealism);
  const nextWear = { ...prev.wear };
  const overpowerPenalty = forces.isOverpowered ? 3.8 : 0.12;
  const luffingPenalty = forces.isLuffing ? 1.4 : 0;
  const gybeMainShock = forces.accidentalGybeSlam ? 4.5 * wearScale : 0;
  const gybeRigShock = forces.accidentalGybeSlam ? 3.8 * wearScale : 0;

  nextWear.mainsail = Math.max(10, nextWear.mainsail - (overpowerPenalty + luffingPenalty) * simHoursDelta * wearScale - gybeMainShock);
  nextWear.rigging = Math.max(15, nextWear.rigging - (forces.isOverpowered ? 2.4 : 0.08) * simHoursDelta * wearScale - gybeRigShock);
  nextWear.hull = Math.max(20, nextWear.hull - 0.07 * simHoursDelta * wearScale);
  nextWear.rudder = Math.max(20, nextWear.rudder - (Math.abs(rudderAngleDeg) > 20 ? 0.35 : 0.06) * simHoursDelta * wearScale);

  // Ship Happens harbor channel shoal & grounding check
  let coins = prev.inventory.coins;
  let totalRunningCostsCr = prev.inventory.totalRunningCostsCr;
  let groundingCount = prev.passage.groundingCount;
  const channelHazardWarning = nextDepthM < 4.5 && !prev.anchor.deployed;
  let groundedThisTick = false;

  if (nextDepthM < 2.2 && !prev.anchor.deployed && boatSpeedKts > 1.2) {
    groundedThisTick = true;
    nextWear.hull = Math.max(15, nextWear.hull - 6.5 * wearScale);
    groundingCount += 1;
  }

  // Ship Happens daily upkeep & insurance deduction on elapsed voyage days
  const nextElapsedHours = Number((prev.passage.elapsedHours + simHoursDelta).toFixed(2));
  const totalWholeDays = Math.floor(nextElapsedHours / 24);
  let upkeepChargedDays = prev.passage.upkeepChargedDays;
  if (totalWholeDays > upkeepChargedDays) {
    const newDays = totalWholeDays - upkeepChargedDays;
    const dailyCost = prev.vesselCfg?.dailyUpkeepCr ?? spec.defaultCfg.dailyUpkeepCr;
    const charge = newDays * dailyCost;
    coins = Math.max(0, coins - charge);
    totalRunningCostsCr += charge;
    upkeepChargedDays = totalWholeDays;
  }

  const electrical = updateElectricalAndGalley(prev, simHoursDelta);

  const distToDest = Math.hypot(prev.passage.totalDistanceNm - nextX, nextZ);
  const arrivedAtCove = distToDest <= 2.5 || nextX >= prev.passage.totalDistanceNm - 1.5;

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
  } else if (arrivedAtCove && !prev.passage.arrivedAtCove) {
    alertMessage = `Landfall! Entered ${prev.passage.toName} sheltered anchorage. Keep clear of shoals & drop anchor.`;
  }

  return {
    ...prev,
    headingDeg: Number(headingDeg.toFixed(1)),
    cogDeg,
    rudderAngleDeg: Number(rudderAngleDeg.toFixed(1)),
    boatSpeedKts,
    sogKts,
    leewayDeg: forces.leewayDeg,
    heelDeg,
    apparentWindAngleDeg: Number(awaDeg.toFixed(1)),
    apparentWindSpeedKts: Number(awsKts.toFixed(1)),
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
      distanceSailedNm: Number((prev.passage.distanceSailedNm + distNmStep).toFixed(2)),
      elapsedHours: nextElapsedHours,
      peakSpeedKts: Math.max(prev.passage.peakSpeedKts, boatSpeedKts),
      maxGustKts: Math.max(prev.passage.maxGustKts, weather.gustSpeedKts),
      arrivedAtCove,
      channelHazardWarning,
      groundingCount,
      upkeepChargedDays,
    },
    alertMessage,
    lastLogEntry: forces.accidentalGybeSlam
      ? 'Accidental gybe slammed boom across cockpit.'
      : prev.lastLogEntry,
  };
}

/**
 * Simulates sleeping / standing off-watch for up to `hours` while Windvane or Compass
 * autopilot sails the boat (or while anchored). Wakes early if squall hits, battery runs low,
 * anchor drags, or destination cove is reached.
 */
export function simulateWatchSleep(
  prev: SimulationState,
  hours: number,
): { state: SimulationState; wokeReason: string } {
  let current = { ...prev };
  const steps = Math.max(1, Math.round(hours * 10));
  const stepSimHours = hours / steps;
  // Convert stepSimHours back into equivalent dt at 1x compression (simHours = dt * 0.008)
  const savedCompression = current.timeCompression;
  current.timeCompression = 1;

  let wokeReason = `Completed ${hours.toFixed(1)}h watch smoothly.`;
  const dtPerStep = stepSimHours / 0.008;

  // Break into substeps of 0.05s or directly apply physics chunks safely
  for (let i = 0; i < steps; i++) {
    // Run 4 micro-steps per 0.1h chunk with 60x compression equivalent
    current.timeCompression = 60;
    const microDt = clamp(dtPerStep / 60, 0.01, 0.05);
    const reps = Math.max(1, Math.round(dtPerStep / (60 * microDt)));
    for (let r = 0; r < reps; r++) {
      current = stepSimulation(current, microDt);
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

  const coins = prev.inventory.coins - item.price;

  // Consumables (provisions & water) apply immediately
  if (item.provisionsDaysAdd || item.waterLitersAdd) {
    const spec = BOAT_SPECS[prev.boatId];
    return {
      ...prev,
      inventory: { ...prev.inventory, coins },
      electrical: {
        ...prev.electrical,
        provisionsDays: Math.min(
          spec.fridgeCapacityDays + 4,
          Number((prev.electrical.provisionsDays + (item.provisionsDaysAdd ?? 0)).toFixed(1)),
        ),
        waterLiters: Math.min(
          prev.boatId === 'elan-19' ? 75 : 260,
          prev.electrical.waterLiters + (item.waterLitersAdd ?? 0),
        ),
      },
      lastLogEntry: `Loaded ${item.name} aboard.`,
    };
  }

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
    lastLogEntry: `Purchased ${item.name} for spare locker.`,
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
      [sys]: Math.min(100, Number((currentCond + item.repairAmount).toFixed(1))),
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
  // Allow free preview/upgrade if player has enough coins or switch back to Elan 19
  const cost = targetBoat === 'rustler-36' && prev.inventory.coins >= spec.priceCoins ? spec.priceCoins : 0;
  if (targetBoat === 'rustler-36' && prev.inventory.coins < spec.priceCoins) {
    return {
      ...prev,
      alertMessage: `Need ${spec.priceCoins} Cr to commission the Rustler 36 (complete passages to earn credits).`,
    };
  }

  return {
    ...prev,
    boatId: targetBoat,
    vesselCfg: { ...spec.defaultCfg },
    inventory: {
      ...prev.inventory,
      coins: prev.inventory.coins - cost,
    },
    electrical: {
      ...prev.electrical,
      batteryCapacityAh: spec.batteryCapacityAh,
      batteryAh: spec.batteryCapacityAh * 0.9,
      provisionsDays: spec.fridgeCapacityDays,
      waterLiters: targetBoat === 'elan-19' ? 48 : 180,
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

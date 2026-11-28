import type { SimulationState } from '../types/sailing';

export interface SignalKValue {
  value: number;
  units: 'rad' | 'm' | 'kn' | 'Pa' | 'V' | 'W' | 'ratio';
}

/** Live vessel readings in Signal K style paths, with UI control context. */
export interface MarineInstrumentData {
  navigation: {
    speedThroughWater: SignalKValue;
    speedOverGround: SignalKValue;
    headingTrue: SignalKValue;
    courseOverGroundTrue: SignalKValue;
    velocityMadeGoodToWaypoint: SignalKValue;
    attitude: { roll: number; pitch: number };
  };
  environment: {
    depth: { belowTransducer: SignalKValue };
    wind: {
      angleApparent: SignalKValue;
      speedApparent: SignalKValue;
      angleTrueWater: SignalKValue;
      speedTrue: SignalKValue;
    };
    outside: { pressure: SignalKValue };
    water: { waveHeight: SignalKValue };
  };
  electrical: {
    batteries: { house: { capacity: { stateOfCharge: SignalKValue }; voltage: SignalKValue } };
    solar: { panelPower: SignalKValue };
    loadPower: SignalKValue;
  };
  sailing: {
    headingDeg: number;
    trueWindDirDeg: number;
    trueWindSpeedKts: number;
    apparentWindAngleDeg: number;
    apparentWindSpeedKts: number;
    targetUpwindAngleDeg: number;
    mainsheetPct: number;
    jibsheetPct: number;
    rudderAngleDeg: number;
    noGoAngleDeg: number;
    autopilotMode: SimulationState['autopilotMode'];
    autopilotTargetDeg: number;
    instrumentsPowered: boolean;
  };
  route: {
    fromName: string;
    toName: string;
    progress: number;
    distanceRemainingNm: number;
    bearingToWaypointDeg: number;
    crossTrackNm: number;
    depthM: number;
    channelHazard: boolean;
    reefLevel: number;
  };
  systems: {
    vhfOn: boolean;
    windSpeedKts: number;
    gustSpeedKts: number;
    barometerTrend: string;
    weatherPhase: string;
    fridgeTempC: number;
    provisionsDays: number;
  };
}

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function normalizeAngle180(degrees: number): number {
  return ((degrees + 540) % 360) - 180;
}

function normalizeAngle360(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** No-go clearance margin for a simple close-hauled target when no vessel polar is installed. */
export const UPWIND_TARGET_MARGIN_DEG = 6;

/** Adapt the simulation's single source of truth for the digital and cabin displays. */
export function toMarineInstrumentData(state: SimulationState, noGoAngleDeg: number): MarineInstrumentData {
  const electrical = state.electrical;
  const trueWindAngleDeg = normalizeAngle180(state.weather.trueWindDirDeg - state.headingDeg);
  const bearingToWaypointDeg = normalizeAngle360(
    (Math.atan2(state.passage.totalDistanceNm - state.passage.xNm, state.passage.zNm) * 180) / Math.PI,
  );
  const vmgDeg = normalizeAngle180(state.cogDeg - bearingToWaypointDeg);
  const targetUpwindAngleDeg = noGoAngleDeg + UPWIND_TARGET_MARGIN_DEG;
  return {
    navigation: {
      speedThroughWater: { value: state.boatSpeedKts, units: 'kn' },
      speedOverGround: { value: state.sogKts, units: 'kn' },
      headingTrue: { value: degToRad(state.headingDeg), units: 'rad' },
      courseOverGroundTrue: { value: degToRad(state.cogDeg), units: 'rad' },
      velocityMadeGoodToWaypoint: {
        value: state.sogKts * Math.cos(degToRad(vmgDeg)),
        units: 'kn',
      },
      attitude: { roll: degToRad(state.heelDeg), pitch: degToRad(state.pitchDeg) },
    },
    environment: {
      depth: { belowTransducer: { value: state.passage.depthM, units: 'm' } },
      wind: {
        angleApparent: { value: degToRad(state.apparentWindAngleDeg), units: 'rad' },
        speedApparent: { value: state.apparentWindSpeedKts, units: 'kn' },
        angleTrueWater: { value: degToRad(trueWindAngleDeg), units: 'rad' },
        speedTrue: { value: state.weather.trueWindSpeedKts, units: 'kn' },
      },
      outside: { pressure: { value: state.weather.barometerHpa * 100, units: 'Pa' } },
      water: { waveHeight: { value: state.weather.waveHeightM, units: 'm' } },
    },
    electrical: {
      batteries: {
        house: {
          capacity: {
            stateOfCharge: {
              value: electrical.batteryAh / Math.max(1, electrical.batteryCapacityAh),
              units: 'ratio',
            },
          },
          voltage: { value: electrical.voltage, units: 'V' },
        },
      },
      solar: { panelPower: { value: electrical.solarWatts, units: 'W' } },
      loadPower: { value: electrical.drawWatts, units: 'W' },
    },
    sailing: {
      headingDeg: state.headingDeg,
      trueWindDirDeg: state.weather.trueWindDirDeg,
      trueWindSpeedKts: state.weather.trueWindSpeedKts,
      apparentWindAngleDeg: state.apparentWindAngleDeg,
      apparentWindSpeedKts: state.apparentWindSpeedKts,
      targetUpwindAngleDeg,
      mainsheetPct: state.mainsheetPct,
      jibsheetPct: state.jibsheetPct,
      rudderAngleDeg: state.rudderAngleDeg,
      noGoAngleDeg,
      autopilotMode: state.autopilotMode,
      autopilotTargetDeg: state.autopilotTargetDeg,
      instrumentsPowered: electrical.instruments,
    },
    route: {
      fromName: state.passage.fromName,
      toName: state.passage.toName,
      progress: Math.max(0, Math.min(1, state.passage.xNm / Math.max(1, state.passage.totalDistanceNm))),
      distanceRemainingNm: Math.max(0, state.passage.totalDistanceNm - state.passage.xNm),
      bearingToWaypointDeg,
      crossTrackNm: state.passage.zNm,
      depthM: state.passage.depthM,
      channelHazard: state.passage.channelHazardWarning,
      reefLevel: state.reefLevel,
    },
    systems: {
      vhfOn: electrical.vhfRadio,
      windSpeedKts: state.weather.trueWindSpeedKts,
      gustSpeedKts: state.weather.gustSpeedKts,
      barometerTrend: state.weather.barometerTrend,
      weatherPhase: state.weather.phase,
      fridgeTempC: electrical.fridgeTempC,
      provisionsDays: electrical.provisionsDays,
    },
  };
}

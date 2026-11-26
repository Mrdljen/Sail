import type {
  BoatId,
  ManeuverState,
  PointOfSail,
  RealismSwitchProfile,
  ReefLevel,
  SimulationState,
  TackSide,
} from '../types/sailing';
import { BOAT_SPECS } from './boats';
import {
  computeGzRightingMomentNm,
  computeWaveSlamAndSurfForces,
  evaluateHullResistance,
} from './hullPhysics';
import { CSpline } from './mathSpline';
import { getRealismProfile } from './realism';
import { evaluateWearFactors, getBoatReefGeometry, HYDRO_TUNING, SAIL_TUNING } from './tuning';

// =============================================================================
// Cited Reference Constants (bythelee & tiller)
// =============================================================================

export const AIR_RHO = 1.204; // kg/m^3 — ref: bythelee/public_html/js/leeboard/sailsim/Wind.js:L39
export const MS_TO_KTS = 1.94384; // ref: bythelee/public_html/js/leeboard/core/Util.js:L34
export const KTS_TO_MS = 1 / MS_TO_KTS; // ref: bythelee/public_html/js/leeboard/core/Util.js:L43
export const WATER_RHO = HYDRO_TUNING.waterRhoKgM3; // see tuning.ts ("guess")

const DEG_TO_RAD = Math.PI / 180; // ref: bythelee/public_html/js/leeboard/core/Math.js:L35
const RAD_TO_DEG = 180 / Math.PI; // ref: bythelee/public_html/js/leeboard/core/Math.js:L43
const DEF_ZERO_TOLERANCE = 1e-10; // ref: bythelee/public_html/js/leeboard/core/Math.js:L64

// bythelee "Sail" foil Cl/Cd/Cm curve — ref: bythelee/public_html/data/clcdcurves.json:L74-86
const SAIL_ALPHAS: readonly number[] = [
  0, 11, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 90, 110, 140, 150, 160, 165, 170, 171, 180,
];
const SAIL_CLS: readonly number[] = [
  0.0, 0.33, 0.39, 0.48, 0.71, 0.97, 1.2, 1.34, 1.3, 1.17, 1.1, 1.06, 1.0, 0.43, -0.06, -0.76,
  -0.97, -1.12, -1.16, -1.13, -1.1, 0.0,
];
const SAIL_CDS: readonly number[] = [
  0.25, 0.12, 0.11, 0.13, 0.18, 0.25, 0.34, 0.46, 0.53, 0.6, 0.68, 0.8, 0.89, 1.27, 1.33, 1.23, 1.1,
  0.89, 0.76, 0.6, 0.57, 0.25,
];
const SAIL_CMS: readonly number[] = [
  0.465, 0.359, 0.358, 0.363, 0.386, 0.42, 0.445, 0.457, 0.462, 0.466, 0.47, 0.475, 0.479, 0.5, 0.513,
  0.538, 0.555, 0.614, 0.637, 0.637, 0.63, 0.535,
];
// ref: bythelee/public_html/js/leeboard/core/Foils.js:L416 (data.isSymmetric || true -> true)
const SAIL_IS_SYMMETRIC = true;
// ref: bythelee/public_html/data/boats.json:L343 (Tubby mainsail aspectRatio)
const MAIN_ASPECT_RATIO = 3;

// tiller sail trim & maneuver constants — ref: tiller/apps/web/game/constants.ts
export const TILLER_NO_GO_HALF = 43; // ref: tiller/apps/web/game/constants.ts:L19
export const TILLER_GYBE_ZONE = 170; // ref: tiller/apps/web/game/constants.ts:L20
export const TILLER_HEAD_TO_WIND_DEADBAND = 3; // ref: tiller/apps/web/game/constants.ts:L21
export const TILLER_LUFF_WARN_BAND = 12; // ref: tiller/apps/web/game/constants.ts:L24
export const TILLER_LUFF_TRIM_DEADBAND = 0.08; // ref: tiller/apps/web/game/constants.ts:L25
export const TILLER_LUFF_TRIM_BAND = 0.5; // ref: tiller/apps/web/game/constants.ts:L26
export const TILLER_BOOM_MIN = 5; // ref: tiller/apps/web/game/constants.ts:L61
export const TILLER_BOOM_MAX = 85; // ref: tiller/apps/web/game/constants.ts:L62
export const TILLER_OPTIMAL_BOOM_FACTOR = 0.5; // ref: tiller/apps/web/game/constants.ts:L63
export const TILLER_IRONS_SPEED = 0.6; // ref: tiller/apps/web/game/constants.ts:L77
export const TILLER_STALL_RATE = 8; // ref: tiller/apps/web/game/constants.ts:L78
export const TILLER_STALL_HOLD = 0.4; // ref: tiller/apps/web/game/constants.ts:L79
export const TILLER_SHEET_IN_THRESHOLD = 0.7; // ref: tiller/apps/web/game/constants.ts:L81
export const TILLER_CRASH_GYBE_MIN_SPEED = 4; // ref: tiller/apps/web/game/constants.ts:L88
// ref: tiller/apps/web/game/sailing.ts:L54-71 point-of-sail bands
const TILLER_POS_CLOSE_HAULED_MAX = 50; // ref: tiller/apps/web/game/sailing.ts:L58
const TILLER_POS_CLOSE_REACH_MAX = 80; // ref: tiller/apps/web/game/sailing.ts:L61
const TILLER_POS_BEAM_REACH_MAX = 100; // ref: tiller/apps/web/game/sailing.ts:L64
const TILLER_POS_BROAD_REACH_MAX = 150; // ref: tiller/apps/web/game/sailing.ts:L67
// ref: tiller/apps/web/game/three/sim.ts:L510
const TILLER_CROSSED_STERN_MIN_ATWA = 90;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

// ref: bythelee/public_html/js/leeboard/core/Math.js:L146-156
function wrapDegrees(degrees: number): number {
  let d = degrees % 360;
  if (d <= -180) d += 360;
  else if (d > 180) d -= 360;
  return d;
}

// ref: bythelee/public_html/js/leeboard/core/Math.js:L72-75 & L123-125
function cleanNearZero(x: number): number {
  return x < DEF_ZERO_TOLERANCE && x > -DEF_ZERO_TOLERANCE ? 0 : x;
}

// bythelee Binary Search & Natural Cubic Spline (CSpline) imported from ./mathSpline

const SPLINE_CL = new CSpline(SAIL_ALPHAS, SAIL_CLS);
const SPLINE_CD = new CSpline(SAIL_ALPHAS, SAIL_CDS);
const SPLINE_CM = new CSpline(SAIL_ALPHAS, SAIL_CMS);

/**
 * Evaluates bythelee "Sail" Cl/Cd/Cm natural cubic splines across -180..+180° AoA.
 * Port of LBFoils.ClCdCurve.prototype.calcCoefsDeg (Foils.js:L433-519) & ClCdInterp (L341-362).
 */
export function evaluateFoilCoefficients(signedAoADeg: number): {
  cl: number;
  cd: number;
  cm: number;
} {
  let degrees = wrapDegrees(signedAoADeg);
  let sign = 1;
  if (SAIL_IS_SYMMETRIC && degrees < 0) {
    sign = -1;
    degrees = -degrees;
  }

  const lowIn = SPLINE_CL.findLowIndex(degrees);
  const cl = cleanNearZero(SPLINE_CL.interpolate(degrees, lowIn) * sign);
  const cd = cleanNearZero(SPLINE_CD.interpolate(degrees, lowIn));
  const cm = cleanNearZero(SPLINE_CM.interpolate(degrees, lowIn) * sign);
  return { cl, cd, cm };
}

/**
 * Port of bythelee LBFoils.ClCd.calcLiftDragMoment (Foils.js:L80-122) &
 * LBFoils.Foil.prototype.calcLocalForce (Foils.js:L622-682).
 */
export function byTheLeeCalcLocalForce(
  area: number,
  aspectRatio: number,
  chordLength: number,
  qInfLocalX: number,
  qInfLocalY: number,
  wearMod?: { clMult?: number; extraCd?: number },
): {
  angleDeg: number;
  cl: number;
  cd: number;
  cm: number;
  lift: number;
  drag: number;
  inducedDrag: number;
  fx: number;
  fy: number;
  mz: number;
} {
  // chord = (chordLength, 0), so chord.angleToSigned(qInfLocal) = atan2(qInfLocalY, qInfLocalX)
  // ref: Geometry-THREE.js:L109-135
  const qInfSpeed = Math.hypot(qInfLocalX, qInfLocalY);
  let angleRad = 0;
  if (qInfSpeed > DEF_ZERO_TOLERANCE) {
    const cosTheta = clamp(qInfLocalX / qInfSpeed, -1, 1);
    if (Math.abs(cosTheta + 1) < DEF_ZERO_TOLERANCE) {
      angleRad = -Math.PI;
    } else if (Math.abs(cosTheta - 1) < DEF_ZERO_TOLERANCE) {
      angleRad = 0;
    } else {
      angleRad = Math.acos(cosTheta);
      if (qInfLocalY < 0) angleRad = -angleRad;
    }
  }
  const angleDeg = angleRad * RAD_TO_DEG;

  const baseCoefs = evaluateFoilCoefficients(angleDeg);
  const cl = baseCoefs.cl * (wearMod?.clMult ?? 1);
  const cd = baseCoefs.cd + (wearMod?.extraCd ?? 0);
  const cm = baseCoefs.cm;
  const scale = 0.5 * AIR_RHO * area * qInfSpeed * qInfSpeed;
  const lift = cl * scale;
  const drag = cd * scale;
  const inducedDrag = aspectRatio > 0 ? scale * ((cl * cl) / (Math.PI * aspectRatio)) : 0;

  let mz = 0;
  if (qInfSpeed > DEF_ZERO_TOLERANCE) {
    const cosAlpha = qInfLocalX / qInfSpeed;
    const sinAlpha = qInfLocalY / qInfSpeed;
    const forceX = drag * cosAlpha - lift * sinAlpha;
    const forceY = drag * sinAlpha + lift * cosAlpha;

    const startX = Math.abs(cm) * chordLength;
    const fLenSq = forceX * forceX + forceY * forceY;
    let applX = startX;
    let applY = 0;
    if (fLenSq > DEF_ZERO_TOLERANCE) {
      const t = -(startX * forceX) / fLenSq;
      applX = startX + forceX * t;
      applY = forceY * t;
    }
    // ref: Foils.js:L107 LBPhysics.calcMoment
    mz = applX * forceY - applY * forceX;
  }

  const totalDrag = drag + inducedDrag;
  let fx = 0;
  let fy = 0;
  if (qInfSpeed > DEF_ZERO_TOLERANCE) {
    fx = (-qInfLocalY * lift + qInfLocalX * totalDrag) / qInfSpeed;
    fy = (qInfLocalX * lift + qInfLocalY * totalDrag) / qInfSpeed;
  }

  return { angleDeg, cl, cd, cm, lift, drag, inducedDrag, fx, fy, mz };
}

// =============================================================================
// tiller Reference Trim & Point-of-Sail Helpers
// =============================================================================

// ref: tiller/apps/web/game/sailing.ts:L96-98
export function tillerOptimalBoomAngle(absTwaDeg: number): number {
  return clamp(absTwaDeg * TILLER_OPTIMAL_BOOM_FACTOR, TILLER_BOOM_MIN, TILLER_BOOM_MAX);
}

// ref: tiller/apps/web/game/sailing.ts:L100-107
export function tillerOptimalSheet(absTwaDeg: number): number {
  const angle = tillerOptimalBoomAngle(absTwaDeg);
  return 1 - (angle - TILLER_BOOM_MIN) / (TILLER_BOOM_MAX - TILLER_BOOM_MIN);
}

// ref: tiller/apps/web/game/sailing.ts:L138-152
export function tillerLuffFactor(absTwaDeg: number, sheetNorm: number): number {
  const pinch = clamp(
    (TILLER_NO_GO_HALF + TILLER_LUFF_WARN_BAND - absTwaDeg) / TILLER_LUFF_WARN_BAND,
    0,
    1,
  );
  const eased = clamp(
    (tillerOptimalSheet(absTwaDeg) - sheetNorm - TILLER_LUFF_TRIM_DEADBAND) / TILLER_LUFF_TRIM_BAND,
    0,
    1,
  );
  return Math.max(pinch, eased);
}

export function classifyPointOfSail(absAwaDeg: number, noGoDeg: number): PointOfSail {
  if (absAwaDeg < noGoDeg) return 'In Irons';
  if (absAwaDeg < TILLER_POS_CLOSE_HAULED_MAX) return 'Close-Hauled';
  if (absAwaDeg < TILLER_POS_CLOSE_REACH_MAX) return 'Close Reach';
  if (absAwaDeg < TILLER_POS_BEAM_REACH_MAX) return 'Beam Reach';
  if (absAwaDeg < TILLER_POS_BROAD_REACH_MAX) return 'Broad Reach';
  return 'Running';
}

export function getOptimalSheetPct(absAwaDeg: number): number {
  return Math.round(tillerOptimalSheet(absAwaDeg) * 100);
}

export function getReefAreaFactor(reef: ReefLevel, boatId: BoatId = 'elan-19'): number {
  const spec = BOAT_SPECS[boatId] ?? BOAT_SPECS['elan-19'];
  return getBoatReefGeometry(spec, reef).mainAreaFrac;
}

export interface FoilForceOutput {
  profile: RealismSwitchProfile;
  // Aerodynamic & Hydrodynamic Forces/Moments for 4-DOF Integration
  fDriveN: number;
  fLatSignedN: number; // positive pushes toward starboard (+swayVelMs)
  heelingTorqueNm: number;
  rightingTorqueMaxNm: number;
  ceHeightArmM: number;
  hullSpeedMs: number;
  dragAreaCoeff: number;
  waveSlamDragN: number;
  waveSurfPushN: number;
  // Steady-state analytical reference estimates (useful for polar tests & diagnostics)
  targetSpeedKts: number;
  targetHeelDeg: number;
  leewayDeg: number;
  sailEfficiency: number;
  isLuffing: boolean;
  isOverpowered: boolean;
  pointOfSail: PointOfSail;
  tackSide: TackSide;
  boomSide: -1 | 1;
  boomAngleDeg: number;
  maneuverState: ManeuverState;
  angleOfAttackDeg: number;
  sailLiftN: number;
  sailDragN: number;
  accidentalGybeSlam: boolean;
}

/**
 * Evaluates a single deployed sail as an independent bythelee Foil in vessel coordinates
 * (+x_v = aft, +y_v = starboard) and rotates its resolved 2D force vector back to vessel axes.
 */
function evalSailInVesselFrame(
  area: number,
  aspectRatio: number,
  chordLengthM: number,
  qInfVesselX: number,
  qInfVesselY: number,
  chordAngleDeg: number,
  wearMod?: { clMult?: number; extraCd?: number },
): {
  aoaDeg: number;
  cl: number;
  cd: number;
  fDriveN: number;
  fLatSignedN: number;
  liftMagN: number;
  totalDragN: number;
} {
  if (area <= 0) {
    return { aoaDeg: 0, cl: 0, cd: 0, fDriveN: 0, fLatSignedN: 0, liftMagN: 0, totalDragN: 0 };
  }
  const bRad = degToRad(chordAngleDeg);
  const cosB = Math.cos(bRad);
  const sinB = Math.sin(bRad);

  // Rotate free-stream wind vector into sail-chord local frame (-bRad)
  const qxL = qInfVesselX * cosB + qInfVesselY * sinB;
  const qyL = -qInfVesselX * sinB + qInfVesselY * cosB;

  const res = byTheLeeCalcLocalForce(area, aspectRatio, chordLengthM, qxL, qyL, wearMod);

  // Rotate resultant force back into vessel axes (+bRad)
  const fxV = res.fx * cosB - res.fy * sinB;
  const fyV = res.fx * sinB + res.fy * cosB;

  return {
    aoaDeg: res.angleDeg,
    cl: res.cl,
    cd: res.cd,
    fDriveN: -fxV, // forward thrust along -x_v
    fLatSignedN: fyV, // starboard (+y_v) / port (-y_v)
    liftMagN: Math.abs(res.lift),
    totalDragN: res.drag + res.inducedDrag,
  };
}

/**
 * Evaluates full aerodynamic foil forces (independent Main + Jib + optional Cutter Staysail foils),
 * tiller maneuver state machine (SAILING / TACKING / IN_IRONS / GYBING / CRASH_GYBE / by-the-lee),
 * and hydrodynamic resistance coefficients for 4-DOF rigid-body integration.
 */
export function solveFoilAndManeuver(
  state: SimulationState,
  apparentWindAngleDeg: number,
  apparentWindSpeedKts: number,
  waveCyclePhase = 0,
): FoilForceOutput {
  const spec = BOAT_SPECS[state.boatId];
  const cfg = state.vesselCfg ?? spec.defaultCfg;
  const profile = getRealismProfile(state.simRealism, spec.noGoAngleDeg);

  const absAwa = Math.abs(apparentWindAngleDeg);
  const effectiveNoGo = profile.noGoDeg;
  const pointOfSail = classifyPointOfSail(absAwa, effectiveNoGo);

  // Wind side: AWA >= 0 => wind from STARBOARD (+1); AWA < 0 => wind from PORT (-1)
  const windSide: -1 | 1 = apparentWindAngleDeg >= 0 ? 1 : -1;
  const tackSide: TackSide = windSide === 1 ? 'starboard' : 'port';
  const desiredBoomSide: -1 | 1 = windSide === 1 ? -1 : 1;

  // Sheet values in [0, 1] (1 = sheeted in, 0 = eased out, ref: tiller/constants.ts:L5)
  const optSheetPct = getOptimalSheetPct(absAwa);
  const effectiveMainsheet = profile.autoTrimAssist
    ? lerp(state.mainsheetPct, optSheetPct, SAIL_TUNING.arcadeAutoTrimBlend)
    : state.mainsheetPct;
  const effectiveJibsheet = profile.autoTrimAssist
    ? lerp(state.jibsheetPct, optSheetPct, SAIL_TUNING.arcadeAutoTrimBlend)
    : state.jibsheetPct;
  const mainSheetNorm = clamp(effectiveMainsheet, 0, 100) / 100;
  const jibSheetNorm = clamp(effectiveJibsheet, 0, 100) / 100;

  // tiller State Machine: SAILING / TACKING / IN_IRONS / GYBING / CRASH_GYBE (+ by-the-lee warning)
  // ref: tiller/apps/web/game/three/sim.ts:L501-592
  let boomSide: -1 | 1 = state.boomSide ?? desiredBoomSide;
  let maneuverState: ManeuverState = 'sailing';
  let accidentalGybeSlam = false;

  const speedKts = state.boatSpeedKts ?? 0;
  const yawRateAbs = Math.abs(state.yawRateDegS ?? 0);

  if (absAwa < effectiveNoGo) {
    if (speedKts < TILLER_IRONS_SPEED && yawRateAbs < TILLER_STALL_RATE) {
      maneuverState = 'in-irons';
    } else {
      maneuverState = 'tacking';
    }
    boomSide = desiredBoomSide;
  } else if (boomSide !== desiredBoomSide) {
    if (absAwa <= TILLER_CROSSED_STERN_MIN_ATWA) {
      maneuverState = 'tacking';
      boomSide = desiredBoomSide;
    } else if (absAwa >= TILLER_GYBE_ZONE || absAwa < SAIL_TUNING.byTheLeeWarnMinDeg) {
      const controlled =
        !profile.accidentalGybeDamage ||
        mainSheetNorm >= TILLER_SHEET_IN_THRESHOLD ||
        speedKts < TILLER_CRASH_GYBE_MIN_SPEED;
      boomSide = desiredBoomSide;
      if (controlled) {
        maneuverState = 'gybing';
      } else {
        maneuverState = 'crash-gybe';
        accidentalGybeSlam = true;
      }
    } else {
      maneuverState = 'by-the-lee';
    }
  } else if (absAwa > TILLER_GYBE_ZONE) {
    maneuverState = 'gybing';
  }

  // Boom & foresail sheeting angles from sheet norm (0 = eased to MAX, 1 = sheeted in to MIN)
  // ref: tiller/apps/web/game/sailing.ts:L100-102
  const boomMagnitudeDeg = lerp(TILLER_BOOM_MAX, TILLER_BOOM_MIN, mainSheetNorm);
  const boomAngleDeg = boomSide * boomMagnitudeDeg;

  const jibAngleDeg =
    boomSide * lerp(SAIL_TUNING.jib.sheetAngleMaxDeg, SAIL_TUNING.jib.sheetAngleMinDeg, jibSheetNorm);
  const staysailAngleDeg =
    boomSide *
    lerp(SAIL_TUNING.staysail.sheetAngleMaxDeg, SAIL_TUNING.staysail.sheetAngleMinDeg, jibSheetNorm);

  // Per-sail geometric reef-point areas & Center-of-Effort heights + tides-of-fortune-inspired Cl/Cd wear
  const awsMs = apparentWindSpeedKts * KTS_TO_MS;
  const awaRad = degToRad(apparentWindAngleDeg);
  const qInfVesselX = Math.cos(awaRad) * awsMs;
  const qInfVesselY = -Math.sin(awaRad) * awsMs;

  const reefGeom = getBoatReefGeometry(spec, state.reefLevel, cfg.stabilitySails);
  const wearFactors = evaluateWearFactors(state.wear);
  const sailWearMod = {
    clMult: wearFactors.sailClMult,
    extraCd: wearFactors.sailExtraCd,
  };

  const mainArea = cfg.sailAreaM2 * reefGeom.mainAreaFrac;
  const jibArea = state.jibDeployed ? cfg.jibAreaM2 * reefGeom.jibAreaFrac : 0;
  const staysailArea =
    spec.hasStaysail && state.staysailDeployed
      ? (cfg.staysailAreaM2 ?? 0) * reefGeom.staysailAreaFrac
      : 0;

  // Evaluate each deployed sail as its own independent bythelee Foil & sum vectors
  const mainRes = evalSailInVesselFrame(
    mainArea,
    MAIN_ASPECT_RATIO,
    cfg.boatLengthM * SAIL_TUNING.main.chordLengthFrac,
    qInfVesselX,
    qInfVesselY,
    boomAngleDeg,
    sailWearMod,
  );
  const jibRes = evalSailInVesselFrame(
    jibArea,
    SAIL_TUNING.jib.aspectRatio,
    cfg.boatLengthM * SAIL_TUNING.jib.chordLengthFrac,
    qInfVesselX,
    qInfVesselY,
    jibAngleDeg,
    sailWearMod,
  );
  const staysailRes = evalSailInVesselFrame(
    staysailArea,
    SAIL_TUNING.staysail.aspectRatio,
    cfg.boatLengthM * SAIL_TUNING.staysail.chordLengthFrac,
    qInfVesselX,
    qInfVesselY,
    staysailAngleDeg,
    sailWearMod,
  );

  let fDriveN = mainRes.fDriveN + jibRes.fDriveN + staysailRes.fDriveN;
  const fLatSignedN = mainRes.fLatSignedN + jibRes.fLatSignedN + staysailRes.fLatSignedN;
  const fLatMagN = Math.abs(fLatSignedN);
  const sailLiftN = mainRes.liftMagN + jibRes.liftMagN + staysailRes.liftMagN;
  const sailDragN = mainRes.totalDragN + jibRes.totalDragN + staysailRes.totalDragN;

  const qAir = 0.5 * AIR_RHO * awsMs * awsMs;
  if (absAwa < effectiveNoGo && profile.inIronsGhostDrive) {
    fDriveN = Math.max(fDriveN, qAir * mainArea * SAIL_TUNING.arcadeInIronsDriveCoeff);
  } else if (profile.inIronsGhostDrive) {
    fDriveN = Math.max(fDriveN, qAir * mainArea * SAIL_TUNING.arcadeMinForwardCoeff);
  }

  // Per-sail Center-of-Effort heeling moment sum directly from boat reef-point geometry
  const mainCeM = reefGeom.mainCeHeightM;
  const jibCeM = reefGeom.jibCeHeightM;
  const staysailCeM = reefGeom.staysailCeHeightM;

  const totalLatArmNm =
    -mainRes.fLatSignedN * mainCeM -
    jibRes.fLatSignedN * jibCeM -
    staysailRes.fLatSignedN * staysailCeM;
  const ceHeightArmM =
    fLatMagN > 1 ? Math.abs(totalLatArmNm) / fLatMagN : mainCeM;

  // Delft residuary + ITTC-57 hydrodynamic hull resistance equilibrium (with hullF wear multiplier)
  const hullFouling = wearFactors.hullDragMult;
  const lengthScale = cfg.boatLengthM / Math.max(1, spec.defaultCfg.boatLengthM);
  const wettedScale = cfg.wingSurDragM2 / Math.max(0.2, spec.defaultCfg.wingSurDragM2);
  const hullSpeedMs =
    spec.hullSpeedKts *
    Math.sqrt(
      clamp(
        lengthScale,
        HYDRO_TUNING.hullSpeedLengthRefRatioMin,
        HYDRO_TUNING.hullSpeedLengthRefRatioMax,
      ),
    ) *
    KTS_TO_MS;

  // Wave slamming upwind & surfing downwind (isolated "guess" wave layer, gated by realism switch)
  const { waveSlamDragN, waveSurfPushN } = computeWaveSlamAndSurfForces(
    cfg.massKg,
    absAwa,
    state.weather.waveHeightM,
    waveCyclePhase,
    profile.waveSlamAndSurf,
  );

  // Solve steady-state equilibrium speed where Delft + ITTC-57 hull drag balances positiveDrive
  const positiveDrive = Math.max(0, fDriveN + waveSurfPushN - waveSlamDragN);
  const maxEquilibriumMs = hullSpeedMs * HYDRO_TUNING.maxTargetHullSpeedMult;
  let targetSpeedMs = 0;
  if (positiveDrive > 0.5) {
    let lo = 0;
    let hi = maxEquilibriumMs;
    const estHeelDeg = Math.abs(state.heelDeg ?? 0);
    for (let iter = 0; iter < 16; iter++) {
      const mid = 0.5 * (lo + hi);
      const res = evaluateHullResistance(
        state.boatId,
        spec.delftHull,
        mid,
        estHeelDeg,
        spec.keelType,
        lengthScale,
        wettedScale,
        hullFouling,
        false,
      );
      if (res.totalDragN < positiveDrive) lo = mid;
      else hi = mid;
    }
    targetSpeedMs = 0.5 * (lo + hi);
  }
  const diagRes = evaluateHullResistance(
    state.boatId,
    spec.delftHull,
    Math.max(0.5, Math.abs(state.surgeVelMs ?? targetSpeedMs)),
    Math.abs(state.heelDeg ?? 0),
    spec.keelType,
    lengthScale,
    wettedScale,
    hullFouling,
    false,
  );
  const diagSpeed = Math.max(0.5, Math.abs(state.surgeVelMs ?? targetSpeedMs));
  const dragAreaCoeff = diagRes.totalDragN / (diagSpeed * diagSpeed);
  const rawTargetKts = clamp(
    targetSpeedMs * MS_TO_KTS,
    0,
    spec.hullSpeedKts * HYDRO_TUNING.maxTargetHullSpeedMult,
  );

  // Keel Hydrodynamic Lateral Resistance -> Steady-state leeway estimate
  const effWaterSpeedMs = Math.max(1.2, Math.max(targetSpeedMs, Math.abs(state.surgeVelMs ?? 0)));
  const qWater = 0.5 * WATER_RHO * effWaterSpeedMs * effWaterSpeedMs;
  const leewayRad = clamp(
    fLatMagN / Math.max(80, qWater * cfg.keelAreaM2 * HYDRO_TUNING.keelLiftSlope),
    0,
    degToRad(HYDRO_TUNING.leewayMaxDeg),
  );
  const leewayDeg =
    absAwa < HYDRO_TUNING.leewayCutoffAwaDeg && Math.max(rawTargetKts, speedKts) > 0.25
      ? -windSide * (leewayRad * RAD_TO_DEG) * profile.leewayScale
      : 0;

  const stabilityScale = cfg.stabilityBody / Math.max(0.1, spec.defaultCfg.stabilityBody);
  const rightingTorqueMaxNm = computeGzRightingMomentNm(
    cfg.massKg,
    spec.gzCurve.maxGzAngleDeg,
    spec.gzCurve,
    stabilityScale,
  );
  const heelingTorqueNm = totalLatArmNm * HYDRO_TUNING.heelingMomentArmScale;

  // Solve steady-state heel angle where GZ righting moment balances cos(phi)^exp aerodynamic heeling moment
  let loDeg = 0;
  let hiDeg = spec.gzCurve.maxGzAngleDeg;
  const absHeelTorqueNm = Math.abs(heelingTorqueNm);
  if (absHeelTorqueNm > 1) {
    for (let iter = 0; iter < 16; iter++) {
      const midDeg = 0.5 * (loDeg + hiDeg);
      const rm = computeGzRightingMomentNm(cfg.massKg, midDeg, spec.gzCurve, stabilityScale);
      const effHm = absHeelTorqueNm * Math.pow(Math.max(0.25, Math.cos(degToRad(midDeg))), HYDRO_TUNING.heelAerodynamicCosExp);
      if (rm < effHm) loDeg = midDeg;
      else hiDeg = midDeg;
    }
  }
  const rawHeelDeg = absHeelTorqueNm <= 1 ? 0 : 0.5 * (loDeg + hiDeg);
  const targetHeelDeg =
    Math.sign(heelingTorqueNm || apparentWindAngleDeg || 1) *
    clamp(rawHeelDeg, 0, profile.forgivingHeelCapDeg);

  const isOverpowered = Math.abs(targetHeelDeg) > spec.maxSafeHeelDeg;
  const overpowerDrag = isOverpowered
    ? clamp(
        1 - (Math.abs(targetHeelDeg) - spec.maxSafeHeelDeg) * HYDRO_TUNING.overpowerDragSlope,
        HYDRO_TUNING.overpowerDragMin,
        1.0,
      )
    : 1.0;

  // tiller luffing formula combined with head-to-wind deadband (sim.ts:L480-483)
  const luffVal =
    maneuverState === 'in-irons' || absAwa <= TILLER_HEAD_TO_WIND_DEADBAND
      ? 1
      : tillerLuffFactor(absAwa, mainSheetNorm);
  const isLuffing =
    absAwa < effectiveNoGo || (luffVal > 0.25 && apparentWindSpeedKts > 5);

  const totalArea = Math.max(0.1, mainArea + jibArea + staysailArea);
  const sailEfficiency = clamp(
    (sailLiftN + sailDragN * 0.45) / Math.max(1, qAir * totalArea * 1.4),
    0,
    1,
  );

  return {
    profile,
    fDriveN,
    fLatSignedN,
    heelingTorqueNm,
    rightingTorqueMaxNm,
    ceHeightArmM,
    hullSpeedMs,
    dragAreaCoeff,
    waveSlamDragN,
    waveSurfPushN,
    targetSpeedKts: rawTargetKts * overpowerDrag,
    targetHeelDeg,
    leewayDeg,
    sailEfficiency,
    isLuffing,
    isOverpowered,
    pointOfSail,
    tackSide,
    boomSide,
    boomAngleDeg,
    maneuverState,
    angleOfAttackDeg: Math.abs(mainRes.aoaDeg),
    sailLiftN,
    sailDragN,
    accidentalGybeSlam,
  };
}

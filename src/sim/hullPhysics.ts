import type { BoatId, DelftHullParams, GzCurveParams } from '../types/sailing';
import { CSpline } from './mathSpline';
import { HYDRO_TUNING } from './tuning';

// =============================================================================
// Cited Reference Constants (bythelee/Delft.js, Hull.js, Water.js, SailEnv.js)
// =============================================================================

export const DELFT_WATER_DENSITY = 1025; // ref: bythelee/public_html/js/leeboard/sailsim/Water.js:L35
export const DELFT_KINEMATIC_VISCOSITY = 1e-6; // ref: bythelee/public_html/js/leeboard/sailsim/Water.js:L40
export const DELFT_GRAVITY = 9.81; // ref: bythelee/public_html/js/leeboard/sailsim/SailEnv.js:L65

// ref: bythelee/public_html/js/leeboard/sailsim/Delft.js:L30-41 (Larsson p. 78)
export const DELFT_RESIDUARY_FNS: readonly number[] = [
  0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6,
];

export const DELFT_RESIDUARY_COEFS: readonly (readonly number[])[] = [
  [-0.0014, +0.0004, +0.0014, +0.0027, +0.0056, +0.0032, -0.0064, -0.0171, -0.0201, +0.0495, +0.0808], // a0
  [+0.0403, -0.1808, -0.1071, +0.0463, -0.8005, -0.1011, +2.3095, +3.4017, +7.1576, +1.5618, -5.3233], // a1
  [+0.0470, +0.1793, +0.0637, -0.1263, +0.4891, -0.0813, -1.5152, -1.9862, -6.3304, -6.0661, -1.1513], // a2
  [-0.0227, -0.0004, +0.0090, +0.0150, +0.0269, -0.0382, +0.0751, +0.3242, +0.5829, +0.8641, +0.9663], // a3
  [-0.0119, +0.0097, +0.0153, +0.0274, +0.0519, +0.0320, -0.0858, -0.1450, +0.1630, +1.1702, +1.6084], // a4
  [+0.0061, +0.0118, +0.0011, -0.0299, -0.0313, -0.1481, -0.5349, -0.8043, -0.3966, +1.7610, +2.7459], // a5
  [-0.0086, -0.0055, +0.0012, +0.0110, +0.0292, +0.0837, +0.1715, +0.2952, +0.5023, +0.9176, +0.8491], // a6
  [-0.0307, +0.1721, +0.1021, -0.0595, +0.7314, +0.0223, -2.4550, -3.5284, -7.1579, -2.1191, +4.7129], // a7
  [-0.0553, -0.1728, -0.0648, +0.1220, -0.3619, +0.1587, +1.1865, +1.3575, +5.2534, +5.4281, +1.1089], // a8
];

const RESIDUARY_SPLINES: CSpline[] = DELFT_RESIDUARY_COEFS.map(
  (row) => new CSpline(DELFT_RESIDUARY_FNS, row),
);

// ref: bythelee/public_html/js/leeboard/sailsim/Delft.js:L107-118 (Larsson p. 86)
export const DELFT_WETTED_HEEL_DEGS: readonly number[] = [5, 10, 15, 20, 25, 30, 35];
export const DELFT_WETTED_HEEL_COEFS: readonly (readonly number[])[] = [
  [-4.1120, -4.5220, -3.2910, +1.8500, +6.5100, +12.334, +14.648],
  [+0.0540, -0.1320, -0.3890, -1.2000, -2.3050, -3.9110, -5.1820],
  [-0.0270, -0.0770, -0.1180, -0.1090, -0.0660, +0.0240, +0.1020],
  [+6.3290, +8.7380, +8.9490, +5.3640, +3.4430, +1.7670, +3.4970],
];

const WETTED_HEEL_SPLINES: CSpline[] = DELFT_WETTED_HEEL_COEFS.map(
  (row) => new CSpline(DELFT_WETTED_HEEL_DEGS, row),
);

// ref: bythelee/public_html/js/leeboard/sailsim/Hull.js:L29-32 (Fossati p. 16)
const CF_ROUGHNESS_RATIOS: readonly number[] = [3e3, 1e4, 3e4, 1e5, 3e5];
const CF_ROUGHNESS_VALS: readonly number[] = [6.5e-3, 5e-3, 4e-3, 3e-3, 2.6e-3];
const CF_VS_ROUGHNESS_SPLINE = new CSpline(CF_ROUGHNESS_RATIOS, CF_ROUGHNESS_VALS);

// Delft Systematic Yacht Hull Series (DSYHS) published validity envelope (Larsson Table 4.1)
export const DELFT_VALID_RANGES = {
  lwlBwlMin: 2.76,
  lwlBwlMax: 5.00,
  bwlTcMin: 2.46,
  bwlTcMax: 19.32,
  lwlDispRatioMin: 4.34,
  lwlDispRatioMax: 8.50,
  cpMin: 0.52,
  cpMax: 0.60,
} as const;

const warnedDelftBoats = new Set<string>();

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface DelftValidationResult {
  inRange: boolean;
  reasons: string[];
  correctionFactor: number;
}

/**
 * Checks whether a vessel's hull parameters lie within the Delft DSYHS fin-keel
 * validity envelope. Logs a once-per-vessel warning when out of range and returns
 * the correction multiplier from tuning.ts.
 */
export function validateDelftRange(
  boatId: BoatId | string,
  hull: DelftHullParams,
  keelType: 'fin' | 'long' | 'skeg',
  emitWarning = true,
): DelftValidationResult {
  const reasons: string[] = [];
  const lwlBwl = hull.lwlM / Math.max(0.1, hull.bwlM);
  const bwlTc = hull.bwlM / Math.max(0.05, hull.tcM);
  const lwlDispRatio = hull.lwlM / Math.cbrt(Math.max(0.05, hull.delCM3));

  if (lwlBwl < DELFT_VALID_RANGES.lwlBwlMin || lwlBwl > DELFT_VALID_RANGES.lwlBwlMax) {
    reasons.push(`LWL/BWL=${lwlBwl.toFixed(2)} outside [${DELFT_VALID_RANGES.lwlBwlMin}, ${DELFT_VALID_RANGES.lwlBwlMax}]`);
  }
  if (bwlTc < DELFT_VALID_RANGES.bwlTcMin || bwlTc > DELFT_VALID_RANGES.bwlTcMax) {
    reasons.push(`BWL/Tc=${bwlTc.toFixed(2)} outside [${DELFT_VALID_RANGES.bwlTcMin}, ${DELFT_VALID_RANGES.bwlTcMax}]`);
  }
  if (lwlDispRatio < DELFT_VALID_RANGES.lwlDispRatioMin || lwlDispRatio > DELFT_VALID_RANGES.lwlDispRatioMax) {
    reasons.push(`LWL/delC^(1/3)=${lwlDispRatio.toFixed(2)} outside [${DELFT_VALID_RANGES.lwlDispRatioMin}, ${DELFT_VALID_RANGES.lwlDispRatioMax}]`);
  }
  if (hull.cp < DELFT_VALID_RANGES.cpMin || hull.cp > DELFT_VALID_RANGES.cpMax) {
    reasons.push(`Cp=${hull.cp.toFixed(2)} outside [${DELFT_VALID_RANGES.cpMin}, ${DELFT_VALID_RANGES.cpMax}]`);
  }
  if (keelType === 'long') {
    reasons.push('long-keel hull differs from DSYHS fin-keel series');
  }

  const inRange = reasons.length === 0;
  if (!inRange && emitWarning && !warnedDelftBoats.has(boatId)) {
    warnedDelftBoats.add(boatId);
    console.warn(
      `[Delft DSYHS] Vessel "${boatId}" falls outside Delft fin-keel range (${reasons.join('; ')}). Applying correction factor ${HYDRO_TUNING.delftOutOfRangeResiduaryMult}.`,
    );
  }

  return {
    inRange,
    reasons,
    correctionFactor: inRange ? 1.0 : HYDRO_TUNING.delftOutOfRangeResiduaryMult,
  };
}

/**
 * Port of bythelee LBSailSim.Delft.calcResiduaryResistance & evalResiduaryResistance
 * (Delft.js:L56-101, SailEnv.js:L121-123).
 */
export function byTheLeeDelftResiduaryResistanceN(
  hull: DelftHullParams,
  waterSpeedMs: number,
  clampFroudeAtBounds = true,
): number {
  const absV = Math.abs(waterSpeedMs);
  if (absV < 1e-6) return 0;

  // ref: SailEnv.js:L121-123
  const fnRaw = absV / Math.sqrt(hull.lwlM * DELFT_GRAVITY);
  const fn = clamp(fnRaw, 0.1, 0.6);

  const coefs = RESIDUARY_SPLINES.map((sp) => sp.interpolate(fn));

  // ref: Delft.js:L89-101
  const lcb = (0.5 + hull.lcbPct) * hull.lwlM;
  const lcf = (0.5 + hull.lcfPct) * hull.lwlM;
  const lcbLwl = lcb / hull.lwlM;
  const delC13 = Math.cbrt(hull.delCM3);
  const delC23 = delC13 * delC13;
  const delC13Lwl = delC13 / hull.lwlM;

  let val = coefs[0];
  val +=
    (coefs[1] * lcbLwl +
      coefs[2] * hull.cp +
      (coefs[3] * delC23) / hull.awM2 +
      (coefs[4] * hull.bwlM) / hull.lwlM) *
    delC13Lwl;
  val +=
    ((coefs[5] * delC23) / hull.swcM2 +
      (coefs[6] * lcb) / lcf +
      coefs[7] * lcbLwl * lcbLwl +
      coefs[8] * hull.cp * hull.cp) *
    delC13Lwl;

  const rrcNorm = val > 0 ? val : 0;
  let rr = rrcNorm * hull.delCM3 * DELFT_WATER_DENSITY * DELFT_GRAVITY;

  if (!clampFroudeAtBounds) {
    if (fnRaw < 0.1) {
      const ratio = fnRaw / 0.1;
      rr *= ratio * ratio;
    } else if (fnRaw > 0.6) {
      const ratio = fnRaw / 0.6;
      rr *= ratio * ratio;
    }
  }
  return rr;
}

/**
 * Port of bythelee LBSailSim.Delft.calcWettedSurfaceHeelCorrection
 * (Delft.js:L128-152).
 */
export function byTheLeeDelftWettedSurfaceHeelCorrection(
  hull: DelftHullParams,
  heelDeg: number,
  smoothBelowFiveDeg = false,
): number {
  const absDeg = Math.min(Math.abs(heelDeg), 45);
  const evalAt = (deg: number) => {
    const coefs = WETTED_HEEL_SPLINES.map((sp) => sp.interpolate(deg));
    const bwlTc = hull.bwlM / hull.tcM;
    return 1 + 0.01 * (coefs[0] + coefs[1] * bwlTc + coefs[2] * bwlTc * bwlTc + coefs[3] * hull.cm);
  };

  if (smoothBelowFiveDeg && absDeg < 5) {
    const c5 = evalAt(5);
    return 1 + (c5 - 1) * (absDeg / 5);
  }
  return evalAt(absDeg);
}

/**
 * Port of bythelee LBSailSim.Hull.calcFrictionalDrag ITTC-57 + roughness spline
 * (Hull.js:L221-242, Water.js:L84-86).
 * Note: Fixes bythelee Hull.js:L185 typo (`0.5 * rho * V` -> `0.5 * rho * V^2`)
 * per Larsson p. 66 and Hull.js:L156 JSDoc ("1/2 * rho * V^2").
 */
export function calcITTC57FrictionCoeff(
  waterSpeedMs: number,
  lwlM: number,
  roughnessK: number,
): { re: number; cf: number } {
  const absV = Math.abs(waterSpeedMs);
  if (absV < 1e-4) return { re: 0, cf: 0 };

  // ref: Hull.js:L227 & Water.js:L85: Re = V * (0.7 * lwl) / kViscosity
  const re = Math.max(1e4, (absV * (lwlM * 0.7)) / DELFT_KINEMATIC_VISCOSITY);
  const den = Math.log10(re) - 2;
  let cf = den > 0.2 ? 0.075 / (den * den) : 0.012;

  // ref: Hull.js:L231-237
  const permissibleRoughness = 100e-6 / absV;
  if (roughnessK > permissibleRoughness) {
    const roughnessRatio = clamp(lwlM / Math.max(1e-7, roughnessK), 3e3, 3e5);
    cf = Math.max(cf, CF_VS_ROUGHNESS_SPLINE.interpolate(roughnessRatio));
  }

  return { re, cf };
}

export interface HullResistanceResult {
  frictionalDragN: number;
  residuaryDragN: number;
  appendageDragN: number;
  totalDragN: number;
  froudeNumber: number;
  reynoldsNumber: number;
  cf: number;
  swcHeeledM2: number;
  delftInRange: boolean;
  delftCorrectionFactor: number;
}

/**
 * Full hull hydrodynamic drag combining ITTC-57 skin friction + Delft residuary wave-making
 * resistance + wetted-surface heel correction + appendage/keel drag + optional hull fouling/cfg scale.
 */
export function evaluateHullResistance(
  boatId: BoatId | string,
  baseHull: DelftHullParams,
  waterSpeedMs: number,
  heelDeg: number,
  keelType: 'fin' | 'long' | 'skeg',
  lengthScale = 1.0,
  wettedScale = 1.0,
  foulingDragMult = 1.0,
  emitRangeWarning = true,
): HullResistanceResult {
  const lScale = clamp(lengthScale, HYDRO_TUNING.hullSpeedLengthRefRatioMin, HYDRO_TUNING.hullSpeedLengthRefRatioMax);
  const wScale = clamp(wettedScale, 0.4, 2.0);
  const hull: DelftHullParams =
    lScale === 1.0 && wScale === 1.0
      ? baseHull
      : {
          ...baseHull,
          lwlM: baseHull.lwlM * lScale,
          swcM2: baseHull.swcM2 * wScale,
          awM2: baseHull.awM2 * lScale,
          delCM3: baseHull.delCM3 * lScale,
        };

  const range = validateDelftRange(boatId, hull, keelType, emitRangeWarning);
  const absV = Math.abs(waterSpeedMs);
  if (absV < 1e-4) {
    return {
      frictionalDragN: 0,
      residuaryDragN: 0,
      appendageDragN: 0,
      totalDragN: 0,
      froudeNumber: 0,
      reynoldsNumber: 0,
      cf: 0,
      swcHeeledM2: hull.swcM2,
      delftInRange: range.inRange,
      delftCorrectionFactor: range.correctionFactor,
    };
  }

  const fn = absV / Math.sqrt(hull.lwlM * DELFT_GRAVITY);
  const heelCorr = clamp(byTheLeeDelftWettedSurfaceHeelCorrection(hull, heelDeg, true), 0.75, 1.15);
  const swcHeeledM2 = hull.swcM2 * heelCorr;

  const { re, cf } = calcITTC57FrictionCoeff(absV, hull.lwlM, hull.roughnessK);
  const frictionalDragN = 0.5 * DELFT_WATER_DENSITY * absV * absV * cf * swcHeeledM2 * foulingDragMult;

  const rawResiduaryN = byTheLeeDelftResiduaryResistanceN(hull, absV, false);
  const residuaryDragN = rawResiduaryN * range.correctionFactor;

  const appendageFrac =
    keelType === 'long'
      ? HYDRO_TUNING.delftFinKeelAppendageDragFrac * HYDRO_TUNING.delftLongKeelAppendageDragMult
      : HYDRO_TUNING.delftFinKeelAppendageDragFrac;
  const appendageDragN = frictionalDragN * appendageFrac;

  const totalDragN = frictionalDragN + residuaryDragN + appendageDragN;

  return {
    frictionalDragN,
    residuaryDragN,
    appendageDragN,
    totalDragN,
    froudeNumber: fn,
    reynoldsNumber: re,
    cf,
    swcHeeledM2,
    delftInRange: range.inRange,
    delftCorrectionFactor: range.correctionFactor,
  };
}

/**
 * Evaluates a vessel's hydrostatic righting arm GZ(phi) in meters from its
 * per-boat GM_0, peak GZ_max @ maxGzAngleDeg, and Angle of Vanishing Stability (AVS).
 * Uses C1 cubic Hermite from 0..maxGzAngleDeg (exact initial tangent dGZ/dphi = GM_0)
 * and smooth cosine decay from maxGzAngleDeg..AVS (no 3D mesh volume slicing).
 */
export function evalGzRightingArmM(absHeelDeg: number, gz: GzCurveParams): number {
  const deg = Math.max(0, absHeelDeg);
  if (deg <= 1e-6) return 0;

  if (deg <= gz.maxGzAngleDeg) {
    const u = deg / Math.max(1, gz.maxGzAngleDeg);
    const m0 = gz.gm0M * ((gz.maxGzAngleDeg * Math.PI) / 180);
    const h10 = u * u * u - 2 * u * u + u;
    const h01 = -2 * u * u * u + 3 * u * u;
    return h10 * m0 + h01 * gz.gzMaxM;
  }

  if (deg <= gz.vanishingStabilityDeg) {
    const w = (deg - gz.maxGzAngleDeg) / Math.max(1, gz.vanishingStabilityDeg - gz.maxGzAngleDeg);
    return 0.5 * (1 + Math.cos(Math.PI * w)) * gz.gzMaxM;
  }

  const pastAvs = Math.min(45, deg - gz.vanishingStabilityDeg);
  return -0.25 * gz.gzMaxM * Math.sin((pastAvs / 45) * Math.PI * 0.5);
}

/**
 * Signed hydrodynamic/hydrostatic righting moment (N·m):
 * positive when heeled starboard (+heelDeg) to restore toward upright (0°).
 */
export function computeGzRightingMomentNm(
  massKg: number,
  signedHeelDeg: number,
  gz: GzCurveParams,
  stabilityScale = 1.0,
): number {
  if (Math.abs(signedHeelDeg) <= 1e-6) return 0;
  const gzArm = evalGzRightingArmM(Math.abs(signedHeelDeg), gz);
  return Math.sign(signedHeelDeg) * massKg * DELFT_GRAVITY * gzArm * stabilityScale;
}

/**
 * Wave slamming resistance (head/close-hauled seas) & quartering wave-surfing push ("guess" model).
 * Isolated cleanly from Delft/ITTC-57 calm-water hull physics; active only when enabled = true.
 */
export function computeWaveSlamAndSurfForces(
  massKg: number,
  absAwaDeg: number,
  waveHeightM: number,
  waveCyclePhase: number,
  enabled: boolean,
): { waveSlamDragN: number; waveSurfPushN: number } {
  if (!enabled) {
    return { waveSlamDragN: 0, waveSurfPushN: 0 };
  }

  const waveSlamDragN =
    absAwaDeg < HYDRO_TUNING.waveSlamMaxAwaDeg && waveHeightM > HYDRO_TUNING.waveSlamMinWaveM
      ? massKg *
        HYDRO_TUNING.waveSlamMassCoeff *
        Math.max(0, waveHeightM - HYDRO_TUNING.waveSlamOffsetWaveM) *
        (1 - absAwaDeg / HYDRO_TUNING.waveSlamMaxAwaDeg)
      : 0;

  const surfCycle = clamp(
    HYDRO_TUNING.waveSurfPhaseFloor +
      (1 - HYDRO_TUNING.waveSurfPhaseFloor) * Math.sin(waveCyclePhase),
    0,
    1,
  );
  const waveSurfPushN =
    absAwaDeg > HYDRO_TUNING.waveSurfMinAwaDeg && waveHeightM > HYDRO_TUNING.waveSurfMinWaveM
      ? massKg *
        HYDRO_TUNING.waveSurfMassCoeff *
        Math.max(0, waveHeightM - HYDRO_TUNING.waveSurfOffsetWaveM) *
        surfCycle *
        ((absAwaDeg - HYDRO_TUNING.waveSurfMinAwaDeg) / (180 - HYDRO_TUNING.waveSurfMinAwaDeg))
      : 0;

  return { waveSlamDragN, waveSurfPushN };
}



import type { BoatSpec, BoatWearState, ReefLevel, ReefPointSpec } from '../types/sailing';

/**
 * Tuning constants NOT directly present in the open-source references
 * (bythelee, tiller, tides-of-fortune, ship-happens).
 * Every parameter in this file is explicitly marked "guess" per project provenance rules.
 */

export const SAIL_TUNING = {
  // guess: per-sail aspect ratios, sheet envelopes & chord proportions beyond Tubby's mainsail in bythelee/boats.json
  main: {
    chordLengthFrac: 0.42, // guess: representative main chord as fraction of boatLengthM
  },
  jib: {
    aspectRatio: 3.8, // guess: higher-aspect genoa/jib foil vs mainsail AR=3
    sheetAngleMinDeg: 8, // guess: minimum jib sheeting angle off centerline (close-hauled)
    sheetAngleMaxDeg: 68, // guess: maximum jib eased angle off centerline (downwind)
    chordLengthFrac: 0.34, // guess: representative jib chord as fraction of boatLengthM
  },
  staysail: {
    aspectRatio: 3.2, // guess: low-cut heavy-weather cutter staysail AR
    sheetAngleMinDeg: 10, // guess: minimum staysail sheeting angle off centerline
    sheetAngleMaxDeg: 62, // guess: maximum staysail eased angle off centerline
    chordLengthFrac: 0.24, // guess: representative staysail chord as fraction of boatLengthM
  },
  // guess: Arcade realism assist tuning (auto-trim blend & head-to-wind escape thrust)
  arcadeAutoTrimBlend: 0.70,
  arcadeMinForwardCoeff: 0.22,
  arcadeInIronsDriveCoeff: 0.24,
  // guess: threshold for by-the-lee warning before TILLER_GYBE_ZONE (170°)
  byTheLeeWarnMinDeg: 150,
} as const;

/**
 * Deterministic geometric reefing helper: returns area fractions & Center-of-Effort
 * heights directly from the vessel's reef-point geometry in boats.ts.
 * Scales CE heights proportionally only when the player has customized vesselCfg.stabilitySails.
 */
export function getBoatReefGeometry(
  spec: BoatSpec,
  reefLevel: ReefLevel,
  stabilitySailsOverride?: number,
): ReefPointSpec {
  const idx: ReefLevel = reefLevel === 2 ? 2 : reefLevel === 1 ? 1 : 0;
  const pt = spec.reefPoints[idx];
  const baseSailsArm = Math.max(0.1, spec.defaultCfg.stabilitySails);
  const armScale =
    stabilitySailsOverride !== undefined
      ? Math.max(0.4, Math.min(2.0, stabilitySailsOverride / baseSailsArm))
      : 1.0;

  return {
    mainAreaFrac: pt.mainAreaFrac,
    mainCeHeightM: pt.mainCeHeightM * armScale,
    jibAreaFrac: pt.jibAreaFrac,
    jibCeHeightM: pt.jibCeHeightM * armScale,
    staysailAreaFrac: pt.staysailAreaFrac,
    staysailCeHeightM: pt.staysailCeHeightM * armScale,
  };
}

/**
 * Wear mechanics adapted from tides-of-fortune/src/ships/ship.js:L158-159 (hullF / rigF pattern)
 * with Meridian Passage aerodynamic & rigging-failure values (marked "guess"):
 *  - Sail wear applies a multiplier on Cl and additive extra parasitic Cd (does NOT shrink physical m² area).
 *  - Hull wear computes hullF and scales hydrodynamic resistance via 1 / hullF.
 *  - Rigging wear computes rigF and increases storm fatigue & failure probability (does NOT shrink sail m²).
 */
export const WEAR_TUNING = {
  hullPenaltyCoeff: 0.28, // guess: hullF = 1 - 0.28 * (1 - hull/100) -> [0.72..1.0], dragMult = 1/hullF ([1.0..1.39x])
  sailClPenaltyCoeff: 0.36, // guess: sailClF = 1 - 0.36 * (1 - mainsail/100) -> Cl multiplier [0.64..1.0]
  sailExtraCdMax: 0.16, // guess: extraCd = 0.16 * (1 - mainsail/100) additive parasitic drag on blown-out sails
  rigFloorFactor: 0.25, // guess: rigF = 0.25 + 0.75 * (rigging/100) integrity factor [0.25..1.0]
  rigFatigueAmplification: 1.25, // guess: storm wear rate boost factor 1 + 1.25 * (1 - rigF) when rigging is fatigued
  rigCriticalPartingPct: 12, // guess: standing rigging health (%) at or below which rigging parts unconditionally
  rigFailureRiskExponent: 2.2, // guess: nonlinear failure chance escalation as (1 - rigF) increases
  rigFailureBaseRatePerHr: 0.42, // guess: hourly rigging failure chance coefficient under gale/overpower stress
} as const;

export interface WearPhysicsFactors {
  hullF: number; // tides-of-fortune hullF pattern in [0.72..1.0]
  hullDragMult: number; // 1 / hullF applied to ITTC-57 hull resistance
  sailClMult: number; // Cl multiplier in [0.64..1.0]
  sailExtraCd: number; // additive parasitic Cd in [0..0.16]
  rigF: number; // tides-of-fortune rigF pattern in [0.25..1.0]
  riggingFatigueMult: number; // multiplier on rigging degradation in heavy weather
}

export function evaluateWearFactors(wear: Pick<BoatWearState, 'hull' | 'mainsail' | 'rigging'>): WearPhysicsFactors {
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  const hullNorm = clamp01(wear.hull / 100);
  const sailNorm = clamp01(wear.mainsail / 100);
  const rigNorm = clamp01(wear.rigging / 100);

  const hullF = 1 - WEAR_TUNING.hullPenaltyCoeff * (1 - hullNorm);
  const sailClMult = 1 - WEAR_TUNING.sailClPenaltyCoeff * (1 - sailNorm);
  const sailExtraCd = WEAR_TUNING.sailExtraCdMax * (1 - sailNorm);
  const rigF = WEAR_TUNING.rigFloorFactor + (1 - WEAR_TUNING.rigFloorFactor) * rigNorm;

  return {
    hullF,
    hullDragMult: 1 / Math.max(0.5, hullF),
    sailClMult,
    sailExtraCd,
    rigF,
    riggingFatigueMult: 1 + WEAR_TUNING.rigFatigueAmplification * (1 - rigF),
  };
}

/**
 * Computes hourly standing-rigging parting probability [0..1] from rigF and storm/gybe load.
 */
export function computeRiggingFailureChance(
  riggingPct: number,
  trueWindSpeedKts: number,
  isOverpowered: boolean,
  accidentalGybeSlam: boolean,
): number {
  if (riggingPct <= WEAR_TUNING.rigCriticalPartingPct) return 1.0;
  const rigNorm = Math.max(0, Math.min(1, riggingPct / 100));
  const rigF = WEAR_TUNING.rigFloorFactor + (1 - WEAR_TUNING.rigFloorFactor) * rigNorm;
  const defect = Math.max(0, Math.min(1, 1 - rigF));
  const windLoad = Math.pow(Math.max(0, trueWindSpeedKts) / 25, 2) * (isOverpowered ? 1.8 : 1.0);
  const gybeShock = accidentalGybeSlam ? 1.6 : 0;
  const totalLoad = Math.max(0.12, windLoad + gybeShock);
  return Math.max(
    0,
    Math.min(1, Math.pow(defect, WEAR_TUNING.rigFailureRiskExponent) * WEAR_TUNING.rigFailureBaseRatePerHr * totalLoad),
  );
}

export const HYDRO_TUNING = {
  waterRhoKgM3: 1025, // ref: bythelee/Water.js:L35 (standard seawater density)
  delftOutOfRangeResiduaryMult: 1.14, // guess: residuary correction when hull falls outside Delft DSYHS fin-keel bounds (e.g. Rustler 36 long-keel)
  delftLongKeelAppendageDragMult: 1.22, // guess: additional wetted appendage/keel-skeg form drag multiplier for long/full-keel cruisers
  delftFinKeelAppendageDragFrac: 0.14, // guess: appendage (keel+rudder) frictional+form drag fraction atop canoe-body ITTC-57
  hullDragCd: 0.028, // guess: legacy fallback [wing_sur] coefficient
  hullSpeedLengthRefRatioMin: 0.75, // guess: boatLengthM ratio clamp min
  hullSpeedLengthRefRatioMax: 1.35, // guess: boatLengthM ratio clamp max
  hullSpeedWallStartFrac: 0.78, // guess: legacy wave-making wall onset fraction
  hullSpeedWallSpanFrac: 0.42, // guess: legacy wave-making wall span fraction
  hullSpeedWallGainFrac: 0.36, // guess: legacy wave-making asymptotic excess gain
  maxTargetHullSpeedMult: 1.18, // guess: upper clamp on steady-state target speed vs hullSpeedKts
  keelLiftSlope: 4.6, // guess: keel hydrodynamic lift slope for leeway estimation
  leewayMaxDeg: 12, // guess: max steady-state leeway estimate (deg)
  leewayCutoffAwaDeg: 120, // guess: negligible leeway when running downwind
  gravityMs2: 9.81, // ref: bythelee/SailEnv.js:L65 (gravitational acceleration)
  rightingMomentScale: 0.72, // guess: legacy linear-sin fallback scale
  heelingMomentArmScale: 0.56, // guess: lateral force to roll lever calibration against GZ curve
  heelAerodynamicCosExp: 1.2, // guess: cos(heel)^k aerodynamic heeling reduction with heel angle
  overpowerDragSlope: 0.022, // guess: heel-induced drag penalty slope past maxSafeHeelDeg
  overpowerDragMin: 0.58, // guess: floor on overpower speed multiplier
  waveSlamMinWaveM: 1.0, // guess: significant wave height onset for bow slamming
  waveSlamOffsetWaveM: 0.9, // guess: effective wave threshold offset for slamming ramp
  waveSlamMaxAwaDeg: 68, // guess: upwind AWA cone affected by wave slamming
  waveSlamMassCoeff: 0.052, // guess: slamming drag force per kg*(waveH-0.9)
  waveSurfMinWaveM: 1.25, // guess: wave height onset for downwind quartering surf boost
  waveSurfOffsetWaveM: 1.1, // guess: effective wave threshold offset for surfing ramp
  waveSurfMinAwaDeg: 122, // guess: downwind AWA onset for wave surfing
  waveSurfMassCoeff: 0.048, // guess: surfing push force per kg*(waveH-1.1)
  waveSurfPhaseFloor: 0.45, // guess: baseline crest-cycle weight [0.45..1.0] for wave surfing
  wavePitchFreqMult: 1.4, // guess: pitch encounter frequency multiplier on waveCyclePhase
  wavePitchBaseDeg: 1.2, // guess: baseline swell pitch amplitude (deg)
  wavePitchPerMeterDeg: 1.6, // guess: additional pitch amplitude per meter significant wave height (deg/m)
} as const;

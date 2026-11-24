import type {
  ManeuverState,
  PointOfSail,
  ReefLevel,
  SimulationState,
  TackSide,
} from '../types/sailing';
import { BOAT_SPECS } from './boats';

const AIR_RHO = 1.225; // kg/m^3
const WATER_RHO = 1025; // kg/m^3
const KTS_TO_MS = 0.514444;
const MS_TO_KTS = 1 / KTS_TO_MS;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * By The Lee-inspired thin airfoil / cambered sail lift & drag polars across 0..180° AoA.
 * Laminar attached flow peaks near AoA ~18-24° (CL ~1.38), stalls smoothly past 28°,
 * and transitions to flat-plate drag (CD ~1.25) when running square downwind.
 */
export function evaluateFoilCoefficients(signedAoADeg: number): {
  cl: number;
  cd: number;
} {
  const absAoa = clamp(Math.abs(signedAoADeg), 0, 180);
  const sign = signedAoADeg >= 0 ? 1 : -1;

  let clMag = 0;
  let cd = 0.04;

  if (absAoa <= 22) {
    // Attached lifting regime
    const t = absAoa / 22;
    clMag = 1.38 * Math.sin(t * (Math.PI / 2));
    cd = 0.035 + 0.24 * t * t;
  } else if (absAoa <= 48) {
    // Post-stall transition
    const t = (absAoa - 22) / 26;
    clMag = lerp(1.38, 0.86, t);
    cd = lerp(0.275, 0.85, t);
  } else if (absAoa <= 90) {
    // Bluff-body separated flow
    const t = (absAoa - 48) / 42;
    clMag = lerp(0.86, 0.14, t);
    cd = lerp(0.85, 1.24, t);
  } else {
    // Backwinded / deep run beyond 90°
    const t = (absAoa - 90) / 90;
    clMag = -0.35 * Math.sin(t * Math.PI);
    cd = lerp(1.24, 1.05, t);
  }

  return { cl: sign * clMag, cd };
}

export function classifyPointOfSail(absAwaDeg: number, noGoDeg: number): PointOfSail {
  if (absAwaDeg < noGoDeg) return 'In Irons';
  if (absAwaDeg < 60) return 'Close-Hauled';
  if (absAwaDeg < 82) return 'Close Reach';
  if (absAwaDeg < 115) return 'Beam Reach';
  if (absAwaDeg < 155) return 'Broad Reach';
  return 'Running';
}

export function getOptimalSheetPct(absAwaDeg: number): number {
  const clamped = clamp(absAwaDeg, 35, 180);
  const t = (clamped - 35) / (180 - 35);
  return Math.round(lerp(94, 12, t));
}

export function getReefAreaFactor(reef: ReefLevel): number {
  if (reef === 0) return 1.0;
  if (reef === 1) return 0.72;
  return 0.46;
}

export interface FoilForceOutput {
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
 * Combines:
 *  - By The Lee: 3D aerodynamic sail foil lift/drag + hydrodynamic keel lateral resistance
 *  - Tiller (docs/sailing-spec.md): No-go zone, tacking vs. gybing & accidental "by the lee" boom slam
 *  - Virtual Sailor NG: boat.cfg / [wing_sur] drag surface & stability parameters
 */
export function solveFoilAndManeuver(
  state: SimulationState,
  apparentWindAngleDeg: number,
  apparentWindSpeedKts: number,
): FoilForceOutput {
  const spec = BOAT_SPECS[state.boatId];
  const cfg = state.vesselCfg ?? spec.defaultCfg;
  const realism = state.simRealism; // 0 = Arcade, 1 = Full Sim

  const absAwa = Math.abs(apparentWindAngleDeg);
  const effectiveNoGo = lerp(18, spec.noGoAngleDeg, realism);
  const pointOfSail = classifyPointOfSail(absAwa, effectiveNoGo);

  // Wind side: AWA < 0 => wind over PORT (-1); AWA > 0 => wind over STARBOARD (+1)
  const windSide: -1 | 1 = apparentWindAngleDeg >= 0 ? 1 : -1;
  const tackSide: TackSide = windSide === 1 ? 'starboard' : 'port';

  // Tiller Tack / Gybe / By-the-Lee state machine
  // Normally boom rests on LEEWARD side: -windSide (-1 port, +1 starboard)
  const desiredBoomSide: -1 | 1 = windSide === 1 ? -1 : 1;
  let boomSide: -1 | 1 = state.boomSide ?? desiredBoomSide;
  let maneuverState: ManeuverState = 'sailing';
  let accidentalGybeSlam = false;

  if (absAwa < effectiveNoGo) {
    maneuverState = 'in-irons';
    boomSide = desiredBoomSide;
  } else if (boomSide !== desiredBoomSide) {
    // Wind crossed the centerline!
    if (absAwa < 105) {
      // Bow passed through the wind -> clean tack
      maneuverState = 'tacking';
      boomSide = desiredBoomSide;
    } else {
      // Stern passed through the wind -> sailing BY THE LEE before boom slams across!
      const sheetEased = state.mainsheetPct < 38;
      // If sailing by the lee past ~162° (or wind pushes >8° behind boom side)
      if (absAwa < 164 || realism < 0.25) {
        maneuverState = 'gybing';
        boomSide = desiredBoomSide;
        if (!sheetEased && apparentWindSpeedKts > 11 && realism > 0.35) {
          accidentalGybeSlam = true;
        }
      } else {
        maneuverState = 'by-the-lee';
      }
    }
  }

  // Boom swing angle (signed: negative = boom out to port, positive = boom out to starboard)
  // Mainsheet 100% => boom ~6° off centerline; 5% => boom ~78° out
  const boomMagnitudeDeg = lerp(78, 6, clamp(state.mainsheetPct, 5, 100) / 100);
  const boomAngleDeg = boomSide * boomMagnitudeDeg;

  // Angle of attack between apparent wind inflow vector and mainsail chord
  const rawAngleToBoom = Math.abs(apparentWindAngleDeg) - boomMagnitudeDeg;
  const effectiveAoADeg =
    maneuverState === 'by-the-lee'
      ? -clamp(180 - absAwa + 6, 4, 35) // backwinded leeward pressure!
      : clamp(absAwa - boomMagnitudeDeg * 0.85, 0, 120);

  const { cl, cd } = evaluateFoilCoefficients(effectiveAoADeg);

  const awsMs = apparentWindSpeedKts * KTS_TO_MS;
  const reefFactor = getReefAreaFactor(state.reefLevel);
  const sailHealth = lerp(0.55, 1.0, state.wear.mainsail / 100);
  const mainArea = cfg.sailAreaM2 * reefFactor * sailHealth;
  // Reefing mainsail in heavy air also implies tucking jib area slightly when reef 2 is set
  const jibReefScale = state.reefLevel === 2 ? 0.65 : state.reefLevel === 1 ? 0.85 : 1.0;
  const jibArea = state.jibDeployed ? cfg.jibAreaM2 * jibReefScale * sailHealth : 0;

  // Dynamic air pressure q = 0.5 * rho * V^2
  const qAir = 0.5 * AIR_RHO * awsMs * awsMs;

  // Jib trim modifier (arcade forgives mismatch; sim rewards accurate jib trim)
  const optTrim = getOptimalSheetPct(absAwa);
  const jibErr = Math.abs(state.jibsheetPct - optTrim);
  const jibTrimEfficiency = state.jibDeployed
    ? clamp(1 - (jibErr / 95) * lerp(0.25, 1.0, realism), 0.38, 1.0)
    : 0;
  const effectiveSailArea = mainArea + jibArea * (0.72 + 0.28 * jibTrimEfficiency);

  const sailLiftN = qAir * effectiveSailArea * cl;
  const sailDragN = qAir * effectiveSailArea * cd;

  // Project Lift (perpendicular to AWA) & Drag (along AWA) onto Boat Axes
  const awaRad = degToRad(absAwa);
  let fDriveN = sailLiftN * Math.sin(awaRad) - sailDragN * Math.cos(awaRad);
  const fLatN = Math.abs(sailLiftN * Math.cos(awaRad) + sailDragN * Math.sin(awaRad));

  // In-irons & Arcade assist: Arcade grants gentle ghosting headway even pinched close to wind
  if (absAwa < effectiveNoGo) {
    fDriveN = lerp(qAir * mainArea * 0.24, 0, realism);
  } else {
    if (realism < 0.5) {
      fDriveN = Math.max(fDriveN, qAir * mainArea * 0.22 * (1 - realism * 2));
    }
    if (maneuverState === 'by-the-lee') {
      fDriveN *= 0.62;
    }
  }

  // Hydrodynamic hull drag balance (Virtual Sailor NG [wing_sur] + wave-making hull speed wall)
  const hullFouling = lerp(1.38, 1.0, state.wear.hull / 100);
  const hullSpeedMs =
    spec.hullSpeedKts *
    Math.sqrt(clamp(cfg.boatLengthM / spec.deckLengthM, 0.75, 1.35)) *
    KTS_TO_MS;
  const dragAreaCoeff = 0.5 * WATER_RHO * cfg.wingSurDragM2 * 0.028 * hullFouling;

  // Solve steady-state equilibrium target speed where F_drive == F_hydroDrag
  const positiveDrive = Math.max(0, fDriveN);
  let targetSpeedMs = Math.sqrt(positiveDrive / Math.max(1, dragAreaCoeff));
  if (targetSpeedMs > hullSpeedMs * 0.78) {
    const excess = targetSpeedMs - hullSpeedMs * 0.78;
    targetSpeedMs = hullSpeedMs * 0.78 + Math.tanh(excess / (hullSpeedMs * 0.42)) * (hullSpeedMs * 0.36);
  }
  const rawTargetKts = clamp(targetSpeedMs * MS_TO_KTS, 0, spec.hullSpeedKts * 1.16);

  // Keel Hydrodynamic Lateral Resistance -> Leeway Angle
  const effWaterSpeedMs = Math.max(1.2, targetSpeedMs);
  const qWater = 0.5 * WATER_RHO * effWaterSpeedMs * effWaterSpeedMs;
  const keelLiftSlope = 4.6;
  const leewayRad = clamp(
    fLatN / Math.max(80, qWater * cfg.keelAreaM2 * keelLiftSlope),
    0,
    degToRad(10),
  );
  const leewayDeg =
    absAwa < 118 && rawTargetKts > 0.3
      ? Math.sign(apparentWindAngleDeg || 1) *
        Number(((leewayRad * 180) / Math.PI * lerp(0.25, 1.0, realism)).toFixed(1))
      : 0;

  // Slab reefing lowers Center of Effort height in addition to reducing sail area!
  const ceHeightArm = cfg.stabilitySails * lerp(0.68, 1.0, reefFactor);
  const rightingTorque = cfg.massKg * 9.81 * cfg.stabilityBody * 0.72;
  const rawHeelRad = Math.atan2(fLatN * ceHeightArm * 0.38, Math.max(500, rightingTorque));
  const rawHeelDeg = (rawHeelRad * 180) / Math.PI;
  const heelScale = lerp(0.55, 1.12, realism);
  const signedHeelDeg =
    Math.sign(apparentWindAngleDeg || 1) * clamp(rawHeelDeg * heelScale, 0, 48);

  const isOverpowered = Math.abs(signedHeelDeg) > spec.maxSafeHeelDeg;
  const overpowerDrag = isOverpowered
    ? clamp(1 - (Math.abs(signedHeelDeg) - spec.maxSafeHeelDeg) * 0.022, 0.58, 1.0)
    : 1.0;

  const isLuffing =
    absAwa < effectiveNoGo ||
    (rawAngleToBoom < 3 && apparentWindSpeedKts > 5) ||
    (state.mainsheetPct < optTrim - 28 && apparentWindSpeedKts > 5);

  // Normalized foil efficiency readout (0..1)
  const trimMatch = clamp(1 - Math.abs(state.mainsheetPct - optTrim) / 80, 0.25, 1.0);
  const sailEfficiency = Number(
    clamp((Math.abs(cl) * 0.55 + cd * 0.25) * trimMatch, 0, 1).toFixed(2),
  );

  return {
    targetSpeedKts: Number((rawTargetKts * overpowerDrag).toFixed(2)),
    targetHeelDeg: Number(signedHeelDeg.toFixed(1)),
    leewayDeg,
    sailEfficiency,
    isLuffing,
    isOverpowered,
    pointOfSail,
    tackSide,
    boomSide,
    boomAngleDeg: Number(boomAngleDeg.toFixed(1)),
    maneuverState,
    angleOfAttackDeg: Number(effectiveAoADeg.toFixed(1)),
    sailLiftN: Math.round(sailLiftN),
    sailDragN: Math.round(sailDragN),
    accidentalGybeSlam,
  };
}

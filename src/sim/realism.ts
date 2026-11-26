import type { RealismPreset, RealismSwitchProfile } from '../types/sailing';

/**
 * Maps the continuous 0..1 Physics Mode slider to discrete, documented simulation switches
 * across three clearly communicated tiers:
 *  - Arcade (0%–33%): Narrow no-go zone, auto trim assist, ghost headway in irons, no gybe damage, damped heel
 *  - Cruising (34%–79%): Realistic tack/gybe discipline, leeway & wave effects, forgiving heel cap
 *  - Full Simulation (80%–100%): Vessel-exact no-go angles, unassisted trim, full leeway, wave slam/surf & wear
 */
export function getRealismProfile(simRealism: number, boatNoGoDeg: number): RealismSwitchProfile {
  const clamped = Math.max(0, Math.min(1, simRealism));

  let preset: RealismPreset = 'cruising';
  let label = 'Cruising';
  if (clamped < 0.34) {
    preset = 'arcade';
    label = 'Arcade';
  } else if (clamped >= 0.8) {
    preset = 'simulation';
    label = 'Full Sim';
  }

  if (preset === 'arcade') {
    return {
      preset,
      label,
      noGoDeg: 18,
      autoTrimAssist: true,
      inIronsGhostDrive: true,
      accidentalGybeDamage: false,
      waveSlamAndSurf: false,
      forgivingHeelCapDeg: 26,
      wearRateScale: 0.25,
      leewayScale: 0.25,
    };
  }

  if (preset === 'cruising') {
    return {
      preset,
      label,
      noGoDeg: Math.round(boatNoGoDeg * 0.82),
      autoTrimAssist: false,
      inIronsGhostDrive: false,
      accidentalGybeDamage: true,
      waveSlamAndSurf: true,
      forgivingHeelCapDeg: 38,
      wearRateScale: 0.65,
      leewayScale: 0.72,
    };
  }

  return {
    preset,
    label,
    noGoDeg: boatNoGoDeg,
    autoTrimAssist: false,
    inIronsGhostDrive: false,
    accidentalGybeDamage: true,
    waveSlamAndSurf: true,
    forgivingHeelCapDeg: 90,
    wearRateScale: 1.0,
    leewayScale: 1.0,
  };
}

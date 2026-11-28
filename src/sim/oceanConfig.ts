import * as THREE from 'three';
import type { WeatherState } from '../types/sailing';

export type OceanQualityPreference = 'auto' | 'standard' | 'ultra';
export type ActiveOceanTier = 'standard' | 'ultra';

export interface OceanFrameStats {
  avgFrameMs: number;
  fps: number;
  activeTier: ActiveOceanTier;
  preference: OceanQualityPreference;
  benchmarkComplete: boolean;
  benchmarkSampleCount: number;
  webgl2UltraSupported: boolean;
}

export interface SpectralWave {
  dirX: number;
  dirZ: number;
  k: number;
  omega: number; // angular frequency (rad/s): sqrt(g * k)
  amp: number;
  steep: number;
  phase: number;
}

export interface UltraOceanWeatherParams {
  windSpeed: number; // m/s
  windDirection: number; // deg in XZ plane
  waveScale: number;
  swellScale: number;
  swellWindSpeed: number; // m/s
  swellDirection: number; // deg in XZ plane
  choppiness: number;
  shoalMix: number;
  squallMix: number;
}

export const N_SPECTRAL_WAVES = 24;
export const SPECTRAL_WIND_ANGLE = 0.28;
export const SPECTRAL_WIND_SPEED = 10.5;
export const SPECTRAL_TARGET_SIGMA = 0.72;
export const SPECTRAL_REF_HEIGHT = SPECTRAL_TARGET_SIGMA * 2.0;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic 24-component Phillips wind-wave Gerstner spectrum.
 * Ported from drift/js/waves.js (MIT License, Copyright 2026 Christian Pasín Rey)
 * with deep-water gravity-wave dispersion omega = sqrt(g * k).
 */
export function buildSpectralWaves(): {
  waves: SpectralWave[];
  uniformA: THREE.Vector4[];
  uniformB: THREE.Vector4[];
} {
  const rng = mulberry32(20260609);
  const g = 9.81;
  const Lw = (SPECTRAL_WIND_SPEED * SPECTRAL_WIND_SPEED) / g;
  const Lmin = 5.5;
  const Lmax = 115.0;
  let sigma2 = 0;

  const waves: SpectralWave[] = [];
  const uniformA: THREE.Vector4[] = [];
  const uniformB: THREE.Vector4[] = [];

  for (let i = 0; i < N_SPECTRAL_WAVES; i++) {
    const f = (i + rng()) / N_SPECTRAL_WAVES;
    const L = Lmin * Math.pow(Lmax / Lmin, f);
    const k = (Math.PI * 2) / L;
    // Narrower aligned long swell, wider short wind chop
    const spread = 0.32 + 1.15 * f;
    const ang = SPECTRAL_WIND_ANGLE + (rng() * 2 - 1) * spread;
    const dirX = Math.cos(ang);
    const dirZ = Math.sin(ang);
    const kL = k * Lw;
    const phillips =
      (Math.exp(-1.0 / (kL * kL)) / (k * k)) *
      Math.pow(Math.max(Math.cos(ang - SPECTRAL_WIND_ANGLE), 0.0), 2.0);
    const amp = Math.sqrt(Math.max(phillips, 0)) * (0.5 + 0.5 * rng());
    // Deep-water dispersion relation: omega = sqrt(g * k) [rad/s]
    const omega = Math.sqrt(g * k) * (0.94 + 0.12 * rng());
    const phase = rng() * Math.PI * 2;
    const steep = THREE.MathUtils.clamp(0.28 + 0.54 * f, 0.22, 0.84);
    waves.push({ dirX, dirZ, k, omega, amp, steep, phase });
    sigma2 += amp * amp;
  }

  const norm = SPECTRAL_TARGET_SIGMA / Math.sqrt(Math.max(1e-6, sigma2));
  let steepSum = 0;
  for (const w of waves) {
    w.amp *= norm;
    steepSum += w.k * w.amp * w.steep;
  }
  const steepScale = steepSum > 0.78 ? 0.78 / steepSum : 1.0;
  for (const w of waves) {
    w.steep *= steepScale;
    uniformA.push(new THREE.Vector4(w.dirX, w.dirZ, w.k, w.omega));
    uniformB.push(new THREE.Vector4(w.amp, w.steep, w.phase, 0));
  }

  return { waves, uniformA, uniformB };
}

export const SPECTRAL_FIELD = buildSpectralWaves();

export function sampleSpectralHeight(
  x: number,
  z: number,
  elapsedSec: number,
  waveScale: number,
): number {
  let y = 0;
  const waves = SPECTRAL_FIELD.waves;
  for (let i = 0; i < N_SPECTRAL_WAVES; i++) {
    const w = waves[i];
    const ph = w.k * (w.dirX * x + w.dirZ * z) - w.omega * elapsedSec + w.phase;
    y += w.amp * waveScale * Math.sin(ph);
  }
  return y;
}

export function sampleGerstnerMotion(
  elapsedSec: number,
  offsetX: number,
  offsetZ: number,
  waveHeightM: number,
  headingDeg: number,
  hullHalfLen = 3.2,
): { heaveM: number; pitchRad: number; rollRad: number } {
  const waveScale = THREE.MathUtils.clamp(waveHeightM, 0.25, 3.6) * 0.48;
  const hRad = THREE.MathUtils.degToRad(headingDeg);
  const fwdX = Math.sin(hRad);
  const fwdZ = -Math.cos(hRad);
  const rightX = Math.cos(hRad);
  const rightZ = Math.sin(hRad);

  const halfL = Math.max(2.6, hullHalfLen);
  const halfB = Math.max(1.25, halfL * 0.42);

  // Sample hull footprint points so vessel motion tracks underlying swell calmly without harsh high-frequency jitter
  const hMid = sampleSpectralHeight(offsetX, offsetZ, elapsedSec, waveScale);
  const hBow = sampleSpectralHeight(
    offsetX + fwdX * halfL,
    offsetZ + fwdZ * halfL,
    elapsedSec,
    waveScale,
  );
  const hStern = sampleSpectralHeight(
    offsetX - fwdX * halfL,
    offsetZ - fwdZ * halfL,
    elapsedSec,
    waveScale,
  );
  const hStbd = sampleSpectralHeight(
    offsetX + rightX * halfB,
    offsetZ + rightZ * halfB,
    elapsedSec,
    waveScale,
  );
  const hPort = sampleSpectralHeight(
    offsetX - rightX * halfB,
    offsetZ - rightZ * halfB,
    elapsedSec,
    waveScale,
  );

  const heaveM = hMid * 0.4 + (hBow + hStern + hStbd + hPort) * 0.15;
  const pitchSlope = (hBow - hStern) / (2 * halfL);
  const rollSlope = (hStbd - hPort) / (2 * halfB);

  return {
    heaveM: THREE.MathUtils.clamp(heaveM, -1.35, 1.35),
    pitchRad: THREE.MathUtils.clamp(Math.atan(pitchSlope) * 0.58, -0.15, 0.15),
    rollRad: THREE.MathUtils.clamp(-Math.atan(rollSlope) * 0.46, -0.13, 0.13),
  };
}

/**
 * Maps SimulationState weather & water depth into Ultra Water OceanSim / OceanSurface parameters.
 * Compass wind FROM angle (0 = North/-Z, 90 = East/+X) is converted into XZ wave propagation direction.
 */
export function deriveUltraOceanWeatherParams(
  weather: Pick<WeatherState, 'trueWindSpeedKts' | 'trueWindDirDeg' | 'waveHeightM' | 'cloudCover'>,
  depthM: number,
): UltraOceanWeatherParams {
  const windSpeed = THREE.MathUtils.clamp(weather.trueWindSpeedKts * 0.514444, 1.5, 24.0);
  // Wind blowing FROM trueWindDirDeg travels TOWARD (trueWindDirDeg + 180).
  // In Three.js XZ (North = -Z, East = +X), toward vector is (-sin(dir), cos(dir)),
  // which corresponds to atan2(cos(dir), -sin(dir)) = dir + 90 deg in Ultra Water's (cos, sin) angle frame.
  const windDirection = (weather.trueWindDirDeg + 90) % 360;
  const swellDirection = (windDirection + 18) % 360;

  const waveHeight = THREE.MathUtils.clamp(weather.waveHeightM, 0.25, 4.5);
  const waveScale = THREE.MathUtils.clamp(0.45 + waveHeight * 0.36, 0.38, 1.95);
  const swellScale = THREE.MathUtils.clamp(0.38 + waveHeight * 0.24, 0.35, 1.25);
  const swellWindSpeed = THREE.MathUtils.clamp(4.5 + waveHeight * 1.9, 4.0, 14.5);
  const choppiness = THREE.MathUtils.clamp(0.58 + (waveHeight - 0.5) * 0.14, 0.52, 1.05);
  const shoalMix = THREE.MathUtils.clamp(1 - (depthM - 4) / 36, 0, 1);
  const squallMix = THREE.MathUtils.clamp(weather.cloudCover, 0, 1);

  return {
    windSpeed,
    windDirection,
    waveScale,
    swellScale,
    swellWindSpeed,
    swellDirection,
    choppiness,
    shoalMix,
    squallMix,
  };
}

/**
 * Evaluates frame times from the startup benchmark to pick the best ocean tier.
 * Drops up to 2 outlier spikes (e.g. JIT/compile hiccups) when >= 6 samples exist.
 */
export function evaluateOceanTierFromFrameTimes(
  frameTimesMs: number[],
  webgl2UltraSupported: boolean,
  thresholdMs = 24.0,
): { activeTier: ActiveOceanTier; avgFrameMs: number } {
  if (!webgl2UltraSupported || frameTimesMs.length === 0) {
    return { activeTier: 'standard', avgFrameMs: 0 };
  }
  const sorted = [...frameTimesMs].sort((a, b) => a - b);
  const trimmed = sorted.length >= 6 ? sorted.slice(0, sorted.length - 2) : sorted;
  const avgFrameMs =
    trimmed.reduce((acc, v) => acc + v, 0) / Math.max(1, trimmed.length);
  return {
    activeTier: avgFrameMs <= thresholdMs ? 'ultra' : 'standard',
    avgFrameMs,
  };
}

export function resolveOceanTier(
  preference: OceanQualityPreference,
  autoSelectedTier: ActiveOceanTier,
  webgl2UltraSupported: boolean,
): ActiveOceanTier {
  if (!webgl2UltraSupported) return 'standard';
  if (preference === 'ultra') return 'ultra';
  if (preference === 'standard') return 'standard';
  return autoSelectedTier;
}

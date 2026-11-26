# Tuning Guesses & Validation Plan

Every constant in Meridian Passage that does **not** come verbatim from a cited open-source physics reference (`bythelee`, `tiller`) or published naval architecture specification is marked `"guess"` and tracked here with an explicit validation method.

---

## Previously Implemented Steps (Steps 1 & 2: Foil Forces, Multi-Sail Rig, Tiller State Machine & Visual Sea)

### 1. Sail & Rig Geometry (`src/sim/tuning.ts` — `SAIL_TUNING`)

| Constant | Value | Meaning | How to Validate |
|---|---:|---|---|
| `SAIL_TUNING.main.ceHeightFrac` | `0.96` | Full mainsail Center-of-Effort height as fraction of `cfg.stabilitySails` | Compare geometric triangle centroid `0.38 * luff + boomHeight` against each boat's sailplan drawing and verify steady heel matches ORC/VPP inclination data at 15 kt TWA 90°. |
| `SAIL_TUNING.main.reefCeHeightMinFrac` | `0.68` | Double-reefed mainsail CE height as fraction of `cfg.stabilitySails` | Replaced in Step 3 by per-boat geometric reef-point CE heights computed directly from slab reef height reductions. |
| `SAIL_TUNING.main.reefAreaFactors` | `[1.0, 0.72, 0.46]` | Global slab reef area multipliers `[Reef0, Reef1, Reef2]` | Replaced in Step 3 by per-boat reef-point geometry in `boats.ts`; validate against RYA/cruising mainsail luff & foot geometry (`(luff-drop)*(foot)/2`). |
| `SAIL_TUNING.main.chordLengthFrac` | `0.42` | Representative mainsail mean aerodynamic chord as fraction of `boatLengthM` | Compute `mainArea / P` (sail area divided by luff hoist `P`) from each boat's published `P` and `E` dimensions (`E ≈ 0.48 * P`) and check pitching moment `mz` sensitivity. |
| `SAIL_TUNING.jib.aspectRatio` | `3.8` | Genoa/jib aspect ratio (`b^2 / S`) vs `bythelee` `Tubby` mainsail `AR = 3` | Compute `(luff_jib^2) / jibArea` from published rig dimensions (`I`, `J`, foretriangle `LP%`) for each vessel; compare induced drag `Cl^2 / (π AR)` against close-hauled VMG. |
| `SAIL_TUNING.jib.sheetAngleMinDeg` | `8` | Minimum jib sheeting angle off centerline (close-hauled lead track) | Measure chainplate/genoa-track lead angle on 19–42 ft cruising sloops (typically 7°–11°); verify upwind pointing VMG peaks near 35°–42° AWA. |
| `SAIL_TUNING.jib.sheetAngleMaxDeg` | `68` | Maximum jib eased angle off centerline downwind | Check whisker-poled / eased genoa trim geometry before forestay blanketing; verify broad-reach drive force peaks without premature stall. |
| `SAIL_TUNING.jib.ceHeightFrac` | `0.86` | Jib CE height relative to `cfg.stabilitySails` | Measure foretriangle centroid (`0.38 * I + deckHeight`) relative to mainsail CE on each rig plan. |
| `SAIL_TUNING.jib.reefAreaFactors` | `[1.0, 0.85, 0.65]` | Roller-furling / heavy-weather jib reduction in Reef 1 & 2 | Measure partial roller-reef luff/foot reduction; verify helm weather-helm balance stays neutral in 28–35 kt squalls. |
| `SAIL_TUNING.jib.chordLengthFrac` | `0.34` | Representative jib mean chord as fraction of `boatLengthM` | Derive from `J * LP% * 0.5 / boatLengthM` per boat rig spec. |
| `SAIL_TUNING.staysail.aspectRatio` | `3.2` | Inner cutter staysail aspect ratio | Derive from inner forestay length^2 / staysail area (`Rustler 36`, `Hallberg-Rassy 42`). |
| `SAIL_TUNING.staysail.sheetAngleMinDeg` | `10` | Minimum inner staysail sheeting angle off centerline | Check inner staysail track position inboard of shrouds (9°–12°). |
| `SAIL_TUNING.staysail.sheetAngleMaxDeg` | `62` | Maximum inner staysail eased angle | Verify staysail stalls gracefully before blanketing the main on a broad reach. |
| `SAIL_TUNING.staysail.ceHeightFrac` | `0.58` | Low cutter staysail CE height relative to `cfg.stabilitySails` | Measure inner stay centroid height above deck; check heel reduction when dropping headsail to staysail alone in 30+ kt winds. |
| `SAIL_TUNING.staysail.reefAreaFactors` | `[1.0, 1.0, 0.90]` | Staysail area retained under Reef 1 / Reef 2 | Validate heavy-weather cutter sailplan practice (inner staysail remains full until storm trysail conditions). |
| `SAIL_TUNING.staysail.chordLengthFrac` | `0.24` | Representative staysail chord fraction of `boatLengthM` | Derive from published staysail foot/clew geometry for Rustler 36 and HR 42. |
| `SAIL_TUNING.sailWearMinHealth` | `0.55` | Minimum efficiency multiplier at 0% sail condition | Superseded in Step 3 by `tides-of-fortune` `rigF` Cl multiplier + extra `Cd`; validate blown-out Dacron drag/lift loss against sailmaker camber-stretch data (~30–45% drive loss). |
| `SAIL_TUNING.rigWearMinHealth` | `0.70` | Minimum rigging tension multiplier on sail drive at 0% rig health | Superseded in Step 3 by `rigF` failure-risk curve; validate halyard sag / forestay stretch speed loss in upwind sea trials. |
| `SAIL_TUNING.arcadeAutoTrimBlend` | `0.70` | Arcade tier auto-trim blend toward `tillerOptimalSheet` | Playtest Arcade vs Full Sim with untrained players to verify sheet-trim assist prevents perpetual luffing without bypassing steering. |
| `SAIL_TUNING.arcadeMinForwardCoeff` | `0.22` | Arcade tier minimum forward drive floor outside no-go | Playtest Arcade tack completion in light airs (<6 kt) to ensure boat never stalls dead mid-maneuver. |
| `SAIL_TUNING.arcadeInIronsDriveCoeff` | `0.24` | Arcade tier ghost headway coefficient while in irons | Verify Arcade mode still exits irons smoothly at ~1.2–1.8 kt while Full Sim stalls to `0` (`inIronsGhostDrive = false`). |
| `SAIL_TUNING.byTheLeeWarnMinDeg` | `150` | Minimum `absAwa` for `by-the-lee` warning when boom is on windward side | Verify real downwind sailing safety margin (`150°–170°` AWA before `TILLER_GYBE_ZONE = 170°`). |

### 2. Step 1 & 2 Hydrodynamics & Waves (`src/sim/tuning.ts` — `HYDRO_TUNING`)

| Constant | Value | Meaning | How to Validate |
|---|---:|---|---|
| `HYDRO_TUNING.waterRhoKgM3` | `1025` | Seawater density kg/m³ (matches `bythelee/Water.js:L35`) | Compare against ITTC standard seawater density at 15°C (`1025.9 kg/m³`); exact match to `bythelee/Water.js:L35`. |
| `HYDRO_TUNING.hullDragCd` | `0.028` | Pre-Delft `[wing_sur]` quadratic drag coefficient | Replaced in Step 4 (hull) by Delft residuary + ITTC-57 frictional resistance; retain only for legacy diagnostic fallback checks if needed. |
| `HYDRO_TUNING.hullFoulingMaxMult` | `1.38` | Pre-Delft bottom marine growth drag penalty | Replaced/adapted in Step 3 & 4 via `hullF` fouling multiplier on ITTC-57 friction & roughness `k`; validate against US Navy / ITTC hull-fouling resistance tables (+30%–80% Cf increase). |
| `HYDRO_TUNING.hullSpeedLengthRefRatioMin/Max` | `0.75` / `1.35` | Clamp bounds for `vesselCfg` length modding ratio | Verify modded `boatLengthM` stays within stable displacement-hull Froude regimes. |
| `HYDRO_TUNING.hullSpeedWallStartFrac/SpanFrac/GainFrac` | `0.78` / `0.42` / `0.36` | Pre-Delft analytical wave-making resistance wall | Replaced in Step 4 (hull) by true Delft `evalResiduaryResistance` Froude spline (`Fn 0.1–0.6`). |
| `HYDRO_TUNING.maxTargetHullSpeedMult` | `1.18` | Diagnostic steady-state speed upper clamp (`1.18 * hullSpeedKts`) | Validate downwind surfing/planing threshold against Elan 19 vs Contessa 32 ORC polar maxima (~1.1–1.25× `1.34 * sqrt(LWL)`). |
| `HYDRO_TUNING.keelLiftSlope` | `4.6` | Hydrodynamic keel lateral lift slope (`dCl/dBeta`) | Compare steady close-hauled leeway (`3°–6°` at 6 kt) against Larsson *Principles of Yacht Design* low-aspect-ratio keel lift curve (`~2π * AR / (AR + 2)`). |
| `HYDRO_TUNING.leewayMaxDeg` | `12` | Max steady-state leeway clamp (deg) | Verify long-keel vs fin-keel drift at very low boat speeds (`< 1.5 kt`). |
| `HYDRO_TUNING.leewayCutoffAwaDeg` | `120` | AWA above which lateral sail force produces negligible leeway | Check `sin(AWA)` lateral component above broad reach; verify leeway naturally approaches 0 near dead run. |
| `HYDRO_TUNING.gravityMs2` | `9.81` | Gravitational acceleration (`m/s²`, matches `bythelee/SailEnv.js:L65`) | Standard SI gravity (`9.80665 m/s²`); exact match to `bythelee/SailEnv.js:L65`. |
| `HYDRO_TUNING.rightingMomentScale` | `0.72` | Pre-GZ linear sin(heel) righting moment multiplier | Replaced in Step 4 (heel) by per-boat GZ righting-moment curves in `boats.ts`. |
| `HYDRO_TUNING.heelingMomentArmScale` | `0.38` | Net lateral aerodynamic-to-roll moment calibration lever | Calibrate against published Dellenbaugh Angle / 15 kt beam-reach heel (`14°–19°`) for Elan 19, Contessa 32, and Rustler 36. |
| `HYDRO_TUNING.heelScaleByPreset` | `{0.58, 0.96, 1.12}` | Pre-Step-5 tier multipliers on heeling torque | **Removed in Step 5** so realism tiers never alter solver equations (only `forgivingHeelCapDeg` cap applies). |
| `HYDRO_TUNING.overpowerDragSlope` | `0.022` | Added hull drag slope past `maxSafeHeelDeg` | Compare broaching/drag slowdown above 32° heel against Delft heeled residuary resistance trends (Fossati p. 29). |
| `HYDRO_TUNING.overpowerDragMin` | `0.58` | Floor on overpower speed multiplier | Sanity-check heavy weather survival speed under bare/reefed canvas at 40° heel. |
| `HYDRO_TUNING.waveSlamMinWaveM` | `1.0` | Significant wave height `Hs` (m) onset for upwind bow slamming | Validate against cruising logbooks & Fossati added-resistance-in-waves onset (`Hs > 1.0m` for 6–13m hulls). |
| `HYDRO_TUNING.waveSlamMaxAwaDeg` | `68` | Upwind AWA cone affected by pitching/slamming slowdown | Verify wave encounter angle `cos(AWA)` slows close-hauled VMG in short head seas without penalizing beam reaches. |
| `HYDRO_TUNING.waveSlamMassCoeff` | `0.052` | Added slamming drag per kg displacement per meter wave above 0.9m | Measure VMG loss in 2.5m squall head seas (target ~12%–22% upwind speed reduction). |
| `HYDRO_TUNING.waveSurfMinWaveM` | `1.25` | Significant wave height onset for downwind quartering surf push | Verify downwind/broad-reach acceleration on steep trade-wind swells (`>1.25m`). |
| `HYDRO_TUNING.waveSurfMinAwaDeg` | `122` | Downwind AWA onset for wave surfing boost | Verify surfing activates only when quartering/running with following seas (`>122°`). |
| `HYDRO_TUNING.waveSurfMassCoeff` | `0.048` | Downwind surfing thrust per kg displacement per meter wave above 1.1m | Check peak squall downwind surge on Elan 19 (~7.4 kt vs 6.4 kt displacement hull speed). |

### 3. Visual Ocean Gerstner Spectrum (`src/three/oceanScene.ts` — `GERSTNER_WAVES`)

| Constant | Value | Meaning | How to Validate |
|---|---:|---|---|
| `GERSTNER_WAVES[0..5]` | 6 directional swells (`λ = 76, 48, 27, 15, 9.5, 5.8 m`, `amp = 0.42..0.022`, `q = 0.45..0.20`) | Multi-octave Gerstner wave spectrum driving GLSL surface and `sampleGerstnerMotion` | Verify steepness sum `Σ(k * a * q) < 1.0` (no inverted wave loops), dispersion speed `ω ≈ √(gk)`, and visual horizon/chop plausibility in trade winds (`1.1m`) and squalls (`3.3m`). |

---

## Added Constants (Features 4, 3, Waves, 5)

### Step 4 (Hull): Delft Residuary + ITTC-57 Frictional Drag (`src/sim/tuning.ts` & `src/sim/boats.ts`)

| Constant | Value | Meaning | How to Validate |
|---|---:|---|---|
| `HYDRO_TUNING.delftOutOfRangeResiduaryMult` | `1.14` | Residuary resistance correction factor applied when vessel geometry falls outside Delft DSYHS fin-keel series bounds (`rustler-36`, `folkboat-25`, `elan-19`) | Compare predicted steady-state hull speed power curves against tank-test or sea-trial speed-power logs for long-keel `Rustler 36` and wide-beam `Elan 19`. |
| `HYDRO_TUNING.delftLongKeelAppendageDragMult` | `1.22` | Multiplier on appendage frictional+form drag fraction for encapsulated long-keel vessels (`folkboat-25`, `rustler-36`) | Measure wetted surface of full keel + skeg + rudder vs separated fin keel from lines plans; typical long-keel wetted appendage ratio is +18%–30% higher. |
| `HYDRO_TUNING.delftFinKeelAppendageDragFrac` | `0.14` | Keel + rudder appendage drag fraction added atop canoe-body ITTC-57 friction | Compute `Cf * Sw_appendages * (1 + formFactor)` from each boat's keel/rudder wetted area relative to `swcM2` (`~10%–18%`). |
| `BOAT_SPECS[*].delftHull` (`bwlM`, `tcM`, `delCM3`, `cp`, `cm`, `lcbPct`, `lcfPct`, `awM2`, `swcM2`, `roughnessK`) | Per-boat values in `src/sim/boats.ts` | Hydrostatic coefficients derived from published `LWL`, `Beam`, and `Displacement` (`lwlM` published; remaining canoe-body ratios estimated `"guess"`) | Replace with exact hydrostatics extracted from designer lines plans / Delftship / ORC certificates (`Swc`, `Aw`, `Tc`, `Cp`, `LCB`) for each vessel class. |

### Step 4 (Heel): Per-Boat GZ Righting-Moment Curves (`src/sim/tuning.ts` & `src/sim/boats.ts`)

| Constant | Value | Meaning | How to Validate |
|---|---:|---|---|
| `BOAT_SPECS[*].gzCurve.gm0M` | `0.72`–`1.26` m | Initial transverse metacentric height `GM_0` (`dGZ/dφ` at `0°`) | Perform physical inclining experiment (`GM_0 = w·d / (Δ·tan θ)`) or read ORC/STIX stability booklet initial `GM_0`. |
| `BOAT_SPECS[*].gzCurve.gzMaxM` & `maxGzAngleDeg` | `0.42–0.84` m @ `50°–66°` | Peak righting arm and heel angle of maximum righting moment | Compare against published yacht stability curves (e.g. RYA/Fastnet stability study for Contessa 32, Rustler 36, Hallberg-Rassy 42). |
| `BOAT_SPECS[*].gzCurve.vanishingStabilityDeg` | `112°–136°` | Angle of Vanishing Stability (AVS); Contessa 32 `136°` published, others `"guess"` | Verify against SSS/STIX/ISO 12217 Category A ocean stability index & inclining tests. |
| `HYDRO_TUNING.heelingMomentArmScale` | `0.56` | Lateral aerodynamic-to-roll lever calibration against full GZ curve | Check 15 kt beam-reach heel (`~9.6°` on Elan 19, `~4.8°` on Contessa 32) and 32 kt squall overpower (`>26°` Elan 19, `<33°` Contessa 32) against sea-trial observations. |
| `HYDRO_TUNING.heelAerodynamicCosExp` | `1.2` | Aerodynamic heeling moment roll-cosine exponent (`cos(φ)^1.2`) | Compare heeled drive/heel drop-off vs wind-tunnel & VPP `cos^1.3(φ)` sail-projection literature (Fossati / Larsson). |

### Step 3: Geometric Reefing & Wear (`src/sim/boats.ts` & `src/sim/tuning.ts`)

| Constant | Value | Meaning | How to Validate |
|---|---:|---|---|
| `BOAT_SPECS[*].reefPoints[0..2]` | Per-boat `[1.0..0.46]` area, CE `[4.85..1.72]` m | Per-boat geometric slab reef & jib/staysail area fractions and CE heights above waterline | Measure each boat's sailplan `(luff_r / P)` geometric panels and triangle centroids `(0.38 * luff_r + boomHeight)` directly from rig dimensions (`I`, `J`, `P`, `E`). |
| `WEAR_TUNING.hullPenaltyCoeff` | `0.28` | `hullF = 1 - 0.28*(1 - hull/100)`, scaling drag via `1/hullF` (up to `1.39×`) | Compare against ITTC / US Navy light-to-heavy fouling frictional drag penalty curves (+25%–50% hull resistance). |
| `WEAR_TUNING.sailClPenaltyCoeff` | `0.36` | `sailClMult = 1 - 0.36*(1 - mainsail/100)` (`Cl` multiplier `0.64–1.00`) | Validate blown-out Dacron sail camber collapse (`-20%` to `-40%` lift coefficient) against sailmaker wind-tunnel tests. |
| `WEAR_TUNING.sailExtraCdMax` | `0.16` | `sailExtraCd = 0.16*(1 - mainsail/100)` additive parasitic drag coefficient | Validate flutter/leach-hook parasitic drag increase on aged cruising canvas. |
| `WEAR_TUNING.rigFloorFactor` & `rigFatigueAmplification` | `0.25` / `1.25` | `rigF = 0.25 + 0.75*(rigging/100)` integrity index & `1 + 1.25*(1 - rigF)` storm wear multiplier | Calibrate against rigging inspection lifetimes & cyclic wire/swage fatigue S-N curves under gale dynamic shock. |
| `WEAR_TUNING.rigCriticalPartingPct`, `rigFailureRiskExponent`, `rigFailureBaseRatePerHr` | `12%` / `2.2` / `0.42` | Standing rigging critical parting floor & nonlinear hourly failure risk escalation | Validate emergency dismasting rate in severe >35 kt squalls / crash-gybes when player neglects splicing below 25% rig condition. |

### Step Waves: Wave Slamming, Surfing & Pitch (`src/sim/tuning.ts` & `src/sim/hullPhysics.ts`)

| Constant | Value | Meaning | How to Validate |
|---|---:|---|---|
| `HYDRO_TUNING.waveSlamOffsetWaveM`, `waveSurfOffsetWaveM` | `0.9` / `1.1` m | Effective significant-wave height offsets for linear slamming & surfing force ramps | Verify continuous non-negative ramp at threshold (`Hs = 1.0m` slam, `Hs = 1.25m` surf) with realistic 12–22% upwind VMG loss in `3.0m` squall chop. |
| `HYDRO_TUNING.waveSurfPhaseFloor` | `0.45` | Minimum crest-cycle factor `[0.45..1.0]` during `sin(waveCyclePhase)` wave encounter | Observe quartering surge modulation in 3D cockpit view and check no sudden stall spikes in wave troughs. |
| `HYDRO_TUNING.wavePitchFreqMult`, `wavePitchBaseDeg`, `wavePitchPerMeterDeg` | `1.4` / `1.2°` / `1.6°/m` | Vessel longitudinal pitch oscillation frequency multiplier & amplitude coefficients | Compare cockpit horizon pitch vs Gerstner swell slope (`atan(k*a)`) for 6–13 m hulls in 1.1m trades and 3.3m squall seas. |

### Step 5: Realism Tiers Solver Invariant (`src/sim/realism.ts` & `src/sim/foilPhysics.ts`)

- `HYDRO_TUNING.heelScaleByPreset` (`{ arcade: 0.58, cruising: 0.96, simulation: 1.12 }`) has been **removed**. All three realism tiers now execute the exact same aerodynamic, Delft/ITTC-57 hydrodynamic, and GZ righting-moment equations; `src/sim/realism.ts` differs strictly through input and limit parameters (`noGoDeg`, `autoTrimAssist`, `inIronsGhostDrive`, `accidentalGybeDamage`, `waveSlamAndSurf`, `forgivingHeelCapDeg`, `wearRateScale`, `leewayScale`).



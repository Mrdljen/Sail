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




---

## Restored Ocean Renderer, Model Mapping & Cabin Fittings

The rows below record presentation and render-budget guesses for the restored originals and the procedural cabin added beside the imported models. src/sim/oceanConfig.ts ports the shared CPU/GPU Gerstner field from DRIFT/js/waves.js (MIT); the code and THIRD_PARTY_NOTICES.md identify that source. No code was copied from By The Lee or Tiller in this restoration.

### Step 1: Instrument Data & Canvas HUD (src/sim/instrumentData.ts, src/components/SailingInstrumentPanel.tsx)

| Constant | Value | Meaning | How to Validate |
|---|---:|---|---|
| HUD smoothing rate | 6.5 s^-1 | Exponential damping rate for animated readings | Replay abrupt heading, wind, heel, and speed changes; confirm readings stay legible with less than 0.5 s lag. |
| HUD frame delta cap | 0.1 s | Avoids a suspended tab jumping readouts on resume | Suspend/resume and confirm the readouts approach current values smoothly. |
| Sparkline sample interval | 550 ms | Time between speed/depth history points | Compare trace horizon and redraw load on a tablet at 30 and 60 fps. |
| Sparkline history length | 42 samples | Retained points (about 23.1 s at the configured interval) | Confirm the full trace is readable at narrow HUD width and does not grow during a 10-minute session. |
| Solar dial full scale | 600 W | Maps panel output to a 0–100% arc | Compare against panel peak rating; verify ordinary output uses most of the arc without clipping. |
| Low-battery display threshold | 20% | Changes charge readout to warning color | Play through discharge/recharge and verify the color transition matches the intended low-charge cue. |
| Wind-warning color scale | 35 kt | Normalizes footer wind color | Compare calm and gale scenarios; keep this distinct from the simulation storm-warning threshold. |
| Artificial-horizon pitch gain / limit | 2.1 px/degree, ±40 px | Pitch movement and limit in the attitude window | Compare 0°, ±10°, ±20° against a reference horizon and confirm the scale reads well at panel size. |

### Step 2: Tablet Helm & Cabin Controls (src/components/SailingInstrumentPanel.tsx, src/three/boatBuilder.ts)

| Constant | Value | Meaning | How to Validate |
|---|---:|---|---|
| Drag deadband | 7 CSS px | Pointer motion before applying helm input | Test finger and stylus on small/large tablets; a stationary touch should not steer. |
| Drag steering gain | 0.28°/CSS px | Converts pointer movement into a heading step | Complete a tack and hold course with short and long drags; compare precision with the ±3° buttons. |
| Per-event drag clamp | ±9° | Maximum heading change from one pointer event | Test fast swipes at 30/60 fps; a missed frame must not create an abrupt turn. |
| Sheet control step | 10 percentage points | Trim change per mainsheet/jibsheet tap | Verify repeated taps trim smoothly from close-hauled to eased without overshoot. |
| Sheet control limits | 5–100% | Lower/upper touch-control bounds | Tap repeatedly at both endpoints and verify the simulation and display stay in range. |
| Cabin camera anchors | Model-specific RAW_SPECS points in src/three/boatBuilder.ts | Positions the view at the supplied GLB helm and companionway | Compare each raw anchor with the model mesh, then check sightlines and roof clearance in both first-person views for both model families. |
| Cabin envelope / floor | length min(0.44 x hull length, max(0.9 x hull scale, half camera-anchor gap)); width min(0.58 x beam, 1.45 x hull scale); floor max(0.04 x scale, camera anchor minY - 0.52 x scale) | Fits added furnishings inside the imported cabin volume | Inspect both GLB families in first-person cabin view; keep floor under berths and all furnishings below the coachroof. |
| Cabin floor | 0.88 x cabin width, 0.92 x cabin length, 0.045 x scale thick; center at y=0.02 x scale | Teak floor footprint and thickness | Check floor edges do not protrude through the hull or disappear under berths at each hull scale. |
| Settees / berth bases | cushions 0.34 x width by 0.48 x length; bases 0.35 x width by 0.50 x length; side offset 0.285 x width; aft offset -0.11 x length | Port and starboard berths with a center passage | Check passage width and collision-free clearance from cabin side and forward V-berths in both model families. |
| Forward V-berths | each 0.30 x cabin width by 0.30 x cabin length; side offset 0.19 x width; aft position -0.32 x length; angle 0.17 rad | Pair of cushions in forepeak | Inspect fit at both ends of each interior; cushions should meet without crossing the centerline or companionway. |
| Chart table / galley | port/stbd offsets +/-0.28 x width; counters 0.34-0.35 x width and 0.22-0.26 x length; tabletop y=0.48 x scale | Navigation table, chart display, and galley footprint | Check the screen/table and sink/stove fit under the cabin roof and leave a center passage. |
| Cabin instrument layout | breaker panel 0.22 x width by 0.28 x scale at y=0.67 x scale; six switches at 0.085 x scale spacing; three autopilot keys at +/-0.07 x scale | VHF, breaker panel, and helm repeater controls | Use raycast targets from first-person view; verify each control is visible, separately clickable, and does not overlap furniture. |
| Cabin light | lamp y=0.84 x scale, point light y=0.80 x scale, range 4.5 x scale, intensity 0.9 | Warm light over the cabin passage | Compare switch on/off in dark scenes; make the whole cabin readable without washing out the display. |
| Wheel visual rotation gain | 2.2 x rudder angle on wheel Z; -0.7 on Y | Makes helm movement visible while staying linked to rudder state | Sweep both rudder stops; verify wheel direction and travel track the rudder without changing physics. |
| Wheel rim radius / tube | 0.36 / 0.021 x hull scale | Procedural helm wheel size | Compare the wheel with a 600-800 mm yacht wheel and verify hand and binnacle clearance on each hull. |
| Winch drum radii / height | 0.075 / 0.095 / 0.14 x hull scale | Procedural self-tailing winch proportions | Compare with common 20-40 ft yacht winches and inspect cockpit reach and coaming clearance. |
| Winch crank / knob | 0.20 / 0.028 x hull scale | Handle and grip size | Inspect hand-scale plausibility, rotation, and clearance from cockpit fittings on both model families. |
| Winch placement | +/-0.30 x beam, 0.20 x hull scale above cockpit origin, -0.12 x hull scale aft | Port and starboard sheet controls | Compare each winch with cockpit and sheet leads in all four GLBs; correct if a handle intersects a seat or coaming. |

### Step 4 (Hull): No New Hull-Resistance Guess

The last presentation pass did not change Delft residuary resistance, ITTC-57 friction, wetted area, or hull-fouling equations. Existing Step 4 (Hull) rows above remain the validation record; surface sampling and wake shading below are visual coupling/effects, not hull resistance.

### Step 4 (Heel): Attitude Presentation & Feedback (src/components/SailingInstrumentPanel.tsx, src/audio/sailingAudio.ts)

| Constant | Value | Meaning | How to Validate |
|---|---:|---|---|
| Heel creak onset / full-load span | 10° / 18° (full at 28°) | Maps absolute heel to the hull/rig creak envelope | Compare with GZ curve and reef thresholds; keep it silent in ordinary flat sailing and rising before dangerous heel. |
| Heel creak filter range | 105–160 Hz | Changes creak timbre as heel load rises | Listen on headphones/speakers at several angles; keep the cue low and unobtrusive. |
| Heel creak full-load gain | 0.018 + 0.025 × windNorm | Relative gain at full load, scaled by wind | A/B-test in strongest gale; verify it does not mask wind, wave, or luff cues. |
| Heel filter / gain smoothing | 0.22 s / 0.30 s | Damps timbre and volume transitions | Sweep through onset and check for clicks, pumping, or delayed feedback. |
| Luff-noise center / modulation | 1250 Hz, ±280 Hz when luffing (±28 Hz otherwise) | Synthetic flutter-noise band | Compare drawing and luffing sail states at multiple wind speeds; tune until flutter is detectable but not tonal. |
| Luff-noise gain | 0.07 + 0.035 × windNorm while luffing | Relative gain when a sail is luffing | Verify audibility in quiet conditions and subordination to wind in a squall. |
| Luff filter / gain smoothing | 0.04 s / 0.08 s | Response to sail-state changes | Toggle luffing repeatedly; check for zipper-like artifacts or abrupt onset. |
| Winch ratchet debounce | 0.11 s | Minimum spacing between ratchet cues | Trim rapidly from touch and 3D winch; one action should sound once without chatter. |
| Winch ratchet notes / spacing | 3 × (620 + 95*i) Hz, 35 ms spacing | Three synthetic pawl clicks per cue | Compare with a short manual winch recording at low playback level; keep clicks distinct from switch sounds. |
| Winch ratchet gain / tone duration | 0.08 / 25 ms | Click level and decay | Test on tablet speakers and headphones; confirm clicks are audible without harshness. |

### Step 3: Reefing & Interior Mapping

The new HUD and cabin repeater read reefLevel from shared simulation state. The last pass did not change reef-point geometry, sail area, center of effort, or sail-wear equations; use the Step 3 rows above. Verify cabin and tablet reef controls show the same reef level.

### Waves: Restored Spectral Surface, Hull Following & Wake (src/sim/oceanConfig.ts, src/three/oceanScene.ts, src/three/boatBuilder.ts)

| Constant | Value | Meaning | How to Validate |
|---|---:|---|---|
| Spectral component count | 24 waves | CPU/GPU detail count for the Phillips spectrum | Compare CPU samples to rendered shader waves across calm and rough presets; check frame time on a tablet-class GPU. |
| Spectrum reference wind | 10.5 m/s, 0.28 rad | Reference wind speed and propagation angle used to seed the deterministic spectrum | Compare the field's dominant direction and period with rendered wind direction; verify nautical degrees map correctly. |
| Target vertical sigma | 0.72 m (reference height 1.44 m) | Normalizes spectral amplitude before weather scaling | Compare crest-to-trough height at scale 1 against the reference field; verify weather scaling is monotonic and reaches intended sea states. |
| Wavelength bounds | 5.5-115 m | Short chop to long swell wavelength range | Inspect wave detail near the boat and horizon for aliasing/repetition; compare periods with observed open-water swell. |
| Direction spread | 0.32 + 1.15 x normalized frequency radians | Broadens short-wave headings more than long swell | Inspect crossed seas and confirm dominant swell follows wind while short chop fans naturally. |
| Phase-speed jitter | 0.94-1.06 x sqrt(gk) | Small frequency variation that avoids a mechanically uniform field | Observe a long run; wave groups should move continuously without visibly repeating or drifting from CPU motion. |
| Gerstner steepness | clamp(0.28 + 0.54 x f, 0.22, 0.84); total sum(k x amp x steep) <= 0.78 | Limits individual and combined horizontal crest sharpening | Check wave crests remain smooth and non-folding at the largest sea state on standard and ultra tiers. |
| Spectrum seed | 20260609 | Reproducible wave directions, amplitudes, and phases | Reload and compare phases and boat response; the ocean should reproduce exactly. |
| Weather-to-spectrum gain | clamp(waveHeightM, 0.25, 3.6) x 0.48 | Maps simulation significant wave height to renderer amplitude | Compare 0.25, 1, and 3.6 m weather against rendered crest-to-trough height; tune if the scale is not monotonic or visibly mis-sized. |
| Hull sample footprint | Half-length max(2.6 m, 0.42 x hull length); half-beam max(1.25 m, 0.42 x half-length) | CPU sample points used for heave, pitch, and roll | Compare sampled motion with the boat footprint on long and short waves; ensure smaller boats do not sample an unrealistically tiny footprint. |
| Heave sample weights / limit | Midpoint 0.40, four hull points 0.15 each; clamp +/-1.35 m | Smooths sampled surface height and limits extreme bob | Compare hull waterline at calm and 3.6 m wave settings; avoid sinking through crests or visibly hovering. |
| Surface pitch gain / clamp | 0.58, +/-0.15 rad | Converts sampled longitudinal slope to hull pitch | Compare bow/stern sample delta with rendered wave slope; confirm pitch follows the surface without abrupt rotation. |
| Surface roll gain / clamp | 0.46, +/-0.13 rad | Converts sampled transverse slope to wave roll before simulated heel | Separate wave roll from simulated heel in beam seas and verify the combined pose remains plausible. |
| Wave-motion smoothing | Heave 4.2 s^-1, pitch 3.8 s^-1, roll 3.4 s^-1 | Dampens hull motion without disconnecting it from the sampled surface | Compare motion lag against wave period; lower lag while avoiding jitter at 30 and 60 fps. |
| Hull surface clearance | 0.025 m | Small visual offset above sampled water to avoid waterline z-fighting | Inspect calm and rough states from cabin and chase views; no visible gap or water cutting through the hull. |
| Polar ocean geometry | Radius 1550 m; rings 92 and segments 128 standard, 68 and 96 software GL | Variable-density radial surface and fallback detail | Compare wave silhouette near and far from camera, then measure frame time on a tablet and software renderer. |
| Auto-tier budget | 24 ms threshold; 4 warmup frames; finish at 16 samples or 5 after 1400 ms; discard 2 high outliers at 6+ samples | Selects the ultra water tier at startup | Repeat startup on low-end and high-end devices; ensure tier changes match sustained frame time rather than shader compilation spikes. |
| Stern wake pool and trigger | 42 sprites; spawn above 0.6 kt with 0.78 per-frame chance | Produces a small wake trail behind a moving boat | Compare stopped, drifting, and 2-6 kt motion; ensure no wake appears at rest and the trail does not flicker or overwhelm the stern. |
| Stern wake persistence and drift | Life decays 0.45 s^-1; drift speed 0.52 x boat speed; lateral spawn scatter +/-0.325 m | Trails and separates foam from the transom | Inspect behind the stern at several speeds; foam should move aft smoothly and fade without a hard cutoff. |
| Stern wake surface placement | Sampled surface +0.07 m; sprite scale (1.3 - life x 0.65) x 1.15 | Keeps sprites on the same wave field and grows them as they fade | Inspect particles over crests and troughs; they should neither sink into nor float above the ocean. |
| Bow spray pool and threshold | 32 droplets; spawn above 2.4 kt; rate (speed/6.5) x (0.4 + 0.35 x waveHeightM) | Adds bow spray at higher speed and in rougher water | Compare 1, 3, and 6 kt in calm and rough water; tune until spray responds smoothly to speed and wave height. |
| Bow spray launch | +/-0.25 m side offset; vertical impulse 1.6-3.1 m/s; lateral impulse 1.2-2.3 m/s and aft impulse 1.4 m/s | Initial droplet position and velocity | Inspect spray direction and lifespan from side and chase views; droplets should arc out from the bow and clear the hull. |

### Procedural Islands and Ports (src/world/generationAlgorithms.ts, src/world/IslandWorld.ts)

| Constant | Value | Meaning | How to Validate |
|---|---:|---|---|
| Volcanic profile | Radius 250 m; peak 215 m; slope power 0.74; coast displacement 20 m; 22 trees; 58 rocks | Lanzarote-like island envelope and clutter budget | Compare the silhouette and shoreline against Lanzarote reference imagery; adjust relief and clutter after viewing near and far LODs at sea level. |
| Steep profile | Radius 205 m; peak 410 m; slope power 0.58; coast displacement 26 m; 116 trees; 48 rocks | La Gomera-like steep relief and vegetation budget | Compare ridge height, cliff proportion, and visible canopy density with La Gomera reference imagery from the sailing camera. |
| Tropical profile | Radius 300 m; peak 190 m; slope power 0.92; coast displacement 24 m; 170 trees; 24 rocks | Broad tropical island and vegetation budget | Review a representative Caribbean/Pacific hub; verify the island stays readable from the route and that instance density does not overwhelm the shore. |
| Atoll profile | Radius 315 m; peak 14 m; slope power 1.15; coast displacement 18 m; 28 trees; 18 rocks | Low island ring and lagoon scale | Inspect the lagoon and ring at sea level and from far LOD; compare ring width and height with an atoll reference. |
| Seed offsets | Two Perlin coordinate offsets in [0, 8192); one phase in [0, 2π) | Separates each hub's terrain and ridge orientation | Reload each hub and compare generated buffers; the same hub must be identical and different IDs should produce distinct coastlines. |
| Coastline noise | Frequencies 0.006/0.018/0.045 m⁻¹; weights 0.58/0.27/0.15; coordinate offsets 0.2/1.7/2.8 | Irregular coastline at three spatial scales | Compare shoreline variation with aerial island references; remove visible repeated lobes while retaining a recognizable seeded outline. |
| Offshore seabed | Regular islands: -14 m base and up to 52 m additional depth over 0.62 normalized radius; atolls: -18 m and up to 42 m over 0.45 | Extends the terrain mesh under the water around the coast | Inspect the sea/land intersection at all approaches; no exposed mesh edge or abrupt underwater wall should appear. |
| Atoll ring | Peak ring at 0.76 radius with 0.13 radial spread; 0.02-0.19 inner rise; 1.6 m noise; 4.5 m lagoon depression; -5.5 m floor limit | Forms a low lagoon basin and raised reef rim | Check that the lagoon stays below sea level, the rim rises above it, and shoreline breaks remain plausible at near LOD. |
| Volcanic caldera | Ring centered at 0.34 normalized radius with 0.13 spread; central depression spread 0.15; relief weights 0.52, 0.56, and 0.18 | Adds a crater rim and central caldera | Compare the skyline from multiple route bearings; avoid a perfect cone or an overly regular circular crater. |
| Steep ridge | Ridge noise scale 0.003; center offset 0.14 radius; width 0.34 radius; peak modulation scale 0.013; ridge weights 0.34/0.72; peak modulation 0.82/0.18 | Produces elongated, broken highlands | Rotate around La Gomera and confirm the silhouette has several readable ridges rather than one central spike. |
| Terrain noise layers | Frequencies 0.0025/0.009/0.027; weights 0.52/0.31/0.17; noise coordinate offsets 5.2/6.3/7.4 | Adds broad, medium, and fine relief | Inspect wireframe and shaded terrain; remove visible grid-scale bumps and retain smooth distant profiles. |
| Shore beach and relief texture | Shore fade 0.075 normalized radius; steep relief gain 0.24, other profiles 0.19 | Softens terrain at the waterline and varies inland slopes | Check that sand does not climb cliffs and terrain does not show high-frequency noise at far LOD. |
| Height material thresholds | Sand below 2.5 m when slope <0.52; height blend reaches full at 120 m (280 m for steep islands); rock blend slope 0.35-0.9 | Chooses sand, vegetation, and rock vertex colors | Compare color bands with terrain height in debug view; remove visible horizontal bands and keep the beach narrow. |
| Island terrain colors | Volcanic low/high (0.35,0.27,0.20)/(0.31,0.29,0.27); steep (0.34,0.42,0.29)/(0.36,0.34,0.30); tropical (0.30,0.46,0.26)/(0.32,0.39,0.29); atoll (0.76,0.67,0.44)/(0.30,0.43,0.31); sand sRGB (220,199,151); rock darkening 0.24 | Base vertex colors and terrain palette | Check each region in clear and overcast weather; keep sand visibly distinct and rock tones consistent with the island profile. |
| Instance candidate search | Up to 18 candidates per target instance; sample radius 0.9 island radii; reject below 5 m; slope measured over +/-4 m and divided by 8 | Finds suitable positions for vegetation and rocks | Inspect each generated island; vegetation must stay on land, avoid steep faces, and fill broad green slopes consistently. |
| Vegetation placement filters | Tree ceiling 0.78 of peak; maximum slope 1.0 steep / 0.62 other; acceptance 0.34 volcanic / 0.78 other; far instance scale 0.28 of near | Controls vegetation placement and far vegetation count | Compare island archetypes; volcanic islands should be sparse, tropical islands denser, and far LOD should not flicker. |
| Instance size and shore filters | Trees 0.66-1.38 scale; rocks 0.7-2.5 m; rock zone beyond 0.67 radius; slope threshold 0.22; far rock scale 0.8 | Sets vegetation and rock size and placement | Compare instance scale against terrain and port buildings; reject floating, buried, or oversized instances. |
| Vegetation instance colors | Far tree #536243/#386241; near trunk #6b533a; near crowns #596342/#356544; volcanic/nonvolcanic rocks #51473e/#6a6963 | Archetype-specific instance colors | Compare silhouettes under clear and hazy light; keep low detail vegetation visible without looking saturated against terrain colors. |
| Terrain mesh detail | Near 112 segments; far 28 segments; grid extends 1.38 island radii; coastline probe spans -1.15 to +1.45 radii in 3 m steps | Heightfield cost and port shoreline sampling precision | Profile worker time on a tablet and inspect LOD transition; confirm the far outline stays stable and the port begins at the visible coast. |
| Near vegetation geometry | Low-detail crown cone radius 4.2 m, height 9 m, 5 sides, scale 0.82; near trunk radii 0.24/0.42 m, height 6.8 m, 5 sides; crown radius 3 m, height 5.8 m, 6 sides; offsets 3.4/6.3 scale units | Procedural tree appearance at both LODs | Compare tree proportions against the island scale from cockpit and chase views; ensure no crown gaps or ground-level trunk gaps. |
| Rock geometry | Dodecahedron radius 1.7 m, detail 0; instance vertical scale 0.7 and depth scale 0.82 | Low-cost faceted coastal rocks | Inspect rocks at shoreline distance; tune if they look like repeated boulders or intersect the sea surface. |
| Port shoreline and quay | Pier length 42-64 m; quay length 38-56 m; quay width 8-11.5 m; breakwater length 48-76 m | Modular harbor footprint | Compare port footprint with island scale and approach visibility; verify the opening remains navigable and not hidden behind terrain. |
| Port house cluster | 7-11 buildings; rows spaced 8-13 m; columns spaced 13-16 m; widths 5-10 m; depths 5-9 m; heights 4-10 m; yaw +/-0.12 rad | Regional village silhouette behind the quay | Inspect every regional palette from the sea; houses should cluster behind the shore without merging into one block. |
| Port beacon and moorings | Lighthouse 16-27 m; 8-12 mooring posts; 2-4 small sailboats | Makes the harbor recognizable from the sailing camera | Check visibility in day/night and fog, then verify docks look occupied without crowding the channel. |
| Port structures | Pier/quay wall heights 1.8/2.2 m; breakwaters 3.2 m high and 4.8 m wide; quay at pier length -7 m; breakwaters at 0.48 breakwater length and +/-1.5 quay widths; 8 bollard sides; mooring offsets 0.86 quay length and 0.37 quay width | Dimensions and placement of harbor structures | Check that posts sit on the quay, breakwaters protect both sides, and boats fit inside the sheltered water. |
| Port building roofs | Roof cone radius 0.82, height 0.46, 4 sides; roof height offset 0.13 times the larger footprint dimension; roof thickness 0.3 times that dimension | Simple repeated house roof profile | Inspect roof coverage from above and from sea level; no roof should float or leave walls visibly uncovered. |
| Lighthouse geometry | Tower radii 1.1/1.65 m, 10 sides; beacon radius 1.25 m; roof radius 1.9 m and height 2.3 m; beacon offset 0.8 m; tower at 0.92 breakwater length and 1.5 quay widths | Harbor entrance landmark | Check the beacon clears the tower roof, faces remain visible at distance, and its base stays on the breakwater. |
| Harbor sailboat geometry | Hull 8.5 x 1.15 x 2.7 m; mast 9.5 m; sail 4.3 x 6.1 m; boat spacing 7.2 m; hull/mast x offsets +18/+17 m from pier end and alternating +10 m; mast/sail y 5.2/5.1 m; sail z +1.8 m; alternating 0.12 rad heading | Lightweight procedural boats inside the port | Compare the silhouettes with the player sailboat and inspect for mast/sail alignment from harbor approach distance. |
| Procedural material response | Terrain roughness/metalness 0.94/0.01; tree roughness 0.9-0.96; stone/wall/trim/roof roughness 0.78-0.88; hull roughness/metalness 0.56/0.1; sail roughness 0.84; beacon intensity 1.2 | Simplified material response for the generated scene | Review in midday, overcast weather, and night; adjust if terrain glints, roofs look metallic, or the beacon clips. |
| Island LOD and visibility | Near-to-far switch 480 m with 440/500 m hysteresis; port hidden beyond 1150 m; island hidden beyond 1600 m | Limits draw work while avoiding LOD flicker | Sail toward and away from each island at several camera modes; transitions should not pop or hide the harbor too early. |
| Route placement | 55 m per passage NM; departure offset (-135, -55) m; destination offset (+125, -30) m and rotated 180 degrees; distant boats placed +/-155-165 m from each island | Connects local passage progress to island positions | Sail from each route start to arrival; the departure island should recede behind the boat and the destination should approach the correct end. |
| Regional port palette | Canary walls/roofs/trim/stone #e6dfd1/#b46549/#4d7374/#655e55; tropical #f0e8d9/#9f5942/#4aa1a1/#766c5d; atoll #f0e7c5/#688d76/#328d95/#9c9273; temperate #d8d3c5/#515764/#536b79/#625f5b | Distinguishes port regions | Compare palettes against reference photos under the same sky; retain readable contrast between walls, roofs, and quay. |

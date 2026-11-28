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
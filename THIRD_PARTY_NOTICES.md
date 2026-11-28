# Third-Party Notices & Reference Licenses

This project ports specific algorithms and procedural ocean patterns from external repositories inspected in `/tmp/gh-refs`:

1. **Leeboard / By The Lee (`bythelee`)**
   - Source: `https://github.com/leeboardtools/bythelee`
   - License: **Apache License 2.0** (`/tmp/gh-refs/bythelee/LICENSE`)
   - Ported modules: Natural cubic spline (`CSpline`), `"Sail"` Cl/Cd/Cm tables, `ClCd.calcLiftDragMoment`, `Foil.calcLocalForce`, Delft residuary resistance & wetted-surface heel correction (`Delft.js`), ITTC-57 frictional drag & roughness spline (`Hull.js`, `Water.js`, `SailEnv.js`).

2. **Tides of Fortune (`tides-of-fortune`)**
   - Required Notice: Copyright 2026 silvestroz (https://github.com/silvestroz/tides-of-fortune)
   - License: **PolyForm Noncommercial License 1.0.0** (`https://polyformproject.org/licenses/noncommercial/1.0.0`, `/tmp/gh-refs/tides-of-fortune/LICENSE.md`)
   - Note: Use and derivative works of `tides-of-fortune` assets/patterns are licensed **for noncommercial purposes only**.
   - Ported / inspired items: Procedural tileable ocean detail normal & cellular/FBM foam textures (`src/three/proceduralTextures.ts`, ported from `src/world/ocean/textures.js`), Gerstner Jacobian foam/Fresnel/SSS ocean shader structure (`src/three/oceanScene.ts`, inspired by `src/world/ocean/waves.js` & `oceanMaterial.js`), coiled cockpit line aesthetic (`src/three/boatBuilder.ts`), and the `hullF`/`rigF` degradation pattern (`src/ships/ship.js:L158-159`) adapted with Meridian Passage's own `Cl`/extra-`Cd`/failure-risk equations.

3. **Tiller (`tiller`)**
   - Source: `https://github.com/mblode/tiller`
   - License status audited: **No open-source license file** (`package.json` declares `"private": true`; `README.md` states *"A private project, built for the joy of it. Fair winds."* — all rights reserved unless permission is granted by the author).
   - Previously ported in Steps 1–2: Trim & luff helpers (`optimalBoomAngle`, `optimalSheet`, `luffFactor`), point-of-sail thresholds, and maneuver state machine (`SAILING` / `IN_IRONS` / `TACKING` / `GYBING` / `CRASH_GYBE`) in `src/sim/foilPhysics.ts`. No new code is copied from `tiller` in subsequent steps.


## License Audit for the Latest Implementation (2026-11-27)

- By The Lee public repository identifies the root LICENSE as Apache-2.0. The latest HUD, cabin, and ocean presentation pass did not copy code from it.
- The public mblode/tiller repository lists no LICENSE file and its README describes the project as private. No Tiller source was copied for the latest pass. Earlier Tiller-inspired simulation ports remain attributed above.
- The CPU ocean sampler is an algorithm port of DRIFT's shared CPU/GPU Gerstner wave field. See the specific entry below.

## Restored Ocean Renderer, Model Assets & Cabin Presentation (2026-11-28)

1. **DRIFT (`christianpasinrey/drift`)**
   - Source: https://github.com/christianpasinrey/drift
   - License: **MIT**, Copyright 2026 Christian Pasín Rey (`LICENSE`).
   - Ported algorithm: `js/waves.js` Gerstner spectrum and CPU surface sampler, adapted in `src/sim/oceanConfig.ts`. The renderer and CPU boat sampler share the same deterministic wave field.

2. **Ultra-Water (`Humpalumps/Ultra-Water`)**
   - Source: https://github.com/Humpalumps/Ultra-Water
   - License: **MIT**, Copyright 2026 Humpalumps (`LICENSE`).
   - Adapted module: `src/three/ultraWater.ts`, with upstream file references documented in that file's header.

3. **Hash without Sine (`David Hoskins`)**
   - Source: https://www.shadertoy.com/view/4djSRW
   - License: **MIT**, as identified in `src/three/ultraWater.ts`.
   - Adapted procedural hash used by the foam texture generator in `src/three/ultraWater.ts`.

4. **J-80 Sailboat (`BoatUS Foundation`)**
   - Source: https://sketchfab.com/boatusfoundation
   - License recorded in the supplied original model metadata: **CC BY-NC-ND 4.0**.
   - Existing assets: `public/models/j-80_sailboat.glb` and `public/models/j-80_sailboat (1).glb`. Runtime orientation and scale are applied by the renderer; the asset files are unchanged.

5. **Sailboat (`Sergei` / `sergeif`)**
   - Source: https://sketchfab.com/3d-models/sailboat-76d0b1e24be14d2f9a524bfce3001aeb
   - License recorded in the supplied original model metadata: **CC BY 4.0**.
   - Existing assets: `public/models/sailboat.glb` and `public/models/sailboat (1).glb`. Runtime orientation and scale are applied by the renderer; the asset files are unchanged.

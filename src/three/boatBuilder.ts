import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BOAT_SPECS, EXTERIOR_MODELS } from '../sim/boats';
import type { BoatId, ExteriorModelId, SimulationState } from '../types/sailing';
import type { ProceduralTextureSet } from './proceduralTextures';

export type InteractiveAction =
  | 'toggle-nav-lights'
  | 'toggle-cabin-lights'
  | 'toggle-vhf'
  | 'toggle-instruments'
  | 'toggle-fridge'
  | 'toggle-bilge'
  | 'trim-main-in'
  | 'trim-jib-in'
  | 'cycle-reef'
  | 'toggle-windvane'
  | 'toggle-anchor'
  | 'open-chandlery'
  | 'steer-port-5'
  | 'steer-stbd-5'
  | 'toggle-staysail';

export interface InteractiveTarget {
  mesh: THREE.Object3D;
  action: InteractiveAction;
  label: string;
}

export interface BuiltBoat {
  root: THREE.Group;
  hullPivot: THREE.Group;
  boomPivot: THREE.Group;
  mainsailMesh: THREE.Mesh;
  jibMesh: THREE.Mesh;
  staysailMesh: THREE.Mesh | null;
  rudderMesh: THREE.Mesh;
  helmControlMesh: THREE.Object3D;
  mainsheetWinch: THREE.Group;
  jibsheetWinch: THREE.Group;
  windvanePaddle: THREE.Mesh;
  compassCardMesh: THREE.Mesh;
  navLightMat: THREE.MeshStandardMaterial;
  portNavMat: THREE.MeshStandardMaterial;
  stbdNavMat: THREE.MeshStandardMaterial;
  cabinLight: THREE.PointLight;
  cabinLampMat: THREE.MeshStandardMaterial;
  vhfScreenMat: THREE.MeshStandardMaterial;
  windvaneBtnMat: THREE.MeshStandardMaterial;
  anchorGroup: THREE.Group;
  anchorChainLine: THREE.Line;
  breakerMeshes: Record<string, THREE.Mesh>;
  telltales: THREE.Mesh[];
  interactables: InteractiveTarget[];
  helmEyeLocal: THREE.Vector3;
  helmLookLocal: THREE.Vector3;
  cabinEyeLocal: THREE.Vector3;
  cabinLookLocal: THREE.Vector3;
  deckLengthM: number;
  hullLengthM: number;
  hullBeamM: number;
  hullScaleFactor: number;
  cabinRoofBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  exteriorModelId: ExteriorModelId;
  jibStayAxis: THREE.Vector3;
  staysailStayAxis: THREE.Vector3 | null;
  isExteriorReady: () => boolean;
  dispose: () => void;
}

/**
 * Exact raw-GLB rigging, waterline, and cockpit geometry specs derived from the 4 models in public/models/.
 * In both raw GLBs, bow = +Z, stern = -Z, up = +Y. After 180 deg Y rotation in boatBuilder, bow = -Z, stern = +Z.
 */
interface RawRigSpec {
  shipFamily: 'j80' | 'sergei';
  rawHullLength: number;
  rawBeam: number;
  rawWaterlineY: number;
  rawCenterZ: number;
  mastZRaw: number;
  mastTopYRaw: number;
  gooseneckYRaw: number;
  boomLenRaw: number;
  forestayTackZRaw: number;
  forestayTackYRaw: number;
  jibHeadYRaw: number;
  rudderPostZRaw: number;
  rudderTopYRaw: number;
  rudderDepthRaw: number;
  rudderChordRootRaw: number;
  rudderChordTipRaw: number;
  helmEyeRaw: [number, number, number];
  helmLookRaw: [number, number, number];
  cabinEyeRaw: [number, number, number];
  cabinLookRaw: [number, number, number];
  deckCockpitZRaw: number;
  deckCockpitYRaw: number;
}

const RAW_SPECS: Record<'j80' | 'sergei', RawRigSpec> = {
  j80: {
    shipFamily: 'j80',
    rawHullLength: 6.76, // Z_raw [-3.16, +3.60] excluding retractable bowsprit & rudder
    rawBeam: 2.1,
    rawWaterlineY: -0.74, // Canoe bottom -1.29, transom -0.81, forefoot -0.78 -> keeps BoatUS crisp & stern seated
    rawCenterZ: 0.22,
    mastZRaw: 1.42,
    mastTopYRaw: 8.58,
    gooseneckYRaw: 0.80,
    boomLenRaw: 3.55,
    forestayTackZRaw: 3.47,
    forestayTackYRaw: 0.37,
    jibHeadYRaw: 7.55, // 7/8 fractional rig forestay tang on J-80 mast
    rudderPostZRaw: -3.22,
    rudderTopYRaw: -0.56,
    rudderDepthRaw: 1.52,
    rudderChordRootRaw: 0.40,
    rudderChordTipRaw: 0.32,
    // Cockpit helmsman sits on windward side aft of companionway, looking forward over coachroof & bow
    helmEyeRaw: [0.46, 0.44, -2.05],
    helmLookRaw: [0.06, 0.32, 3.6],
    // Forward-facing sheltered companionway / cabin hatch lookout (above solid cabin roof)
    cabinEyeRaw: [0.0, 0.54, -0.85],
    cabinLookRaw: [0.0, 0.42, 3.8],
    deckCockpitZRaw: -1.45,
    deckCockpitYRaw: -0.28,
  },
  sergei: {
    shipFamily: 'sergei',
    rawHullLength: 1648.3, // Z_raw [-824.0, +824.3]
    rawBeam: 505.9,
    rawWaterlineY: 64.0, // Canoe -188, forefoot +57.8, stern chine -23.9, gunwale +240 -> natural cruiser immersion
    rawCenterZ: 0.0,
    mastZRaw: 136.4,
    mastTopYRaw: 2180.0,
    gooseneckYRaw: 356.0,
    boomLenRaw: 650.0,
    forestayTackZRaw: 799.0,
    forestayTackYRaw: 184.0,
    jibHeadYRaw: 2095.0,
    rudderPostZRaw: -755.0,
    rudderTopYRaw: 6.0,
    rudderDepthRaw: 165.0,
    rudderChordRootRaw: 118.0,
    rudderChordTipRaw: 82.0,
    // Helmsman stands directly behind wheel pedestal (Z_raw = -548) looking cleanly past mast & bow
    helmEyeRaw: [0.0, 392.0, -650.0],
    helmLookRaw: [0.0, 315.0, 824.0],
    // Sheltered companionway hatch view over coachroof
    cabinEyeRaw: [0.0, 340.0, -180.0],
    cabinLookRaw: [0.0, 290.0, 824.0],
    deckCockpitZRaw: -480.0,
    deckCockpitYRaw: 145.0,
  },
};

function createSailGeometry(width: number, height: number, segX = 12, segY = 14): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= segY; iy++) {
    const v = iy / segY;
    const roach = Math.sin(v * Math.PI) * 0.12 * width;
    const rowWidth = width * (1 - v * 0.87) + roach;
    for (let ix = 0; ix <= segX; ix++) {
      const u = ix / segX;
      const z = u * rowWidth;
      const y = v * height;
      const camber = Math.sin(u * Math.PI) * (1 - v * 0.45) * (width * 0.088);
      positions.push(camber, y, z);
      uvs.push(u, v);
    }
  }

  for (let iy = 0; iy < segY; iy++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iy * (segX + 1) + ix;
      const b = a + 1;
      const c = a + (segX + 1);
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createJibGeometry(
  footLength: number,
  forestayRakeZ: number,
  height: number,
  segX = 8,
  segY = 12,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= segY; iy++) {
    const v = iy / segY;
    const luffZ = v * forestayRakeZ;
    const rowWidth = footLength * (1 - v * 0.94);
    for (let ix = 0; ix <= segX; ix++) {
      const u = ix / segX;
      const z = luffZ + u * rowWidth;
      const y = v * height + (1 - v) * u * (height * 0.11);
      const camber = Math.sin(u * Math.PI) * (1 - v * 0.5) * (footLength * 0.085);
      positions.push(camber, y, z);
      uvs.push(u, v);
    }
  }

  for (let iy = 0; iy < segY; iy++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iy * (segX + 1) + ix;
      const b = a + 1;
      const c = a + (segX + 1);
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function hullHalfWidth(t: number, beam: number): number {
  const widthFactor =
    t < 0.52
      ? Math.pow(Math.sin((t / 0.52) * (Math.PI / 2)), 0.76)
      : 1 - Math.pow((t - 0.52) / 0.48, 1.75) * 0.34;
  const bowFlare = t < 0.25 ? (0.25 - t) * 0.32 : 0;
  return (beam * 0.5) * widthFactor * (1 + bowFlare);
}

export function hullGunwaleY(t: number, scaleFactor: number): number {
  const sheerRise =
    (Math.pow(Math.max(0, 0.48 - t), 1.65) * 0.34 + (t > 0.78 ? (t - 0.78) * 0.22 : 0)) *
    scaleFactor;
  return 0.44 * scaleFactor + sheerRise;
}

function createNacaFoilGeometry(
  chordRoot: number,
  chordTip: number,
  height: number,
  sweepBack: number,
  thicknessRatio = 0.14,
): THREE.BufferGeometry {
  const nChord = 11;
  const nVert = 4;
  const ringPts = (nChord - 1) * 2;
  const positions: number[] = [];
  const indices: number[] = [];

  const nacaHalfT = (xc: number) =>
    5 *
    thicknessRatio *
    (0.2969 * Math.sqrt(xc) -
      0.126 * xc -
      0.3516 * xc * xc +
      0.2843 * xc * xc * xc -
      0.1015 * Math.pow(xc, 4));

  for (let iv = 0; iv <= nVert; iv++) {
    const v = iv / nVert;
    const y = -v * height;
    const chord = THREE.MathUtils.lerp(chordRoot, chordTip, v);
    const zLead = -chord * 0.35 + v * sweepBack;

    for (let ic = 0; ic < nChord - 1; ic++) {
      const xc = Math.pow(ic / (nChord - 1), 1.35);
      const halfX = nacaHalfT(xc) * chord;
      positions.push(halfX, y, zLead + xc * chord);
    }
    for (let ic = nChord - 1; ic > 0; ic--) {
      const xc = Math.pow(ic / (nChord - 1), 1.35);
      const halfX = nacaHalfT(xc) * chord;
      positions.push(-halfX, y, zLead + xc * chord);
    }
  }

  for (let iv = 0; iv < nVert; iv++) {
    for (let ir = 0; ir < ringPts; ir++) {
      const next = (ir + 1) % ringPts;
      const a = iv * ringPts + ir;
      const b = iv * ringPts + next;
      const c = (iv + 1) * ringPts + ir;
      const d = (iv + 1) * ringPts + next;
      indices.push(a, c, d, a, d, b);
    }
  }

  const tipCenterIdx = positions.length / 3;
  const tipChord = chordTip;
  positions.push(0, -height, -tipChord * 0.35 + sweepBack + tipChord * 0.42);
  const tipRingStart = nVert * ringPts;
  for (let ir = 0; ir < ringPts; ir++) {
    const next = (ir + 1) % ringPts;
    indices.push(tipRingStart + ir, tipCenterIdx, tipRingStart + next);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function filterIndexedTriangles(
  geometry: THREE.BufferGeometry,
  worldMatrix: THREE.Matrix4,
  keepPredicate: (
    v0: THREE.Vector3,
    v1: THREE.Vector3,
    v2: THREE.Vector3,
    compBounds?: { min: THREE.Vector3; max: THREE.Vector3 },
    compId?: number,
  ) => boolean,
  useConnectedComponents = false,
): THREE.BufferGeometry {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) return geometry;
  const indexAttr = geometry.getIndex();
  const vertCount = posAttr.count;
  const triCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(vertCount / 3);

  const worldVerts: THREE.Vector3[] = new Array(vertCount);
  for (let i = 0; i < vertCount; i++) {
    worldVerts[i] = new THREE.Vector3().fromBufferAttribute(posAttr, i).applyMatrix4(worldMatrix);
  }

  let compRoot: Int32Array | null = null;
  let compBoundsMap: Map<number, { min: THREE.Vector3; max: THREE.Vector3 }> | null = null;

  if (useConnectedComponents) {
    const uf = new Int32Array(vertCount);
    for (let i = 0; i < vertCount; i++) uf[i] = i;
    const find = (i: number): number => {
      while (uf[i] !== i) {
        uf[i] = uf[uf[i]];
        i = uf[i];
      }
      return i;
    };
    const unite = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) uf[rb] = ra;
    };

    const posMap = new Map<string, number>();
    for (let i = 0; i < vertCount; i++) {
      const w = worldVerts[i];
      const key = `${Math.round(w.x * 10)},${Math.round(w.y * 10)},${Math.round(w.z * 10)}`;
      const existing = posMap.get(key);
      if (existing !== undefined) unite(existing, i);
      else posMap.set(key, i);
    }

    for (let t = 0; t < triCount; t++) {
      const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
      const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
      unite(i0, i1);
      unite(i0, i2);
    }

    compRoot = new Int32Array(triCount);
    compBoundsMap = new Map();
    for (let t = 0; t < triCount; t++) {
      const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
      const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
      const r = find(i0);
      compRoot[t] = r;
      let cb = compBoundsMap.get(r);
      if (!cb) {
        cb = {
          min: new THREE.Vector3(Infinity, Infinity, Infinity),
          max: new THREE.Vector3(-Infinity, -Infinity, -Infinity),
        };
        compBoundsMap.set(r, cb);
      }
      cb.min.min(worldVerts[i0]).min(worldVerts[i1]).min(worldVerts[i2]);
      cb.max.max(worldVerts[i0]).max(worldVerts[i1]).max(worldVerts[i2]);
    }
  }

  const keptIndices: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
    const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
    const r = compRoot ? compRoot[t] : undefined;
    const cb = r !== undefined && compBoundsMap ? compBoundsMap.get(r) : undefined;
    if (keepPredicate(worldVerts[i0], worldVerts[i1], worldVerts[i2], cb, r)) {
      keptIndices.push(i0, i1, i2);
    }
  }

  const cloned = geometry.clone();
  cloned.setIndex(keptIndices);
  return cloned;
}

const gltfTemplateCache = new Map<ExteriorModelId, Promise<THREE.Group>>();
const gltfLoader = new GLTFLoader();

function loadSanitizedGltfTemplate(modelId: ExteriorModelId): Promise<THREE.Group> {
  const cached = gltfTemplateCache.get(modelId);
  if (cached) return cached;

  const meta = EXTERIOR_MODELS[modelId];
  const promise = new Promise<THREE.Group>((resolve, reject) => {
    gltfLoader.load(
      meta.glbUrl,
      (gltf) => {
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);

        const toRemove: THREE.Object3D[] = [];

        scene.traverse((obj) => {
          if (obj.name === 'Object_5' || /sails/i.test(obj.name)) {
            toRemove.push(obj);
            return;
          }
          if (!(obj instanceof THREE.Mesh)) return;

          const matList = Array.isArray(obj.material) ? obj.material : [obj.material];
          if (matList.some((m) => /sails/i.test(m?.name ?? ''))) {
            toRemove.push(obj);
            return;
          }

          matList.forEach((m) => {
            if (!m) return;
            // J_04580_base uses alpha=0 background around the BoatUS & MD hull decals:
            // use alphaTest cutouts with depthWrite=true so the hull stays solid over water.
            if (meta.shipFamily === 'j80' && /base/i.test(m.name ?? '')) {
              m.transparent = false;
              m.alphaTest = 0.35;
              m.depthWrite = true;
              m.side = THREE.DoubleSide;
              m.needsUpdate = true;
            }
          });

          if (meta.shipFamily === 'j80' && obj.name === 'Object_4') {
            const worldMat = obj.matrixWorld.clone();
            const oldGeo = obj.geometry;
            obj.geometry = filterIndexedTriangles(oldGeo, worldMat, (v0, v1, v2) => {
              // Strip J-80 static transom-hung rudder blade (centerline X in [-0.06, 0.06], aft of Z_raw -3.172)
              const allRudder =
                Math.max(Math.abs(v0.x), Math.abs(v1.x), Math.abs(v2.x)) < 0.06 &&
                Math.max(v0.z, v1.z, v2.z) < -3.172 &&
                Math.max(v0.y, v1.y, v2.y) < -0.32;
              if (allRudder) return false;

              // Strip J-80 static boom tube (Component 11: Y_raw 0.65..0.94, Z_raw -1.81..1.41)
              const allBoom =
                Math.max(Math.abs(v0.x), Math.abs(v1.x), Math.abs(v2.x)) < 0.068 &&
                Math.min(v0.y, v1.y, v2.y) > 0.62 &&
                Math.max(v0.y, v1.y, v2.y) < 0.98 &&
                Math.min(v0.z, v1.z, v2.z) > -2.35 &&
                Math.max(v0.z, v1.z, v2.z) < 1.44;
              if (allBoom) return false;

              // Strip J-80 static centerline mainsheet tackle reaching up to the removed static boom
              const allStaticMainsheet =
                Math.max(Math.abs(v0.x), Math.abs(v1.x), Math.abs(v2.x)) < 0.06 &&
                Math.min(v0.y, v1.y, v2.y) > 0.04 &&
                Math.max(v0.y, v1.y, v2.y) < 0.76 &&
                Math.min(v0.z, v1.z, v2.z) > -2.05 &&
                Math.max(v0.z, v1.z, v2.z) < -0.98;
              if (allStaticMainsheet) return false;

              return true;
            });
            oldGeo.dispose();
          } else if (meta.shipFamily === 'sergei') {
            const worldMat = obj.matrixWorld.clone();
            const oldGeo = obj.geometry;
            obj.geometry = filterIndexedTriangles(
              oldGeo,
              worldMat,
              (v0, v1, v2, compBounds) => {
                if (compBounds) {
                  const dx = compBounds.max.x - compBounds.min.x;
                  // 1. Sergei mainsail component (Y=355..2111, planar at X~0.7, Z=-505..123)
                  if (compBounds.max.y > 500 && compBounds.min.z < 100 && dx < 16) {
                    return false;
                  }
                  // 2. Sergei jib component (Y=177..2129, Z=149..799)
                  if (compBounds.max.y > 500 && compBounds.min.z > 140) {
                    return false;
                  }
                  // 3. Sergei static boom component (Y=335..386, Z=-531..119)
                  if (
                    compBounds.min.y > 300 &&
                    compBounds.max.y < 430 &&
                    compBounds.min.z < 0 &&
                    compBounds.max.z < 135 &&
                    dx < 40
                  ) {
                    return false;
                  }
                }
                // 4. Sergei static rudder blade below stern hull (Z < -675, Y < 12, |X| < 20)
                const cz = (v0.z + v1.z + v2.z) / 3;
                const cy = (v0.y + v1.y + v2.y) / 3;
                const cx = (v0.x + v1.x + v2.x) / 3;
                if (cz < -675 && cy < 12 && Math.abs(cx) < 22) {
                  return false;
                }
                return true;
              },
              true,
            );
            oldGeo.dispose();
          }
        });

        toRemove.forEach((child) => {
          child.parent?.remove(child);
        });

        resolve(scene);
      },
      undefined,
      (err) => reject(err),
    );
  });

  gltfTemplateCache.set(modelId, promise);
  return promise;
}

export function buildSailboatModel(
  boatId: BoatId,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
  exteriorOverride?: ExteriorModelId,
  onExteriorLoaded?: () => void,
): BuiltBoat {
  const spec = BOAT_SPECS[boatId] ?? BOAT_SPECS['elan-19'];
  const exteriorModelId: ExteriorModelId =
    exteriorOverride && exteriorOverride in EXTERIOR_MODELS
      ? exteriorOverride
      : spec.exteriorModelId;
  const meta = EXTERIOR_MODELS[exteriorModelId];
  const raw = RAW_SPECS[meta.shipFamily];

  // Uniform scale so the GLB hull matches spec.deckLengthM from boats.ts
  const s = spec.deckLengthM / raw.rawHullLength;
  const L = spec.deckLengthM;
  const B = raw.rawBeam * s;
  const scaleFactor = L / 5.8;

  // Map a point in raw GLB space (bow +Z, stern -Z, WL at rawWaterlineY)
  // into Meridian Passage boat-local space (180° Y rotation -> bow -Z, stern +Z, WL Y=0).
  const rawToLocal = (rx: number, ry: number, rz: number) =>
    new THREE.Vector3(
      -rx * s,
      (ry - raw.rawWaterlineY) * s,
      -(rz - raw.rawCenterZ) * s,
    );

  const disposables: Array<{ dispose: () => void }> = [];
  const interactables: InteractiveTarget[] = [];

  const registerInteractive = (
    mesh: THREE.Object3D,
    action: InteractiveAction,
    label: string,
  ) => {
    mesh.userData.interactiveAction = action;
    mesh.userData.interactiveLabel = label;
    interactables.push({ mesh, action, label });
  };

  const root = new THREE.Group();
  const hullPivot = new THREE.Group();
  root.add(hullPivot);

  // Holder for the loaded glTF exterior (hull, deck, cabin, mast, standing rigging, BoatUS decals)
  const exteriorHolder = new THREE.Group();
  hullPivot.add(exteriorHolder);

  let exteriorReady = false;
  let disposed = false;
  let loadedExteriorClone: THREE.Group | null = null;

  if (typeof document !== 'undefined') {
    document.body.dataset.modelReady = 'loading';
    document.body.dataset.exteriorModel = exteriorModelId;
  }

  loadSanitizedGltfTemplate(exteriorModelId)
    .then((template) => {
      if (disposed) return;
      const clone = template.clone(true);
      clone.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = !isSoftwareGl;
          obj.receiveShadow = !isSoftwareGl;
        }
      });

      // Rotate 180 deg around Y (bow +Z -> -Z), scale to spec.deckLengthM, and align waterline Y=0
      const gltfWrap = new THREE.Group();
      gltfWrap.rotation.y = Math.PI;
      gltfWrap.scale.setScalar(s);
      clone.position.set(0, -raw.rawWaterlineY, -raw.rawCenterZ);
      gltfWrap.add(clone);

      exteriorHolder.add(gltfWrap);
      loadedExteriorClone = gltfWrap;
      exteriorReady = true;

      if (typeof document !== 'undefined') {
        document.body.dataset.modelReady = 'true';
      }
      onExteriorLoaded?.();
    })
    .catch((err) => {
      console.error(`Failed to load glTF exterior (${meta.glbUrl}):`, err);
    });

  // Procedural Rigging Attachments, Sails, Boom & Rudder (mounted cleanly at the glTF mast & transom)
  const mastBaseLocal = rawToLocal(0, raw.gooseneckYRaw, raw.mastZRaw);
  const mastTopLocal = rawToLocal(0, raw.mastTopYRaw, raw.mastZRaw);
  const forestayTackLocal = rawToLocal(0, raw.forestayTackYRaw, raw.forestayTackZRaw);
  const jibHeadLocal = rawToLocal(0, raw.jibHeadYRaw, raw.mastZRaw);
  const rudderPosLocal = rawToLocal(0, raw.rudderTopYRaw, raw.rudderPostZRaw);

  const boomLen = raw.boomLenRaw * s;
  const mastAboveBoom = Math.max(2.5, mastTopLocal.y - mastBaseLocal.y - 0.22 * scaleFactor);

  // Materials for our procedural sails, boom, rudder & fittings
  const boomMat = new THREE.MeshStandardMaterial({
    color: meta.shipFamily === 'j80' ? 0x1e293b : 0xdde5ee,
    roughness: 0.3,
    metalness: 0.82,
  });
  const podDarkMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.38,
    metalness: 0.45,
  });
  const rudderMat = new THREE.MeshStandardMaterial({
    color: meta.shipFamily === 'j80' ? 0x1e293b : 0x26292e,
    roughness: 0.4,
    metalness: 0.12,
  });
  const stainlessMat = new THREE.MeshStandardMaterial({
    color: 0xd8dee6,
    roughness: 0.18,
    metalness: 0.92,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4a438,
    roughness: 0.22,
    metalness: 0.88,
  });
  const sailMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.sailCloth,
    roughness: 0.72,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const jibSailMat = new THREE.MeshStandardMaterial({
    color: 0xf6f3ea,
    roughness: 0.72,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const navLightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.0,
    roughness: 0.3,
  });
  const portNavMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: 0xef4444,
    emissiveIntensity: 0.0,
    roughness: 0.25,
  });
  const stbdNavMat = new THREE.MeshStandardMaterial({
    color: 0x14532d,
    emissive: 0x22c55e,
    emissiveIntensity: 0.0,
    roughness: 0.25,
  });
  const cabinLampMat = new THREE.MeshStandardMaterial({
    color: 0xffd28a,
    emissive: 0xffb347,
    emissiveIntensity: 1.1,
    roughness: 0.4,
  });
  const vhfScreenMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.vhfLiveTex,
    emissive: 0xffffff,
    emissiveMap: textures.vhfLiveTex,
    emissiveIntensity: 0.95,
    roughness: 0.25,
  });
  const windvaneBtnMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 0.2,
  });

  disposables.push(
    boomMat,
    podDarkMat,
    rudderMat,
    stainlessMat,
    brassMat,
    sailMat,
    jibSailMat,
    navLightMat,
    portNavMat,
    stbdNavMat,
    cabinLampMat,
    vhfScreenMat,
    windvaneBtnMat,
  );

  // 1. Procedural NACA Foil Rudder (pivots dynamically at the glTF rudder stock)
  const rudderGeo = createNacaFoilGeometry(
    raw.rudderChordRootRaw * s,
    raw.rudderChordTipRaw * s,
    raw.rudderDepthRaw * s,
    0.05 * scaleFactor,
    0.14,
  );
  disposables.push(rudderGeo);
  const rudderMesh = new THREE.Mesh(rudderGeo, rudderMat);
  rudderMesh.position.copy(rudderPosLocal);
  hullPivot.add(rudderMesh);

  // 2. Procedural Boom + Rigid Vang + Full-Battened Mainsail + Telltales attached at glTF Mast
  const boomPivot = new THREE.Group();
  boomPivot.position.copy(mastBaseLocal);
  hullPivot.add(boomPivot);

  const boomGeo = new THREE.CylinderGeometry(0.036 * scaleFactor, 0.044 * scaleFactor, boomLen, 10);
  boomGeo.rotateX(Math.PI / 2);
  boomGeo.scale(0.82, 1.22, 1.0);
  disposables.push(boomGeo);
  const boomMesh = new THREE.Mesh(boomGeo, boomMat);
  boomMesh.position.set(0, 0, boomLen * 0.5);
  boomMesh.castShadow = !isSoftwareGl;
  boomPivot.add(boomMesh);
  registerInteractive(boomMesh, 'cycle-reef', 'Boom & Reefing Pennant (Click to Reef)');

  // Gooseneck collar + vang strut on mast
  const vangStart = new THREE.Vector3(0, -0.34 * scaleFactor, 0.02 * scaleFactor);
  const vangEnd = new THREE.Vector3(0, -0.02 * scaleFactor, boomLen * 0.28);
  const vangDir = new THREE.Vector3().subVectors(vangEnd, vangStart);
  const vangGeo = new THREE.CylinderGeometry(
    0.016 * scaleFactor,
    0.02 * scaleFactor,
    Math.max(0.05, vangDir.length()),
    8,
  );
  disposables.push(vangGeo);
  const vangMesh = new THREE.Mesh(vangGeo, podDarkMat);
  vangMesh.position.copy(vangStart).add(vangEnd).multiplyScalar(0.5);
  vangMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vangDir.normalize());
  boomPivot.add(vangMesh);

  const mainGeo = createSailGeometry(boomLen * 0.96, mastAboveBoom);
  disposables.push(mainGeo);
  const mainsailMesh = new THREE.Mesh(mainGeo, sailMat);
  mainsailMesh.position.set(0, 0.04 * scaleFactor, 0.04 * scaleFactor);
  mainsailMesh.castShadow = !isSoftwareGl;
  boomPivot.add(mainsailMesh);

  // Fiberglass battens curving with sail camber
  const battenMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
  disposables.push(battenMat);
  [0.24, 0.46, 0.68, 0.86].forEach((vFrac) => {
    const sailW = boomLen * 0.96;
    const rowWidth = sailW * (1 - vFrac * 0.87) + Math.sin(vFrac * Math.PI) * 0.12 * sailW;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 5; i++) {
      const u = 0.05 + (i / 5) * 0.92;
      const cx = Math.sin(u * Math.PI) * (1 - vFrac * 0.45) * (sailW * 0.088);
      pts.push(new THREE.Vector3(cx, vFrac * mastAboveBoom, u * rowWidth));
    }
    const batCurve = new THREE.CatmullRomCurve3(pts);
    const batGeo = new THREE.TubeGeometry(batCurve, 10, 0.01 * scaleFactor, 5, false);
    disposables.push(batGeo);
    mainsailMesh.add(new THREE.Mesh(batGeo, battenMat));
  });

  // Leech telltales
  const telltales: THREE.Mesh[] = [];
  const ttGeo = new THREE.BoxGeometry(0.015 * scaleFactor, 0.024 * scaleFactor, 0.22 * scaleFactor);
  const ttRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  disposables.push(ttGeo, ttRedMat);
  [0.28, 0.52, 0.76].forEach((hFrac) => {
    const tt = new THREE.Mesh(ttGeo, ttRedMat);
    tt.position.set(0, mastAboveBoom * hFrac, boomLen * 0.96 * (1 - hFrac * 0.82) + 0.12 * scaleFactor);
    boomPivot.add(tt);
    telltales.push(tt);
  });

  // 3. Procedural Headsail (Jib) mounted & pivoted strictly around the glTF forestay axis
  const forestayRakeZ = Math.max(0.5, mastBaseLocal.z - forestayTackLocal.z);
  const jibHeight = Math.max(2.0, jibHeadLocal.y - forestayTackLocal.y);
  const jibFoot = forestayRakeZ * 0.92;
  const jibGeo = createJibGeometry(jibFoot, forestayRakeZ, jibHeight, 8, 12);
  disposables.push(jibGeo);
  const jibMesh = new THREE.Mesh(jibGeo, jibSailMat);
  jibMesh.position.copy(forestayTackLocal);
  jibMesh.castShadow = !isSoftwareGl;
  hullPivot.add(jibMesh);
  const jibStayAxis = new THREE.Vector3(0, jibHeight, forestayRakeZ).normalize();

  // Cutter inner staysail (when spec.hasStaysail) pinned along inner forestay axis
  let staysailMesh: THREE.Mesh | null = null;
  let staysailStayAxis: THREE.Vector3 | null = null;
  if (spec.hasStaysail) {
    const stayTackZ = THREE.MathUtils.lerp(forestayTackLocal.z, mastBaseLocal.z, 0.34);
    const stayRakeZ = mastBaseLocal.z - stayTackZ;
    const stayHeight = jibHeight * 0.68;
    const stayGeo = createJibGeometry(stayRakeZ * 0.88, stayRakeZ, stayHeight, 6, 10);
    disposables.push(stayGeo);
    staysailMesh = new THREE.Mesh(stayGeo, jibSailMat);
    staysailMesh.position.set(0, forestayTackLocal.y + 0.02 * scaleFactor, stayTackZ);
    staysailMesh.castShadow = !isSoftwareGl;
    hullPivot.add(staysailMesh);
    staysailStayAxis = new THREE.Vector3(0, stayHeight, stayRakeZ).normalize();
    registerInteractive(staysailMesh, 'toggle-staysail', 'Cutter Staysail (Click to Furl/Set)');
  }

  // 4. Masthead Tricolor / Anchor Nav Lamp & Port/Starboard Bow Lamps
  const navLightGeo = new THREE.SphereGeometry(0.065 * scaleFactor, 10, 10);
  disposables.push(navLightGeo);
  const navLight = new THREE.Mesh(navLightGeo, navLightMat);
  navLight.position.copy(mastTopLocal).add(new THREE.Vector3(0, 0.07 * scaleFactor, 0));
  hullPivot.add(navLight);

  const sideLampGeo = new THREE.SphereGeometry(0.04 * scaleFactor, 8, 8);
  disposables.push(sideLampGeo);
  const portLamp = new THREE.Mesh(sideLampGeo, portNavMat);
  portLamp.position.set(-B * 0.14, forestayTackLocal.y + 0.12 * scaleFactor, forestayTackLocal.z + 0.22 * scaleFactor);
  const stbdLamp = new THREE.Mesh(sideLampGeo, stbdNavMat);
  stbdLamp.position.set(B * 0.14, forestayTackLocal.y + 0.12 * scaleFactor, forestayTackLocal.z + 0.22 * scaleFactor);
  hullPivot.add(portLamp, stbdLamp);

  // 5. Compact Cockpit Compass Card, Anchor + Chain, & Windvane Paddle
  const cockpitCenterLocal = rawToLocal(0, raw.deckCockpitYRaw, raw.deckCockpitZRaw);
  const compBaseGeo = new THREE.CylinderGeometry(0.095 * scaleFactor, 0.115 * scaleFactor, 0.1 * scaleFactor, 16);
  const compFaceGeo = new THREE.CircleGeometry(0.08 * scaleFactor, 18);
  const compFaceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.compassDial,
    roughness: 0.3,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.2,
  });
  disposables.push(compBaseGeo, compFaceGeo, compFaceMat);

  const binnacle = new THREE.Mesh(compBaseGeo, brassMat);
  binnacle.position.set(
    0,
    cockpitCenterLocal.y + (meta.shipFamily === 'sergei' ? 0.56 * scaleFactor : 0.28 * scaleFactor),
    cockpitCenterLocal.z - (meta.shipFamily === 'sergei' ? 0.28 * scaleFactor : 0.45 * scaleFactor),
  );
  hullPivot.add(binnacle);
  const compassCardMesh = new THREE.Mesh(compFaceGeo, compFaceMat);
  compassCardMesh.rotation.x = -Math.PI / 2;
  compassCardMesh.position.set(0, 0.055 * scaleFactor, 0);
  binnacle.add(compassCardMesh);
  registerInteractive(binnacle, 'toggle-instruments', 'Binnacle Compass & Instruments');

  let helmControlMesh: THREE.Object3D;
  if (spec.hasWheel) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.copy(cockpitCenterLocal).add(new THREE.Vector3(0, 0.67 * scaleFactor, 0.34 * scaleFactor));
    const wheelRimGeo = new THREE.TorusGeometry(0.36 * scaleFactor, 0.021 * scaleFactor, 10, 28);
    const wheelHubGeo = new THREE.SphereGeometry(0.045 * scaleFactor, 10, 8);
    const wheelSpokeGeo = new THREE.CylinderGeometry(0.012 * scaleFactor, 0.012 * scaleFactor, 0.34 * scaleFactor, 7);
    disposables.push(wheelRimGeo, wheelHubGeo, wheelSpokeGeo);
    const wheelRim = new THREE.Mesh(wheelRimGeo, stainlessMat);
    const wheelHub = new THREE.Mesh(wheelHubGeo, brassMat);
    wheelGroup.add(wheelRim, wheelHub);
    for (let spoke = 0; spoke < 6; spoke++) {
      const spokeMesh = new THREE.Mesh(wheelSpokeGeo, stainlessMat);
      spokeMesh.rotation.z = (spoke * Math.PI) / 3;
      wheelGroup.add(spokeMesh);
    }
    hullPivot.add(wheelGroup);
    helmControlMesh = wheelGroup;
  } else {
    const tillerGroup = new THREE.Group();
    const tillerGeo = new THREE.BoxGeometry(0.055 * scaleFactor, 0.055 * scaleFactor, 1.08 * scaleFactor);
    const tillerGripGeo = new THREE.CylinderGeometry(0.034 * scaleFactor, 0.034 * scaleFactor, 0.21 * scaleFactor, 8);
    disposables.push(tillerGeo, tillerGripGeo);
    const tiller = new THREE.Mesh(tillerGeo, brassMat);
    tiller.position.z = -0.48 * scaleFactor;
    const grip = new THREE.Mesh(tillerGripGeo, stainlessMat);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(0, 0.02 * scaleFactor, -0.98 * scaleFactor);
    tillerGroup.add(tiller, grip);
    tillerGroup.position.copy(rudderPosLocal);
    hullPivot.add(tillerGroup);
    helmControlMesh = tillerGroup;
  }

  // Add a real-time helm repeater and controllable sheet winches to the imported cockpit.
  const helmHousingGeo = new THREE.BoxGeometry(0.52 * scaleFactor, 0.34 * scaleFactor, 0.065 * scaleFactor);
  const helmScreenGeo = new THREE.PlaneGeometry(0.46 * scaleFactor, 0.28 * scaleFactor);
  const helmHousingMat = new THREE.MeshStandardMaterial({ color: 0x111a21, roughness: 0.34, metalness: 0.5 });
  const helmScreenMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.helmInstrumentTex,
    emissive: 0xffffff,
    emissiveMap: textures.helmInstrumentTex,
    emissiveIntensity: 0.82,
    roughness: 0.18,
  });
  disposables.push(helmHousingGeo, helmScreenGeo, helmHousingMat, helmScreenMat);
  const helmDisplay = new THREE.Mesh(helmHousingGeo, helmHousingMat);
  helmDisplay.position.copy(cockpitCenterLocal).add(new THREE.Vector3(0, 0.55 * scaleFactor, -0.18 * scaleFactor));
  hullPivot.add(helmDisplay);
  const helmScreen = new THREE.Mesh(helmScreenGeo, helmScreenMat);
  helmScreen.rotation.y = Math.PI;
  helmScreen.position.set(0, 0, -0.034 * scaleFactor);
  helmDisplay.add(helmScreen);
  registerInteractive(helmDisplay, 'toggle-instruments', 'Cockpit Wind / Speed / Depth Repeater');

  const winchGeo = new THREE.CylinderGeometry(0.075 * scaleFactor, 0.095 * scaleFactor, 0.14 * scaleFactor, 14);
  const winchHandleGeo = new THREE.BoxGeometry(0.20 * scaleFactor, 0.022 * scaleFactor, 0.028 * scaleFactor);
  const winchKnobGeo = new THREE.SphereGeometry(0.028 * scaleFactor, 8, 6);
  disposables.push(winchGeo, winchHandleGeo, winchKnobGeo);
  const makeSheetWinch = (x: number, material: THREE.Material, action: InteractiveAction, label: string) => {
    const group = new THREE.Group();
    group.position.set(x, cockpitCenterLocal.y + 0.20 * scaleFactor, cockpitCenterLocal.z - 0.12 * scaleFactor);
    const drum = new THREE.Mesh(winchGeo, material);
    const crank = new THREE.Mesh(winchHandleGeo, stainlessMat);
    crank.position.set(0.09 * scaleFactor, 0.085 * scaleFactor, 0);
    const knob = new THREE.Mesh(winchKnobGeo, podDarkMat);
    knob.position.set(0.19 * scaleFactor, 0.085 * scaleFactor, 0);
    group.add(drum, crank, knob);
    hullPivot.add(group);
    registerInteractive(group, action, label);
    return group;
  };
  const mainsheetWinch = makeSheetWinch(-B * 0.30, brassMat, 'trim-main-in', 'Mainsheet Winch (Click to Trim)');
  const jibsheetWinch = makeSheetWinch(B * 0.30, stainlessMat, 'trim-jib-in', 'Jib Sheet Winch (Click to Trim)');

  const transomMountLocal = rawToLocal(
    meta.shipFamily === 'j80' ? 0.24 : 45.0,
    meta.shipFamily === 'j80' ? -0.18 : 145.0,
    meta.shipFamily === 'j80' ? -3.14 : -795.0,
  );
  const vaneGroup = new THREE.Group();
  vaneGroup.position.copy(transomMountLocal);
  hullPivot.add(vaneGroup);

  const vanePostGeo = new THREE.CylinderGeometry(0.014 * scaleFactor, 0.016 * scaleFactor, 0.42 * scaleFactor, 8);
  const vaneGeo = new THREE.BoxGeometry(0.014 * scaleFactor, 0.22 * scaleFactor, 0.11 * scaleFactor);
  const vaneMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.42, metalness: 0.15 });
  disposables.push(vanePostGeo, vaneGeo, vaneMat);
  const vanePost = new THREE.Mesh(vanePostGeo, stainlessMat);
  vanePost.position.set(0, 0.18 * scaleFactor, 0);
  vaneGroup.add(vanePost);
  const windvanePaddle = new THREE.Mesh(vaneGeo, vaneMat);
  windvanePaddle.position.set(0, 0.38 * scaleFactor, 0.03 * scaleFactor);
  vaneGroup.add(windvanePaddle);
  registerInteractive(windvanePaddle, 'toggle-windvane', 'Windvane Self-Steering Clutch');

  // Bow Anchor & Rode Line tucked cleanly on bow stemhead
  const anchorGroup = new THREE.Group();
  const shankGeo = new THREE.BoxGeometry(0.035 * scaleFactor, 0.035 * scaleFactor, 0.26 * scaleFactor);
  const flukeGeo = new THREE.ConeGeometry(0.08 * scaleFactor, 0.15 * scaleFactor, 4);
  disposables.push(shankGeo, flukeGeo);
  const shank = new THREE.Mesh(shankGeo, stainlessMat);
  const fluke = new THREE.Mesh(flukeGeo, stainlessMat);
  fluke.rotation.x = Math.PI / 2;
  fluke.position.set(0, -0.025 * scaleFactor, -0.13 * scaleFactor);
  anchorGroup.add(shank, fluke);
  anchorGroup.position.set(
    0,
    forestayTackLocal.y - 0.03 * scaleFactor,
    forestayTackLocal.z + 0.08 * scaleFactor,
  );
  hullPivot.add(anchorGroup);
  registerInteractive(anchorGroup, 'toggle-anchor', 'Bow Anchor & Windlass');

  const chainGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, forestayTackLocal.y - 0.04 * scaleFactor, forestayTackLocal.z),
    new THREE.Vector3(0, -3.5, forestayTackLocal.z - L * 0.35),
  ]);
  const chainMat = new THREE.LineBasicMaterial({ color: 0xf59e0b });
  disposables.push(chainGeo, chainMat);
  const anchorChainLine = new THREE.Line(chainGeo, chainMat);
  anchorChainLine.visible = false;
  hullPivot.add(anchorChainLine);

  // Camera anchors in boat-local space matching the supplied GLB cockpit and companionway.
  const helmEyeLocal = rawToLocal(raw.helmEyeRaw[0], raw.helmEyeRaw[1], raw.helmEyeRaw[2]);
  const helmLookLocal = rawToLocal(raw.helmLookRaw[0], raw.helmLookRaw[1], raw.helmLookRaw[2]);
  const cabinEyeLocal = rawToLocal(raw.cabinEyeRaw[0], raw.cabinEyeRaw[1], raw.cabinEyeRaw[2]);
  const cabinLookLocal = rawToLocal(raw.cabinLookRaw[0], raw.cabinLookRaw[1], raw.cabinLookRaw[2]);

  // Procedural cabin furnishings fill the otherwise empty interior of the exterior GLBs.
  const cabinLength = Math.min(L * 0.44, Math.max(0.9 * scaleFactor, Math.abs(cabinEyeLocal.z - cabinLookLocal.z) * 0.5));
  const cabinWidth = Math.min(B * 0.58, 1.45 * scaleFactor);
  const cabinCenterZ = (cabinEyeLocal.z + cabinLookLocal.z) * 0.5;
  const cabinFloorY = Math.max(0.04 * scaleFactor, Math.min(cabinEyeLocal.y, cabinLookLocal.y) - 0.52 * scaleFactor);
  const cabinInterior = new THREE.Group();
  cabinInterior.position.set(0, cabinFloorY, cabinCenterZ);
  hullPivot.add(cabinInterior);

  const cabinWoodMat = new THREE.MeshStandardMaterial({ color: 0x64452f, roughness: 0.72 });
  const cabinTeakMat = new THREE.MeshStandardMaterial({ color: 0x98734b, roughness: 0.76 });
  const berthMat = new THREE.MeshStandardMaterial({ color: 0xc5c8c2, roughness: 0.9 });
  const switchPanelMat = new THREE.MeshStandardMaterial({ map: textures.switchPanel, roughness: 0.48, metalness: 0.2 });
  const plotterMat = new THREE.MeshStandardMaterial({
    map: textures.chartPlotterTex,
    emissiveMap: textures.chartPlotterTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.55,
    roughness: 0.24,
  });
  disposables.push(cabinWoodMat, cabinTeakMat, berthMat, switchPanelMat, plotterMat);

  const addCabinPart = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: THREE.Vector3,
  ): THREE.Mesh => {
    disposables.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = !isSoftwareGl;
    mesh.receiveShadow = !isSoftwareGl;
    cabinInterior.add(mesh);
    return mesh;
  };

  const cabinFloorGeo = new THREE.BoxGeometry(cabinWidth * 0.88, 0.045 * scaleFactor, cabinLength * 0.92);
  addCabinPart(cabinFloorGeo, cabinTeakMat, new THREE.Vector3(0, 0.02 * scaleFactor, 0));

  // Port and starboard settees double as berths, leaving a center passage to the companionway.
  for (const side of [-1, 1]) {
    const berthGeo = new THREE.BoxGeometry(cabinWidth * 0.34, 0.15 * scaleFactor, cabinLength * 0.48);
    addCabinPart(
      berthGeo,
      berthMat,
      new THREE.Vector3(side * cabinWidth * 0.285, 0.12 * scaleFactor, -cabinLength * 0.11),
    );
    const berthBaseGeo = new THREE.BoxGeometry(cabinWidth * 0.35, 0.22 * scaleFactor, cabinLength * 0.5);
    addCabinPart(
      berthBaseGeo,
      cabinWoodMat,
      new THREE.Vector3(side * cabinWidth * 0.285, 0.015 * scaleFactor, -cabinLength * 0.11),
    );
  }

  // Forward V-berth cushions and a low divider mark the forepeak.
  for (const side of [-1, 1]) {
    const vBerthGeo = new THREE.BoxGeometry(cabinWidth * 0.30, 0.13 * scaleFactor, cabinLength * 0.30);
    const vBerth = addCabinPart(
      vBerthGeo,
      berthMat,
      new THREE.Vector3(side * cabinWidth * 0.19, 0.16 * scaleFactor, -cabinLength * 0.32),
    );
    vBerth.rotation.y = side * 0.17;
  }

  // Port navigation table with a live chart repeater; starboard galley with sink and cooker.
  const navTableGeo = new THREE.BoxGeometry(cabinWidth * 0.35, 0.075 * scaleFactor, cabinLength * 0.22);
  addCabinPart(navTableGeo, cabinWoodMat, new THREE.Vector3(-cabinWidth * 0.28, 0.48 * scaleFactor, cabinLength * 0.24));
  const navScreenGeo = new THREE.PlaneGeometry(cabinWidth * 0.25, cabinLength * 0.15);
  const navScreen = addCabinPart(
    navScreenGeo,
    plotterMat,
    new THREE.Vector3(-cabinWidth * 0.28, 0.525 * scaleFactor, cabinLength * 0.24),
  );
  navScreen.rotation.x = -Math.PI / 2;
  registerInteractive(navScreen, 'toggle-instruments', 'Cabin Chart Plotter');

  const galleyCounterGeo = new THREE.BoxGeometry(cabinWidth * 0.34, 0.08 * scaleFactor, cabinLength * 0.26);
  addCabinPart(galleyCounterGeo, cabinWoodMat, new THREE.Vector3(cabinWidth * 0.28, 0.48 * scaleFactor, cabinLength * 0.18));
  const sinkGeo = new THREE.BoxGeometry(cabinWidth * 0.12, 0.035 * scaleFactor, cabinLength * 0.11);
  addCabinPart(sinkGeo, stainlessMat, new THREE.Vector3(cabinWidth * 0.30, 0.54 * scaleFactor, cabinLength * 0.23));
  const stoveGeo = new THREE.BoxGeometry(cabinWidth * 0.16, 0.025 * scaleFactor, cabinLength * 0.12);
  addCabinPart(stoveGeo, stainlessMat, new THREE.Vector3(cabinWidth * 0.27, 0.54 * scaleFactor, cabinLength * 0.08));
  const burnerGeo = new THREE.CylinderGeometry(0.035 * scaleFactor, 0.035 * scaleFactor, 0.018 * scaleFactor, 12);
  addCabinPart(burnerGeo, podDarkMat, new THREE.Vector3(cabinWidth * 0.23, 0.56 * scaleFactor, cabinLength * 0.08));
  addCabinPart(burnerGeo.clone(), podDarkMat, new THREE.Vector3(cabinWidth * 0.31, 0.56 * scaleFactor, cabinLength * 0.08));

  const fridgeGeo = new THREE.BoxGeometry(cabinWidth * 0.16, 0.28 * scaleFactor, cabinLength * 0.16);
  const fridge = addCabinPart(fridgeGeo, podDarkMat, new THREE.Vector3(cabinWidth * 0.30, 0.20 * scaleFactor, cabinLength * 0.32));
  registerInteractive(fridge, 'toggle-fridge', '12V Galley Fridge & Provisions');

  const vhfGeo = new THREE.BoxGeometry(cabinWidth * 0.15, 0.14 * scaleFactor, 0.06 * scaleFactor);
  const vhf = addCabinPart(vhfGeo, podDarkMat, new THREE.Vector3(cabinWidth * 0.43, 0.68 * scaleFactor, cabinLength * 0.29));
  vhf.rotation.y = -Math.PI / 2;
  registerInteractive(vhf, 'toggle-vhf', 'VHF Radio');
  const vhfScreenGeo = new THREE.PlaneGeometry(cabinWidth * 0.12, 0.10 * scaleFactor);
  const vhfScreen = addCabinPart(
    vhfScreenGeo,
    vhfScreenMat,
    new THREE.Vector3(cabinWidth * 0.395, 0.68 * scaleFactor, cabinLength * 0.29),
  );
  vhfScreen.rotation.y = -Math.PI / 2;

  // Port 12V breaker panel with independent switches bound to the simulation state.
  const breakerPanelGeo = new THREE.PlaneGeometry(cabinWidth * 0.22, 0.28 * scaleFactor);
  const breakerPanel = addCabinPart(
    breakerPanelGeo,
    switchPanelMat,
    new THREE.Vector3(-cabinWidth * 0.43, 0.67 * scaleFactor, cabinLength * 0.28),
  );
  breakerPanel.rotation.y = Math.PI / 2;
  const breakerMeshes: Record<string, THREE.Mesh> = {};
  const breakerActions: Array<{ key: string; action: InteractiveAction; label: string }> = [
    { key: 'navLights', action: 'toggle-nav-lights', label: 'Breaker: Navigation Lights' },
    { key: 'cabinLights', action: 'toggle-cabin-lights', label: 'Breaker: Cabin Lights' },
    { key: 'vhfRadio', action: 'toggle-vhf', label: 'Breaker: VHF Radio' },
    { key: 'fridgeOn', action: 'toggle-fridge', label: 'Breaker: Galley Fridge' },
    { key: 'bilgePump', action: 'toggle-bilge', label: 'Breaker: Bilge Pump' },
    { key: 'instruments', action: 'toggle-instruments', label: 'Breaker: Navigation Instruments' },
  ];
  breakerActions.forEach(({ key, action, label }, index) => {
    const switchGeo = new THREE.BoxGeometry(0.052 * scaleFactor, 0.056 * scaleFactor, 0.05 * scaleFactor);
    const switchMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.45, metalness: 0.25 });
    disposables.push(switchMat);
    const switchMesh = addCabinPart(
      switchGeo,
      switchMat,
      new THREE.Vector3(-cabinWidth * 0.35, (0.76 - index * 0.085) * scaleFactor, cabinLength * 0.28),
    );
    switchMesh.rotation.y = Math.PI / 2;
    breakerMeshes[key] = switchMesh;
    registerInteractive(switchMesh, action, label);
  });

  // Three-button autopilot head and a warm companionway dome lamp.
  const autopilotGeo = new THREE.BoxGeometry(0.20 * scaleFactor, 0.08 * scaleFactor, 0.09 * scaleFactor);
  const autopilot = addCabinPart(autopilotGeo, podDarkMat, new THREE.Vector3(0, 0.34 * scaleFactor, cabinLength * 0.30));
  const autopilotActions: Array<{ x: number; action: InteractiveAction; label: string; color: number }> = [
    { x: -0.07, action: 'steer-port-5', label: 'Autopilot: Steer Port -5°', color: 0x38bdf8 },
    { x: 0, action: 'toggle-windvane', label: 'Autopilot: Windvane Clutch', color: 0x10b981 },
    { x: 0.07, action: 'steer-stbd-5', label: 'Autopilot: Steer Starboard +5°', color: 0xf59e0b },
  ];
  autopilotActions.forEach(({ x, action, label, color }) => {
    const buttonGeo = new THREE.CylinderGeometry(0.025 * scaleFactor, 0.025 * scaleFactor, 0.018 * scaleFactor, 10);
    const buttonMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.28, roughness: 0.38 });
    disposables.push(buttonMat);
    const button = new THREE.Mesh(buttonGeo, buttonMat);
    button.position.set(x * scaleFactor, 0.39 * scaleFactor, cabinLength * 0.30);
    cabinInterior.add(button);
    registerInteractive(button, action, label);
  });

  const cabinLampGeo = new THREE.CylinderGeometry(0.065 * scaleFactor, 0.065 * scaleFactor, 0.035 * scaleFactor, 14);
  const cabinLamp = addCabinPart(cabinLampGeo, cabinLampMat, new THREE.Vector3(0, 0.84 * scaleFactor, -cabinLength * 0.04));
  registerInteractive(cabinLamp, 'toggle-cabin-lights', 'Cabin Dome Light');
  const cabinLight = new THREE.PointLight(0xffcb7d, 0.9, 4.5 * scaleFactor, 1.4);
  cabinLight.position.set(0, 0.80 * scaleFactor, -cabinLength * 0.04);
  cabinInterior.add(cabinLight);

  return {
    root,
    hullPivot,
    boomPivot,
    mainsailMesh,
    jibMesh,
    staysailMesh,
    rudderMesh,
    helmControlMesh,
    mainsheetWinch,
    jibsheetWinch,
    windvanePaddle,
    compassCardMesh,
    navLightMat,
    portNavMat,
    stbdNavMat,
    cabinLight,
    cabinLampMat,
    vhfScreenMat,
    windvaneBtnMat,
    anchorGroup,
    anchorChainLine,
    breakerMeshes,
    telltales,
    interactables,
    helmEyeLocal,
    helmLookLocal,
    cabinEyeLocal,
    cabinLookLocal,
    deckLengthM: L,
    hullLengthM: L,
    hullBeamM: B,
    hullScaleFactor: scaleFactor,
    cabinRoofBounds: {
      minX: -B * 0.3,
      maxX: B * 0.3,
      minZ: -L * 0.25,
      maxZ: L * 0.12,
    },
    exteriorModelId,
    jibStayAxis,
    staysailStayAxis,
    isExteriorReady: () => exteriorReady,
    dispose: () => {
      disposed = true;
      if (loadedExteriorClone) {
        exteriorHolder.remove(loadedExteriorClone);
      }
      disposables.forEach((d) => d.dispose());
    },
  };
}

export function syncBoatVisuals(
  boat: BuiltBoat,
  state: SimulationState,
  elapsedSec: number,
  waveMotion?: { heaveM: number; pitchRad: number; rollRad: number },
): void {
  boat.root.rotation.y = -(state.headingDeg * Math.PI) / 180;
  const heelRad = (state.heelDeg * Math.PI) / 180;
  const pitchDamp = Math.max(0.5, state.vesselCfg?.pitchDampening ?? 1.0);
  const wavePitch =
    ((state.wavePitchDeg ?? 0) * Math.PI) / 180 +
    (waveMotion
      ? waveMotion.pitchRad / pitchDamp
      : Math.sin(elapsedSec * 0.85) * ((0.01 + state.weather.waveHeightM * 0.006) / pitchDamp));
  const waveRoll = waveMotion
    ? waveMotion.rollRad * 0.75
    : Math.cos(elapsedSec * 0.72) * (0.009 + state.weather.waveHeightM * 0.007);
  boat.hullPivot.rotation.z = heelRad + waveRoll;
  boat.hullPivot.rotation.x = wavePitch;
  const heave = waveMotion
    ? waveMotion.heaveM + 0.025
    : Math.sin(elapsedSec * 0.95) * (0.04 + state.weather.waveHeightM * 0.03);
  boat.hullPivot.position.y = heave;

  const rudRad = (state.rudderAngleDeg * Math.PI) / 180;
  boat.rudderMesh.rotation.y = rudRad;
  if (boat.helmControlMesh) {
    boat.helmControlMesh.rotation.y = -rudRad * 0.7;
    boat.helmControlMesh.rotation.z = rudRad * 2.2;
  }
  boat.mainsheetWinch.rotation.y = (state.mainsheetPct / 100) * Math.PI * 2;
  boat.jibsheetWinch.rotation.y = (state.jibsheetPct / 100) * Math.PI * 2;

  boat.compassCardMesh.rotation.z = (state.headingDeg * Math.PI) / 180;

  const boomSide = state.boomSide ?? -Math.sign(state.apparentWindAngleDeg || -1);
  const boomRad = ((state.boomAngleDeg ?? boomSide * 28) * Math.PI) / 180;
  const luffFlutter = state.isLuffing ? Math.sin(elapsedSec * 18) * 0.09 : 0;
  boat.boomPivot.rotation.y = boomRad + luffFlutter;

  const reefScaleY = state.reefLevel === 0 ? 1.0 : state.reefLevel === 1 ? 0.73 : 0.48;
  boat.mainsailMesh.scale.set(
    boomSide * (0.7 + (1 - state.mainsheetPct / 100) * 0.65),
    reefScaleY,
    1.0,
  );

  boat.telltales.forEach((tt, idx) => {
    tt.rotation.y = state.isLuffing
      ? Math.sin(elapsedSec * 22 + idx * 1.4) * 0.65
      : Math.sin(elapsedSec * 4.5 + idx) * 0.06;
  });

  boat.jibMesh.visible = state.jibDeployed;
  if (state.jibDeployed) {
    const jibOut = ((100 - state.jibsheetPct) / 100) * 0.52 + 0.06;
    boat.jibMesh.quaternion.setFromAxisAngle(
      boat.jibStayAxis,
      boomSide * jibOut + luffFlutter * 0.7,
    );
    boat.jibMesh.scale.x = boomSide * (0.75 + (1 - state.jibsheetPct / 100) * 0.5);
  }

  if (boat.staysailMesh && boat.staysailStayAxis) {
    boat.staysailMesh.visible = state.staysailDeployed;
    if (state.staysailDeployed) {
      const stayOut = ((100 - state.jibsheetPct) / 100) * 0.38 + 0.05;
      boat.staysailMesh.quaternion.setFromAxisAngle(
        boat.staysailStayAxis,
        boomSide * stayOut + luffFlutter * 0.5,
      );
      boat.staysailMesh.scale.x = boomSide * (0.78 + (1 - state.jibsheetPct / 100) * 0.42);
    }
  }

  boat.windvanePaddle.rotation.y =
    state.autopilotMode === 'windvane' ? Math.sin(elapsedSec * 2.5) * 0.15 : 0;

  boat.anchorGroup.visible = !state.anchor.deployed;
  boat.anchorChainLine.visible = state.anchor.deployed;

  boat.navLightMat.emissiveIntensity = state.electrical.navLights ? 2.2 : 0.0;
  boat.portNavMat.emissiveIntensity = state.electrical.navLights ? 1.8 : 0.0;
  boat.stbdNavMat.emissiveIntensity = state.electrical.navLights ? 1.8 : 0.0;
  boat.cabinLight.intensity = state.electrical.cabinLights ? 1.2 : 0.0;
  boat.cabinLampMat.emissiveIntensity = state.electrical.cabinLights ? 1.2 : 0.05;
  boat.vhfScreenMat.emissiveIntensity = state.electrical.vhfRadio ? 0.95 : 0.15;
  boat.windvaneBtnMat.emissiveIntensity =
    state.autopilotMode === 'windvane' ? 1.4 : state.autopilotMode === 'compass' ? 0.65 : 0.15;
  boat.windvaneBtnMat.emissive.setHex(state.autopilotMode === 'compass' ? 0xf59e0b : 0x10b981);

  Object.entries(boat.breakerMeshes).forEach(([key, mesh]) => {
    const isOn = Boolean(state.electrical[key as keyof typeof state.electrical]);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(isOn ? 0x10b981 : 0x475569);
    mat.emissive.setHex(isOn ? 0x10b981 : 0x000000);
    mat.emissiveIntensity = isOn ? 0.85 : 0.0;
    mesh.rotation.x = isOn ? -0.25 : 0.25;
  });
}

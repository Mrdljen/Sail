import * as THREE from 'three';
import { BOAT_SPECS } from '../sim/boats';
import type { BoatId, SimulationState } from '../types/sailing';
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
  dispose: () => void;
}

function createSailGeometry(width: number, height: number, segX = 12, segY = 14): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= segY; iy++) {
    const v = iy / segY;
    // Roach curve on leech + smooth Bermuda taper
    const roach = Math.sin(v * Math.PI) * 0.12 * width;
    const rowWidth = width * (1 - v * 0.87) + roach;
    for (let ix = 0; ix <= segX; ix++) {
      const u = ix / segX;
      const z = u * rowWidth;
      const y = v * height;
      const camber = Math.sin(u * Math.PI) * (1 - v * 0.45) * 0.25;
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
      // Realistic high-cut clew rise keeps jib/staysail foot clear of coachroof & cabin
      const y = v * height + (1 - v) * u * (height * 0.11);
      const camber = Math.sin(u * Math.PI) * (1 - v * 0.5) * 0.19;
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

function createHullGeometry(
  length: number,
  beam: number,
  depth: number,
  scaleFactor: number,
  clinkerLapstrake = false,
): THREE.BufferGeometry {
  const stations = 22;
  const profilePts = 13;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iz = 0; iz <= stations; iz++) {
    const t = iz / stations; // 0 = bow, 1 = stern
    const z = (t - 0.5) * length;

    const widthFactor =
      t < 0.52
        ? Math.pow(Math.sin((t / 0.52) * (Math.PI / 2)), 0.76)
        : 1 - Math.pow((t - 0.52) / 0.48, 1.75) * 0.34;

    const sheerY = hullGunwaleY(t, scaleFactor);
    const bowFlare = t < 0.25 ? (0.25 - t) * 0.32 : 0;
    const keelRock = (t < 0.16 ? (0.16 - t) * 1.2 : t > 0.84 ? (t - 0.84) * 0.9 : 0) * scaleFactor;

    for (let ip = 0; ip < profilePts * 2 - 1; ip++) {
      const sideIdx = ip - (profilePts - 1);
      const s = Math.abs(sideIdx) / (profilePts - 1);
      const sign = Math.sign(sideIdx);

      // Clinker strake ridge modulation on Folkboat topsides
      const lapStep = clinkerLapstrake && s > 0.42 ? Math.sin(s * Math.PI * 10) * 0.016 : 0;
      const flareExpand = 1 + bowFlare * Math.pow(s, 1.5);
      const x = sign * (Math.pow(s, 0.72) * (beam * 0.5) * widthFactor * flareExpand + lapStep);
      const y = -depth * (1 - Math.pow(s, 1.45)) + keelRock * (1 - s) + sheerY * s + (1 - s) * 0.18 * scaleFactor;

      positions.push(x, y, z);
      uvs.push(ip / (profilePts * 2 - 2), t);
    }
  }

  const rowStride = profilePts * 2 - 1;
  for (let iz = 0; iz < stations; iz++) {
    for (let ip = 0; ip < rowStride - 1; ip++) {
      const a = iz * rowStride + ip;
      const b = a + 1;
      const c = a + rowStride;
      const d = c + 1;
      indices.push(a, c, d, a, d, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createFlushDeckGeometry(
  length: number,
  beam: number,
  scaleFactor: number,
  cockpitZ: number,
  cockpitLen: number,
  roofZ: number,
  roofLength: number,
  roofWidth: number,
): THREE.BufferGeometry {
  // Cambered sheer-matched deck shell with exact cockpit & cabin interior cutouts
  const stations = 28;
  const acrossPts = 13;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const cpStartZ = cockpitZ - cockpitLen * 0.45;
  const cpEndZ = cockpitZ + cockpitLen * 0.45;
  const cpHalfW = beam * 0.25;

  const cbStartZ = roofZ - roofLength * 0.48;
  const cbEndZ = roofZ + roofLength * 0.48;
  const cbHalfW = roofWidth * 0.46;

  for (let iz = 0; iz <= stations; iz++) {
    const t = iz / stations;
    const z = (t - 0.5) * length;
    const hw = hullHalfWidth(t, beam);
    const sheerY = hullGunwaleY(t, scaleFactor);
    const camberPeak = 0.045 * scaleFactor * Math.sin(t * Math.PI);

    for (let ix = 0; ix < acrossPts; ix++) {
      const u = (ix / (acrossPts - 1)) * 2 - 1; // -1 port .. +1 stbd
      const x = u * hw;
      const camber = camberPeak * (1 - u * u);
      const inCabin = z >= cbStartZ && z <= cbEndZ && Math.abs(x) <= cbHalfW;
      const inCockpit = z >= cpStartZ && z <= cpEndZ && Math.abs(x) <= cpHalfW;
      const y = inCabin ? 0.01 * scaleFactor : inCockpit ? 0.13 * scaleFactor : sheerY + camber;
      positions.push(x, y, z);
      uvs.push(ix / (acrossPts - 1), t);
    }
  }

  for (let iz = 0; iz < stations; iz++) {
    for (let ix = 0; ix < acrossPts - 1; ix++) {
      const a = iz * acrossPts + ix;
      const b = a + 1;
      const c = a + acrossPts;
      const d = c + 1;
      indices.push(a, c, d, a, d, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildSailboatModel(
  boatId: BoatId,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): BuiltBoat {
  const spec = BOAT_SPECS[boatId] ?? BOAT_SPECS['elan-19'];
  // Proportional hull sizing from real LOA (Elan 19 = 1.0x .. Hallberg 42 = 1.62x)
  const scaleFactor = 0.78 + (spec.lengthFt / 19) * 0.22 + (spec.lengthFt >= 32 ? 0.14 : 0);
  const L = 5.9 * scaleFactor;
  const B = (spec.beamFt / 7.8) * 2.38 * Math.pow(scaleFactor, 0.72);
  const hullDepth = 0.88 * scaleFactor;
  const mastH = 7.4 * scaleFactor * (spec.lengthFt >= 36 ? 1.05 : 1.0);
  const boomL = 2.82 * scaleFactor;

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

  // Varied PBR Material Set
  const hullMat = new THREE.MeshPhysicalMaterial({
    color: spec.hullColorHex,
    roughness: boatId === 'folkboat-25' ? 0.45 : 0.26,
    metalness: 0.04,
    clearcoat: boatId === 'folkboat-25' ? 0.35 : 0.72,
    clearcoatRoughness: 0.16,
    side: THREE.DoubleSide,
  });
  const bootStripeMat = new THREE.MeshStandardMaterial({
    color: spec.trimColorHex,
    roughness: 0.42,
    metalness: 0.14,
  });
  const teakMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.teakColor,
    bumpMap: textures.teakBump,
    bumpScale: 0.016,
    roughness: 0.78,
    metalness: 0.0,
  });
  const mahoganyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.mahoganyColor,
    roughness: 0.40,
    metalness: 0.05,
  });
  const teakHollyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.teakHollyTex,
    roughness: 0.34,
    metalness: 0.04,
  });
  const creamLinerMat = new THREE.MeshStandardMaterial({
    color: 0xf4efe4,
    roughness: 0.65,
    metalness: 0.02,
  });
  const ropeMat = new THREE.MeshStandardMaterial({
    color: 0xc2a878,
    roughness: 0.88,
    metalness: 0.0,
  });
  const coachroofMat = new THREE.MeshStandardMaterial({
    color: boatId === 'folkboat-25' ? 0x6f381c : 0xf1ede4,
    roughness: 0.44,
    metalness: 0.04,
  });
  const dodgerMat = new THREE.MeshStandardMaterial({
    color: boatId === 'hallberg-42' ? 0xf1f5f9 : boatId === 'contessa-32' ? 0x1e3a5f : 0x2c4c3e,
    roughness: 0.68,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const cushionMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a5f,
    roughness: 0.85,
    metalness: 0.0,
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
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x9bd2e8,
    roughness: 0.1,
    metalness: 0.12,
    transparent: true,
    opacity: isSoftwareGl ? 0.36 : 0.46,
    transmission: isSoftwareGl ? 0 : 0.55,
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

  disposables.push(
    hullMat,
    bootStripeMat,
    teakMat,
    mahoganyMat,
    teakHollyMat,
    creamLinerMat,
    ropeMat,
    coachroofMat,
    dodgerMat,
    cushionMat,
    stainlessMat,
    brassMat,
    sailMat,
    glassMat,
    navLightMat,
    portNavMat,
    stbdNavMat,
    cabinLampMat,
    vhfScreenMat,
  );

  // 1. Primary Silhouette: Sculpted Hull + Tapered Transom + Sheer Trim Band
  const hullGeo = createHullGeometry(L, B, hullDepth, scaleFactor, boatId === 'folkboat-25');
  disposables.push(hullGeo);
  const hullMesh = new THREE.Mesh(hullGeo, hullMat);
  hullMesh.castShadow = !isSoftwareGl;
  hullMesh.receiveShadow = !isSoftwareGl;
  hullPivot.add(hullMesh);

  // Tapered stern transom closure matched to hull stern width
  const transomShape = new THREE.Shape();
  const sternHalfTop = hullHalfWidth(1.0, B);
  const sternTopY = hullGunwaleY(1.0, scaleFactor);
  const tHalfBot = sternHalfTop * 0.48;
  transomShape.moveTo(-sternHalfTop, sternTopY);
  transomShape.lineTo(sternHalfTop, sternTopY);
  transomShape.quadraticCurveTo(sternHalfTop * 0.85, 0.08 * scaleFactor, tHalfBot, -0.22 * scaleFactor);
  transomShape.lineTo(-tHalfBot, -0.22 * scaleFactor);
  transomShape.quadraticCurveTo(-sternHalfTop * 0.85, 0.08 * scaleFactor, -sternHalfTop, sternTopY);
  const transomGeo = new THREE.ExtrudeGeometry(transomShape, { depth: 0.08 * scaleFactor, bevelEnabled: false });
  disposables.push(transomGeo);
  const transomMesh = new THREE.Mesh(transomGeo, bootStripeMat);
  transomMesh.position.set(0, 0, L * 0.48);
  hullPivot.add(transomMesh);

  // Underwater Keel Profile (Fin, Long Keel, or Fin-and-Skeg)
  const keelLength =
    spec.keelType === 'long' ? L * 0.42 : spec.keelType === 'skeg' ? L * 0.25 : L * 0.17;
  const keelDepth = (spec.lengthFt >= 32 ? 1.55 : 1.12) * scaleFactor;
  const keelGeo = new THREE.BoxGeometry(0.15 * scaleFactor, keelDepth, keelLength);
  disposables.push(keelGeo);
  const keelMesh = new THREE.Mesh(keelGeo, bootStripeMat);
  keelMesh.position.set(0, -0.88 * scaleFactor, 0.1 * scaleFactor);
  hullPivot.add(keelMesh);

  const rudderGeo = new THREE.BoxGeometry(0.1 * scaleFactor, 0.95 * scaleFactor, 0.52 * scaleFactor);
  disposables.push(rudderGeo);
  const rudderMesh = new THREE.Mesh(rudderGeo, bootStripeMat);
  rudderMesh.position.set(0, -0.58 * scaleFactor, L * 0.45);
  hullPivot.add(rudderMesh);

  // 2. Sheer-Matched Flush Teak Deck, Cockpit Coamings & Slatted Sole
  const isCenterCockpit = boatId === 'hallberg-42';
  const cockpitZ = isCenterCockpit ? L * 0.16 : L * 0.27;
  const cockpitLen = isCenterCockpit ? L * 0.22 : L * 0.34;
  const roofWidth = B * 0.58;
  const roofLength = L * 0.34;
  const roofZ = -L * 0.08;
  const deckGeo = createFlushDeckGeometry(L, B, scaleFactor, cockpitZ, cockpitLen, roofZ, roofLength, roofWidth);
  disposables.push(deckGeo);
  const deckMesh = new THREE.Mesh(deckGeo, teakMat);
  deckMesh.receiveShadow = !isSoftwareGl;
  hullPivot.add(deckMesh);

  // Cockpit sole & coaming walls
  const cockpitSoleGeo = new THREE.BoxGeometry(B * 0.48, 0.06 * scaleFactor, cockpitLen);
  const coamingGeo = new THREE.BoxGeometry(0.08 * scaleFactor, 0.22 * scaleFactor, cockpitLen * 0.92);
  const benchGeo = new THREE.BoxGeometry(0.22 * scaleFactor, 0.2 * scaleFactor, cockpitLen * 0.78);
  disposables.push(cockpitSoleGeo, coamingGeo, benchGeo);

  const cockpitSole = new THREE.Mesh(cockpitSoleGeo, teakMat);
  cockpitSole.position.set(0, 0.14 * scaleFactor, cockpitZ);
  hullPivot.add(cockpitSole);

  // Slatted teak cockpit duckboard grating + mahogany companionway sill
  const gratingGeo = new THREE.BoxGeometry(B * 0.34, 0.022 * scaleFactor, cockpitLen * 0.66);
  const sillGeo = new THREE.BoxGeometry(B * 0.38, 0.11 * scaleFactor, 0.06 * scaleFactor);
  disposables.push(gratingGeo, sillGeo);
  const cockpitGrate = new THREE.Mesh(gratingGeo, mahoganyMat);
  cockpitGrate.position.set(0, 0.175 * scaleFactor, cockpitZ + 0.04 * scaleFactor);
  hullPivot.add(cockpitGrate);

  const companionwaySill = new THREE.Mesh(sillGeo, mahoganyMat);
  companionwaySill.position.set(0, 0.44 * scaleFactor, cockpitZ - cockpitLen * 0.45);
  hullPivot.add(companionwaySill);

  [-1, 1].forEach((side) => {
    const bench = new THREE.Mesh(benchGeo, teakMat);
    bench.position.set(side * B * 0.21, 0.22 * scaleFactor, cockpitZ);
    hullPivot.add(bench);

    const coaming = new THREE.Mesh(coamingGeo, coachroofMat);
    coaming.position.set(side * B * 0.32, 0.54 * scaleFactor, cockpitZ);
    hullPivot.add(coaming);

    // Varnished mahogany coaming cap rail
    const capGeo = new THREE.BoxGeometry(0.10 * scaleFactor, 0.026 * scaleFactor, cockpitLen * 0.94);
    disposables.push(capGeo);
    const capRail = new THREE.Mesh(capGeo, mahoganyMat);
    capRail.position.set(side * B * 0.32, 0.655 * scaleFactor, cockpitZ);
    hullPivot.add(capRail);
  });

  // Aft Owner Cabin Trunk on Hallberg-Rassy 42 (center-cockpit signature)
  if (isCenterCockpit) {
    const aftTrunkGeo = new THREE.BoxGeometry(B * 0.52, 0.24 * scaleFactor, L * 0.16);
    disposables.push(aftTrunkGeo);
    const aftTrunk = new THREE.Mesh(aftTrunkGeo, coachroofMat);
    aftTrunk.position.set(0, 0.58 * scaleFactor, L * 0.36);
    hullPivot.add(aftTrunk);
  }

  // 3. Stanchions, Pulpit, Pushpit & Lifelines (Secondary Silhouette Read)
  const stanchionGeo = new THREE.CylinderGeometry(0.015 * scaleFactor, 0.015 * scaleFactor, 0.48 * scaleFactor, 6);
  const lifelineMat = new THREE.LineBasicMaterial({ color: 0xe2e8f0 });
  disposables.push(stanchionGeo, lifelineMat);

  const portRailPts: THREE.Vector3[] = [];
  const stbdRailPts: THREE.Vector3[] = [];
  const stationsRail = [-0.46, -0.26, -0.04, 0.18, 0.38, 0.47];
  stationsRail.forEach((tz, idx) => {
    const bw = idx === 0 ? B * 0.12 : idx === stationsRail.length - 1 ? B * 0.34 : B * 0.46 * (1 - Math.abs(tz) * 0.35);
    const yBase = 0.52 * scaleFactor + (tz < -0.2 ? (-0.2 - tz) * 0.45 : 0);
    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(stanchionGeo, stainlessMat);
      post.position.set(side * bw, yBase + 0.22 * scaleFactor, tz * L);
      hullPivot.add(post);
      const topPt = new THREE.Vector3(side * bw, yBase + 0.44 * scaleFactor, tz * L);
      if (side < 0) portRailPts.push(topPt);
      else stbdRailPts.push(topPt);
    });
  });
  [portRailPts, stbdRailPts].forEach((pts) => {
    const lGeo = new THREE.BufferGeometry().setFromPoints(pts);
    disposables.push(lGeo);
    hullPivot.add(new THREE.Line(lGeo, lifelineMat));
  });

  // Bow Port/Starboard Navigation Lamps on Pulpit
  const sideLampGeo = new THREE.SphereGeometry(0.055 * scaleFactor, 8, 8);
  disposables.push(sideLampGeo);
  const portLamp = new THREE.Mesh(sideLampGeo, portNavMat);
  portLamp.position.set(-B * 0.13, 0.84 * scaleFactor, -L * 0.45);
  hullPivot.add(portLamp);
  const stbdLamp = new THREE.Mesh(sideLampGeo, stbdNavMat);
  stbdLamp.position.set(B * 0.13, 0.84 * scaleFactor, -L * 0.45);
  hullPivot.add(stbdLamp);

  // Stainless Bow Pulpit & Stern Pushpit Loops
  const pulpitMat = stainlessMat;
  const railTubeGeo = new THREE.CylinderGeometry(0.015 * scaleFactor, 0.015 * scaleFactor, 0.42 * scaleFactor, 6);
  railTubeGeo.rotateX(Math.PI / 2);
  disposables.push(railTubeGeo);
  [-1, 1].forEach((side) => {
    const bowArm = new THREE.Mesh(railTubeGeo, pulpitMat);
    bowArm.position.set(side * B * 0.08, 0.94 * scaleFactor, -L * 0.475);
    bowArm.rotation.y = side * 0.26;
    hullPivot.add(bowArm);

    const sternArm = new THREE.Mesh(railTubeGeo, pulpitMat);
    sternArm.position.set(side * B * 0.30, 0.96 * scaleFactor, L * 0.47);
    hullPivot.add(sternArm);
  });

  // 4. Cabin Coachroof, Grab Rails, Sliding Companionway Hood & Interior Joinery
  const roofY = (boatId === 'folkboat-25' ? 0.95 : 0.88) * scaleFactor;

  const coachTopGeo = new THREE.BoxGeometry(roofWidth, 0.07 * scaleFactor, roofLength);
  const grabRailGeo = new THREE.BoxGeometry(0.032 * scaleFactor, 0.038 * scaleFactor, roofLength * 0.72);
  const deckBeamGeo = new THREE.BoxGeometry(roofWidth * 0.94, 0.045 * scaleFactor, 0.048 * scaleFactor);
  const hatchHoodGeo = new THREE.BoxGeometry(roofWidth * 0.44, 0.055 * scaleFactor, roofLength * 0.36);
  disposables.push(coachTopGeo, grabRailGeo, deckBeamGeo, hatchHoodGeo);
  const coachTop = new THREE.Mesh(coachTopGeo, coachroofMat);
  coachTop.position.set(0, roofY, roofZ);
  coachTop.castShadow = !isSoftwareGl;
  hullPivot.add(coachTop);

  const hatchHood = new THREE.Mesh(hatchHoodGeo, mahoganyMat);
  hatchHood.position.set(0, roofY + 0.042 * scaleFactor, roofZ + roofLength * 0.32);
  hullPivot.add(hatchHood);

  // Transverse teak deckhead beams under coachroof
  [-0.28, 0.02, 0.32].forEach((zOff) => {
    const beam = new THREE.Mesh(deckBeamGeo, mahoganyMat);
    beam.position.set(0, roofY - 0.05 * scaleFactor, roofZ + roofLength * zOff);
    hullPivot.add(beam);
  });

  // Cabin side walls with glazed portlights, brass porthole bezels & coachroof grab rails
  const sideWallGeo = new THREE.BoxGeometry(0.055 * scaleFactor, 0.46 * scaleFactor, roofLength);
  const portlightGeo = new THREE.BoxGeometry(0.088 * scaleFactor, 0.135 * scaleFactor, roofLength * 0.54);
  const portBezelGeo = new THREE.BoxGeometry(0.072 * scaleFactor, 0.165 * scaleFactor, roofLength * 0.59);
  disposables.push(sideWallGeo, portlightGeo, portBezelGeo);
  [-1, 1].forEach((side) => {
    const wall = new THREE.Mesh(sideWallGeo, coachroofMat);
    wall.position.set(side * (roofWidth * 0.48), roofY - 0.24 * scaleFactor, roofZ);
    hullPivot.add(wall);

    // Mahogany coachroof grab rail
    const grab = new THREE.Mesh(grabRailGeo, mahoganyMat);
    grab.position.set(side * (roofWidth * 0.39), roofY + 0.052 * scaleFactor, roofZ - 0.04 * scaleFactor);
    hullPivot.add(grab);

    const bezel = new THREE.Mesh(portBezelGeo, brassMat);
    bezel.position.set(side * (roofWidth * 0.48), roofY - 0.2 * scaleFactor, roofZ);
    hullPivot.add(bezel);

    const glass = new THREE.Mesh(portlightGeo, glassMat);
    glass.position.set(side * (roofWidth * 0.48), roofY - 0.2 * scaleFactor, roofZ);
    hullPivot.add(glass);
  });

  // Sprayhood / Hard Dodger framing companionway (Contessa 32, Rustler 36, Hallberg-Rassy 42)
  if (spec.hasHardDodger || spec.lengthFt >= 32) {
    const dodgerZ = roofZ + roofLength * 0.55;
    const dodgerRoofGeo = new THREE.BoxGeometry(roofWidth * 0.9, 0.05 * scaleFactor, 0.65 * scaleFactor);
    const dodgerPaneGeo = new THREE.BoxGeometry(roofWidth * 0.82, 0.26 * scaleFactor, 0.05 * scaleFactor);
    disposables.push(dodgerRoofGeo, dodgerPaneGeo);

    const dodgerRoof = new THREE.Mesh(dodgerRoofGeo, dodgerMat);
    dodgerRoof.position.set(0, roofY + 0.16 * scaleFactor, dodgerZ);
    hullPivot.add(dodgerRoof);

    const dodgerPane = new THREE.Mesh(dodgerPaneGeo, glassMat);
    dodgerPane.position.set(0, roofY + 0.04 * scaleFactor, dodgerZ - 0.28 * scaleFactor);
    dodgerPane.rotation.x = -0.35;
    hullPivot.add(dodgerPane);
  }

  // Forward cabin bulkhead + mahogany doorway knees & brass ship's clock
  const fwdBulkGeo = new THREE.BoxGeometry(roofWidth * 0.98, 0.90 * scaleFactor, 0.08 * scaleFactor);
  const kneeGeo = new THREE.BoxGeometry(0.05 * scaleFactor, 0.62 * scaleFactor, 0.14 * scaleFactor);
  disposables.push(fwdBulkGeo, kneeGeo);
  const fwdBulk = new THREE.Mesh(fwdBulkGeo, mahoganyMat);
  fwdBulk.position.set(0, 0.44 * scaleFactor, roofZ - roofLength * 0.48);
  hullPivot.add(fwdBulk);

  [-1, 1].forEach((side) => {
    const knee = new THREE.Mesh(kneeGeo, mahoganyMat);
    knee.position.set(side * roofWidth * 0.43, 0.42 * scaleFactor, roofZ - roofLength * 0.36);
    hullPivot.add(knee);
  });

  // Cabin Teak & Holly Sole, Brass Bilge Hatch Ring, Settees, Hull Ceiling Battens, Bookshelves & Navigation Chart Desk
  const cabinFloorGeo = new THREE.BoxGeometry(roofWidth * 0.68, 0.05 * scaleFactor, roofLength * 0.94);
  const bilgeRingGeo = new THREE.RingGeometry(0.055 * scaleFactor, 0.072 * scaleFactor, 18);
  bilgeRingGeo.rotateX(-Math.PI / 2);
  const setteeGeo = new THREE.BoxGeometry(0.19 * scaleFactor, 0.14 * scaleFactor, roofLength * 0.56);
  const bolsterGeo = new THREE.BoxGeometry(0.06 * scaleFactor, 0.14 * scaleFactor, roofLength * 0.52);
  const pillowGeo = new THREE.BoxGeometry(0.11 * scaleFactor, 0.11 * scaleFactor, 0.15 * scaleFactor);
  const battenGeo = new THREE.BoxGeometry(0.018 * scaleFactor, 0.025 * scaleFactor, roofLength * 0.86);
  const shelfGeo = new THREE.BoxGeometry(0.10 * scaleFactor, 0.025 * scaleFactor, roofLength * 0.42);
  const tableGeo = new THREE.BoxGeometry(0.38 * scaleFactor, 0.34 * scaleFactor, 0.44 * scaleFactor);
  const deskChartGeo = new THREE.PlaneGeometry(0.32 * scaleFactor, 0.25 * scaleFactor);
  const chartMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.nauticalChartTex,
    roughness: 0.72,
  });
  disposables.push(
    cabinFloorGeo,
    bilgeRingGeo,
    setteeGeo,
    bolsterGeo,
    pillowGeo,
    battenGeo,
    shelfGeo,
    tableGeo,
    deskChartGeo,
    chartMat,
  );

  const cabinFloor = new THREE.Mesh(cabinFloorGeo, teakHollyMat);
  cabinFloor.position.set(0, 0.02 * scaleFactor, roofZ);
  hullPivot.add(cabinFloor);

  const bilgeRing = new THREE.Mesh(bilgeRingGeo, brassMat);
  bilgeRing.position.set(0, 0.048 * scaleFactor, roofZ + 0.06 * scaleFactor);
  hullPivot.add(bilgeRing);

  const bookColors = [0x991b1b, 0x1e40af, 0x0f766e, 0xb45309];
  const bookGeo = new THREE.BoxGeometry(0.07 * scaleFactor, 0.095 * scaleFactor, 0.026 * scaleFactor);
  const sconceGeo = new THREE.CylinderGeometry(0.028 * scaleFactor, 0.036 * scaleFactor, 0.055 * scaleFactor, 10);
  disposables.push(bookGeo, sconceGeo);

  [-1, 1].forEach((side) => {
    const settee = new THREE.Mesh(setteeGeo, cushionMat);
    settee.position.set(side * roofWidth * 0.34, 0.14 * scaleFactor, roofZ + 0.11 * scaleFactor);
    hullPivot.add(settee);

    const bolster = new THREE.Mesh(bolsterGeo, cushionMat);
    bolster.position.set(side * roofWidth * 0.42, 0.26 * scaleFactor, roofZ + 0.11 * scaleFactor);
    hullPivot.add(bolster);

    const pillow = new THREE.Mesh(pillowGeo, creamLinerMat);
    pillow.position.set(side * roofWidth * 0.36, 0.24 * scaleFactor, roofZ + 0.24 * scaleFactor);
    pillow.rotation.z = side * 0.22;
    hullPivot.add(pillow);

    // Warm mahogany ceiling battens along inner hull wall
    for (let bi = 0; bi < 4; bi++) {
      const batten = new THREE.Mesh(battenGeo, mahoganyMat);
      batten.position.set(
        side * roofWidth * 0.445,
        (0.32 + bi * 0.055) * scaleFactor,
        roofZ,
      );
      hullPivot.add(batten);
    }

    // Mahogany hull bookshelf + fiddle + wall sconce
    const shelf = new THREE.Mesh(shelfGeo, mahoganyMat);
    shelf.position.set(side * roofWidth * 0.41, 0.56 * scaleFactor, roofZ + 0.04 * scaleFactor);
    hullPivot.add(shelf);

    const sconce = new THREE.Mesh(sconceGeo, cabinLampMat);
    sconce.position.set(side * roofWidth * 0.42, 0.65 * scaleFactor, roofZ - 0.12 * scaleFactor);
    hullPivot.add(sconce);

    if (side < 0) {
      bookColors.forEach((col, bkIdx) => {
        const bMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 });
        disposables.push(bMat);
        const book = new THREE.Mesh(bookGeo, bMat);
        book.position.set(
          -roofWidth * 0.41,
          0.62 * scaleFactor,
          roofZ + (bkIdx - 1.5) * 0.032 * scaleFactor,
        );
        hullPivot.add(book);
      });
    }
  });

  const chartTable = new THREE.Mesh(tableGeo, mahoganyMat);
  chartTable.position.set(-roofWidth * 0.20, 0.18 * scaleFactor, roofZ - 0.04 * scaleFactor);
  hullPivot.add(chartTable);

  // Open paper nautical chart & brass parallel ruler on chart desk
  const deskChart = new THREE.Mesh(deskChartGeo, chartMat);
  deskChart.rotation.x = -Math.PI / 2;
  deskChart.position.set(-roofWidth * 0.20, 0.354 * scaleFactor, roofZ + 0.02 * scaleFactor);
  hullPivot.add(deskChart);

  const rulerGeo = new THREE.BoxGeometry(0.18 * scaleFactor, 0.008 * scaleFactor, 0.03 * scaleFactor);
  disposables.push(rulerGeo);
  const parallelRuler = new THREE.Mesh(rulerGeo, brassMat);
  parallelRuler.position.set(-roofWidth * 0.17, 0.36 * scaleFactor, roofZ + 0.05 * scaleFactor);
  parallelRuler.rotation.y = 0.42;
  hullPivot.add(parallelRuler);

  // Live 3D Chart Plotter Pod on Chart Table (M4)
  const plotterPodGeo = new THREE.BoxGeometry(0.28 * scaleFactor, 0.20 * scaleFactor, 0.04 * scaleFactor);
  const plotterScreenGeo = new THREE.PlaneGeometry(0.25 * scaleFactor, 0.175 * scaleFactor);
  const plotterPodMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.4 });
  const plotterScreenMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.chartPlotterTex,
    emissive: 0xffffff,
    emissiveMap: textures.chartPlotterTex,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });
  disposables.push(plotterPodGeo, plotterScreenGeo, plotterPodMat, plotterScreenMat);
  const plotterPod = new THREE.Mesh(plotterPodGeo, plotterPodMat);
  plotterPod.position.set(-roofWidth * 0.20, 0.43 * scaleFactor, roofZ - 0.09 * scaleFactor);
  plotterPod.rotation.x = -0.28;
  plotterPod.rotation.y = 0.24;
  hullPivot.add(plotterPod);
  const plotterScreen = new THREE.Mesh(plotterScreenGeo, plotterScreenMat);
  plotterScreen.position.set(0, 0, 0.022 * scaleFactor);
  plotterPod.add(plotterScreen);
  registerInteractive(plotterPod, 'toggle-instruments', 'Chart Plotter (Click to Toggle Power)');

  // Companionway steps
  const stepGeo = new THREE.BoxGeometry(0.4 * scaleFactor, 0.04 * scaleFactor, 0.14 * scaleFactor);
  disposables.push(stepGeo);
  [0, 1].forEach((s) => {
    const step = new THREE.Mesh(stepGeo, teakMat);
    step.position.set(0, (0.18 + s * 0.18) * scaleFactor, roofZ + roofLength * (0.42 + s * 0.06));
    hullPivot.add(step);
  });

  // Cabin Dome Light
  const lampGeo = new THREE.CylinderGeometry(0.07 * scaleFactor, 0.07 * scaleFactor, 0.04 * scaleFactor, 14);
  disposables.push(lampGeo);
  const cabinLamp = new THREE.Mesh(lampGeo, cabinLampMat);
  cabinLamp.position.set(0, roofY - 0.06 * scaleFactor, roofZ - 0.08 * scaleFactor);
  hullPivot.add(cabinLamp);
  registerInteractive(cabinLamp, 'toggle-cabin-lights', 'Cabin Dome Light Switch');

  const cabinLight = new THREE.PointLight(0xffcb7d, 1.8, 5.2 * scaleFactor, 1.4);
  cabinLight.position.set(0, roofY - 0.14 * scaleFactor, roofZ - 0.06 * scaleFactor);
  hullPivot.add(cabinLight);

  // Interactive 12V Breaker Switch Panel (inside Cabin on Port bulkhead)
  const panelGeo = new THREE.BoxGeometry(0.32 * scaleFactor, 0.30 * scaleFactor, 0.035 * scaleFactor);
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.switchPanel,
    roughness: 0.4,
    metalness: 0.35,
  });
  disposables.push(panelGeo, panelMat);
  const breakerPanel = new THREE.Mesh(panelGeo, panelMat);
  breakerPanel.position.set(-roofWidth * 0.26, 0.67 * scaleFactor, roofZ - roofLength * 0.42);
  hullPivot.add(breakerPanel);

  const breakerActions: Array<{ key: string; action: InteractiveAction; label: string }> = [
    { key: 'navLights', action: 'toggle-nav-lights', label: '12V Breaker: Masthead Nav Lights' },
    { key: 'cabinLights', action: 'toggle-cabin-lights', label: '12V Breaker: Cabin Lights' },
    { key: 'vhfRadio', action: 'toggle-vhf', label: '12V Breaker: VHF Weather Radio' },
    { key: 'instruments', action: 'toggle-instruments', label: '12V Breaker: Helm Instruments' },
    { key: 'fridgeOn', action: 'toggle-fridge', label: '12V Breaker: Galley Fridge' },
    { key: 'bilgePump', action: 'toggle-bilge', label: '12V Breaker: Bilge Pump' },
  ];
  const breakerMeshes: Record<string, THREE.Mesh> = {};
  const swGeo = new THREE.BoxGeometry(0.055 * scaleFactor, 0.026 * scaleFactor, 0.03 * scaleFactor);
  disposables.push(swGeo);

  breakerActions.forEach((b, idx) => {
    const swMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    });
    disposables.push(swMat);
    const sw = new THREE.Mesh(swGeo, swMat);
    sw.position.set(
      -roofWidth * 0.26 + 0.08 * scaleFactor,
      0.74 * scaleFactor - idx * 0.034 * scaleFactor,
      roofZ - roofLength * 0.40,
    );
    hullPivot.add(sw);
    breakerMeshes[b.key] = sw;
    registerInteractive(sw, b.action, b.label);
  });

  // Live Aneroid Barometer Dial & 12V Battery/Solar Ammeter on Forward Bulkhead (M4)
  const baroGeo = new THREE.CylinderGeometry(0.095 * scaleFactor, 0.095 * scaleFactor, 0.03 * scaleFactor, 20);
  baroGeo.rotateX(Math.PI / 2);
  const baroFaceGeo = new THREE.CircleGeometry(0.082 * scaleFactor, 20);
  const baroFaceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.barometerTex,
    roughness: 0.35,
  });
  disposables.push(baroGeo, baroFaceGeo, baroFaceMat);
  const baroBody = new THREE.Mesh(baroGeo, brassMat);
  baroBody.position.set(0.0, 0.68 * scaleFactor, roofZ - roofLength * 0.42);
  hullPivot.add(baroBody);
  const baroFace = new THREE.Mesh(baroFaceGeo, baroFaceMat);
  baroFace.position.set(0, 0, 0.017 * scaleFactor);
  baroBody.add(baroFace);

  const ampBodyGeo = new THREE.BoxGeometry(0.24 * scaleFactor, 0.15 * scaleFactor, 0.03 * scaleFactor);
  const ampFaceGeo = new THREE.PlaneGeometry(0.22 * scaleFactor, 0.135 * scaleFactor);
  const ampFaceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.ammeterTex,
    emissive: 0xffffff,
    emissiveMap: textures.ammeterTex,
    emissiveIntensity: 0.72,
    roughness: 0.25,
  });
  disposables.push(ampBodyGeo, ampFaceGeo, ampFaceMat);
  const ampBody = new THREE.Mesh(ampBodyGeo, plotterPodMat);
  ampBody.position.set(0.0, 0.48 * scaleFactor, roofZ - roofLength * 0.42);
  hullPivot.add(ampBody);
  const ampFace = new THREE.Mesh(ampFaceGeo, ampFaceMat);
  ampFace.position.set(0, 0, 0.017 * scaleFactor);
  ampBody.add(ampFace);

  // Cabin Autopilot Course Head (Port -5°, Windvane Auto, Stbd +5°) on Forward Bulkhead
  const apBaseGeo = new THREE.BoxGeometry(0.26 * scaleFactor, 0.085 * scaleFactor, 0.035 * scaleFactor);
  const apBtnGeo = new THREE.BoxGeometry(0.065 * scaleFactor, 0.055 * scaleFactor, 0.025 * scaleFactor);
  const portBtnMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x991b1b, emissiveIntensity: 0.45 });
  const windvaneBtnMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.2 });
  const stbdBtnMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x15803d, emissiveIntensity: 0.45 });
  disposables.push(apBaseGeo, apBtnGeo, portBtnMat, windvaneBtnMat, stbdBtnMat);

  const apBox = new THREE.Mesh(apBaseGeo, plotterPodMat);
  apBox.position.set(0.0, 0.32 * scaleFactor, roofZ - roofLength * 0.41);
  hullPivot.add(apBox);

  const btnPort = new THREE.Mesh(apBtnGeo, portBtnMat);
  btnPort.position.set(-0.08 * scaleFactor, 0, 0.02 * scaleFactor);
  apBox.add(btnPort);
  registerInteractive(btnPort, 'steer-port-5', 'Cabin Autopilot: Steer Port -5°');

  const btnVane = new THREE.Mesh(apBtnGeo, windvaneBtnMat);
  btnVane.position.set(0, 0, 0.02 * scaleFactor);
  apBox.add(btnVane);
  registerInteractive(btnVane, 'toggle-windvane', 'Cabin Autopilot: Windvane Clutch');

  const btnStbd = new THREE.Mesh(apBtnGeo, stbdBtnMat);
  btnStbd.position.set(0.08 * scaleFactor, 0, 0.02 * scaleFactor);
  apBox.add(btnStbd);
  registerInteractive(btnStbd, 'steer-stbd-5', 'Cabin Autopilot: Steer Stbd +5°');

  // Cabin Sail & Reef Control Clutches (mounted on Starboard bulkhead organizer below VHF)
  const clutchGeo = new THREE.BoxGeometry(0.055 * scaleFactor, 0.055 * scaleFactor, 0.05 * scaleFactor);
  const mainClutchMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });
  const reefClutchMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.4 });
  const jibClutchMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 });
  disposables.push(clutchGeo, mainClutchMat, reefClutchMat, jibClutchMat);

  const mainClutch = new THREE.Mesh(clutchGeo, mainClutchMat);
  mainClutch.position.set(roofWidth * 0.17, 0.46 * scaleFactor, roofZ - roofLength * 0.40);
  hullPivot.add(mainClutch);
  registerInteractive(mainClutch, 'trim-main-in', 'Mainsheet Jam Cleat (Click to Trim)');

  const reefClutch = new THREE.Mesh(clutchGeo, reefClutchMat);
  reefClutch.position.set(roofWidth * 0.24, 0.46 * scaleFactor, roofZ - roofLength * 0.40);
  hullPivot.add(reefClutch);
  registerInteractive(reefClutch, 'cycle-reef', 'Reefing Line Clutch (Click to Cycle Reef)');

  const jibClutch = new THREE.Mesh(clutchGeo, jibClutchMat);
  jibClutch.position.set(roofWidth * 0.31, 0.46 * scaleFactor, roofZ - roofLength * 0.40);
  hullPivot.add(jibClutch);
  registerInteractive(jibClutch, 'trim-jib-in', 'Jib Sheet Clutch (Click to Trim)');

  // VHF Radio & Galley Fridge inside Cabin (Starboard side)
  const vhfBodyGeo = new THREE.BoxGeometry(0.24 * scaleFactor, 0.13 * scaleFactor, 0.12 * scaleFactor);
  const vhfBodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.4 });
  const vhfScreenGeo = new THREE.PlaneGeometry(0.20 * scaleFactor, 0.10 * scaleFactor);
  disposables.push(vhfBodyGeo, vhfBodyMat, vhfScreenGeo);

  const vhfRadio = new THREE.Mesh(vhfBodyGeo, vhfBodyMat);
  vhfRadio.position.set(roofWidth * 0.24, 0.62 * scaleFactor, roofZ - roofLength * 0.41);
  hullPivot.add(vhfRadio);
  const vhfScreen = new THREE.Mesh(vhfScreenGeo, vhfScreenMat);
  vhfScreen.position.set(0, 0, 0.062 * scaleFactor);
  vhfRadio.add(vhfScreen);
  registerInteractive(vhfRadio, 'toggle-vhf', 'VHF Radio & Weatherfax');

  const fridgeGeo = new THREE.BoxGeometry(0.34 * scaleFactor, 0.34 * scaleFactor, 0.34 * scaleFactor);
  const fridgeMat = new THREE.MeshStandardMaterial({ color: 0xdbe4ee, roughness: 0.35, metalness: 0.2 });
  disposables.push(fridgeGeo, fridgeMat);
  const fridgeBox = new THREE.Mesh(fridgeGeo, fridgeMat);
  fridgeBox.position.set(roofWidth * 0.21, 0.22 * scaleFactor, roofZ - 0.10 * scaleFactor);
  hullPivot.add(fridgeBox);
  registerInteractive(fridgeBox, 'toggle-fridge', '12V Galley Fridge & Provisions');

  // Starboard Galley Counter: Gimballed 2-Burner Stove, Kettle & Recessed Sink + Faucet
  const galleyCounterGeo = new THREE.BoxGeometry(0.28 * scaleFactor, 0.32 * scaleFactor, 0.34 * scaleFactor);
  const stoveTopGeo = new THREE.BoxGeometry(0.20 * scaleFactor, 0.04 * scaleFactor, 0.18 * scaleFactor);
  const burnerGeo = new THREE.CylinderGeometry(0.035 * scaleFactor, 0.035 * scaleFactor, 0.012 * scaleFactor, 12);
  const kettleGeo = new THREE.CylinderGeometry(0.032 * scaleFactor, 0.045 * scaleFactor, 0.055 * scaleFactor, 12);
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xc26c38, roughness: 0.28, metalness: 0.85 });
  const sinkBasinGeo = new THREE.CylinderGeometry(0.065 * scaleFactor, 0.055 * scaleFactor, 0.025 * scaleFactor, 14);
  const faucetGeo = new THREE.CylinderGeometry(0.008 * scaleFactor, 0.01 * scaleFactor, 0.08 * scaleFactor, 8);
  const shipClockGeo = new THREE.CylinderGeometry(0.065 * scaleFactor, 0.065 * scaleFactor, 0.025 * scaleFactor, 18);
  shipClockGeo.rotateZ(Math.PI / 2);
  const clockFaceGeo = new THREE.CircleGeometry(0.052 * scaleFactor, 18);
  clockFaceGeo.rotateY(-Math.PI / 2);
  const clockFaceMat = new THREE.MeshStandardMaterial({ color: 0xf8f3e6, roughness: 0.4 });
  disposables.push(
    galleyCounterGeo,
    stoveTopGeo,
    burnerGeo,
    kettleGeo,
    copperMat,
    sinkBasinGeo,
    faucetGeo,
    shipClockGeo,
    clockFaceGeo,
    clockFaceMat,
  );

  const galleyCounter = new THREE.Mesh(galleyCounterGeo, mahoganyMat);
  galleyCounter.position.set(roofWidth * 0.23, 0.21 * scaleFactor, roofZ + 0.24 * scaleFactor);
  hullPivot.add(galleyCounter);

  const stoveBase = new THREE.Mesh(stoveTopGeo, stainlessMat);
  stoveBase.position.set(roofWidth * 0.23, 0.39 * scaleFactor, roofZ + 0.18 * scaleFactor);
  hullPivot.add(stoveBase);

  [-0.045, 0.045].forEach((bx) => {
    const burner = new THREE.Mesh(burnerGeo, plotterPodMat);
    burner.position.set(roofWidth * 0.23 + bx * scaleFactor, 0.415 * scaleFactor, roofZ + 0.18 * scaleFactor);
    hullPivot.add(burner);
  });

  const kettle = new THREE.Mesh(kettleGeo, copperMat);
  kettle.position.set(roofWidth * 0.23 - 0.045 * scaleFactor, 0.445 * scaleFactor, roofZ + 0.18 * scaleFactor);
  hullPivot.add(kettle);

  const sink = new THREE.Mesh(sinkBasinGeo, stainlessMat);
  sink.position.set(roofWidth * 0.23, 0.375 * scaleFactor, roofZ + 0.32 * scaleFactor);
  hullPivot.add(sink);

  const faucet = new THREE.Mesh(faucetGeo, stainlessMat);
  faucet.position.set(roofWidth * 0.27, 0.41 * scaleFactor, roofZ + 0.32 * scaleFactor);
  hullPivot.add(faucet);

  // Brass Ship's Bell Clock on Starboard Cabin Shelf Bulkhead
  const clockBody = new THREE.Mesh(shipClockGeo, brassMat);
  clockBody.position.set(roofWidth * 0.42, 0.67 * scaleFactor, roofZ + 0.04 * scaleFactor);
  hullPivot.add(clockBody);
  const clockFace = new THREE.Mesh(clockFaceGeo, clockFaceMat);
  clockFace.position.set(-0.014 * scaleFactor, 0, 0);
  clockBody.add(clockFace);

  // 5. Cockpit Binnacle / Compass, Sheet Winches, Tiller or Helm Wheel
  const compBaseGeo = new THREE.CylinderGeometry(0.13 * scaleFactor, 0.15 * scaleFactor, 0.16 * scaleFactor, 16);
  const compFaceGeo = new THREE.CircleGeometry(0.11 * scaleFactor, 20);
  const compFaceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.compassDial,
    roughness: 0.3,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.18,
  });
  disposables.push(compBaseGeo, compFaceGeo, compFaceMat);

  const binnacle = new THREE.Mesh(compBaseGeo, brassMat);
  binnacle.position.set(0, 0.42 * scaleFactor, cockpitZ - cockpitLen * 0.24);
  hullPivot.add(binnacle);

  const compassCardMesh = new THREE.Mesh(compFaceGeo, compFaceMat);
  compassCardMesh.rotation.x = -Math.PI / 2;
  compassCardMesh.position.set(0, 0.085 * scaleFactor, 0);
  binnacle.add(compassCardMesh);
  registerInteractive(binnacle, 'toggle-instruments', 'Binnacle Compass & Instruments');

  // Cockpit waterproof wind / log / depth repeater on the steering pedestal.
  const helmHousingGeo = new THREE.BoxGeometry(0.62 * scaleFactor, 0.44 * scaleFactor, 0.075 * scaleFactor);
  const helmScreenGeo = new THREE.PlaneGeometry(0.55 * scaleFactor, 0.36 * scaleFactor);
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
  helmDisplay.position.set(0, 0.96 * scaleFactor, cockpitZ - cockpitLen * 0.16);
  hullPivot.add(helmDisplay);
  const helmScreen = new THREE.Mesh(helmScreenGeo, helmScreenMat);
  helmScreen.position.set(0, 0, 0.039 * scaleFactor);
  helmDisplay.add(helmScreen);
  registerInteractive(helmDisplay, 'toggle-instruments', 'Cockpit Wind / Speed / Depth Repeater');

  let helmControlMesh: THREE.Object3D;
  if (spec.hasWheel) {
    const wheelGroup = new THREE.Group();
    const pedGeo = new THREE.CylinderGeometry(0.11 * scaleFactor, 0.14 * scaleFactor, 0.72 * scaleFactor, 12);
    const rimGeo = new THREE.TorusGeometry(0.4 * scaleFactor, 0.025 * scaleFactor, 10, 24);
    disposables.push(pedGeo, rimGeo);
    const ped = new THREE.Mesh(pedGeo, coachroofMat);
    ped.position.set(0, 0.36 * scaleFactor, cockpitZ + cockpitLen * 0.22);
    hullPivot.add(ped);

    const wheelRim = new THREE.Mesh(rimGeo, stainlessMat);
    wheelGroup.position.set(0, 0.68 * scaleFactor, cockpitZ + cockpitLen * 0.12);
    wheelGroup.add(wheelRim);
    const spokeGeo = new THREE.CylinderGeometry(0.014 * scaleFactor, 0.014 * scaleFactor, 0.78 * scaleFactor, 8);
    disposables.push(spokeGeo);
    for (let s = 0; s < 3; s++) {
      const sp = new THREE.Mesh(spokeGeo, stainlessMat);
      sp.rotation.z = (s * Math.PI) / 3;
      wheelGroup.add(sp);
    }
    hullPivot.add(wheelGroup);
    helmControlMesh = wheelGroup;
  } else {
    const tillerGroup = new THREE.Group();
    const tillerGeo = new THREE.BoxGeometry(0.055 * scaleFactor, 0.055 * scaleFactor, 1.15 * scaleFactor);
    disposables.push(tillerGeo);
    const tillerBar = new THREE.Mesh(tillerGeo, mahoganyMat);
    tillerBar.position.set(0, 0, -0.52 * scaleFactor);
    tillerGroup.position.set(0, 0.56 * scaleFactor, L * 0.45);
    tillerGroup.add(tillerBar);
    hullPivot.add(tillerGroup);
    helmControlMesh = tillerGroup;
  }

  // Sheet Winches
  const winchGeo = new THREE.CylinderGeometry(0.075 * scaleFactor, 0.095 * scaleFactor, 0.14 * scaleFactor, 14);
  const winchHandleGeo = new THREE.BoxGeometry(0.20 * scaleFactor, 0.022 * scaleFactor, 0.028 * scaleFactor);
  const winchKnobGeo = new THREE.SphereGeometry(0.028 * scaleFactor, 8, 6);
  disposables.push(winchGeo, winchHandleGeo, winchKnobGeo);
  const makeSheetWinch = (x: number, material: THREE.Material, action: InteractiveAction, label: string) => {
    const group = new THREE.Group();
    group.position.set(x, 0.54 * scaleFactor, cockpitZ - 0.15 * scaleFactor);
    const drum = new THREE.Mesh(winchGeo, material);
    group.add(drum);
    const crank = new THREE.Mesh(winchHandleGeo, stainlessMat);
    crank.position.set(0.09 * scaleFactor, 0.085 * scaleFactor, 0);
    group.add(crank);
    const knob = new THREE.Mesh(winchKnobGeo, coachroofMat);
    knob.position.set(0.19 * scaleFactor, 0.085 * scaleFactor, 0);
    group.add(knob);
    hullPivot.add(group);
    registerInteractive(group, action, label);
    return group;
  };
  const mainsheetWinch = makeSheetWinch(-B * 0.34, brassMat, 'trim-main-in', 'Mainsheet Winch (Click to Trim)');
  const jibsheetWinch = makeSheetWinch(B * 0.34, stainlessMat, 'trim-jib-in', 'Jib Sheet Winch (Click to Trim)');

  // Coiled Cockpit Sheet Ropes beside winches (tides-of-fortune deck craft)
  const ropeCoilGeo = new THREE.TorusGeometry(0.085 * scaleFactor, 0.018 * scaleFactor, 7, 16);
  ropeCoilGeo.rotateX(Math.PI / 2);
  disposables.push(ropeCoilGeo);
  [-1, 1].forEach((side) => {
    for (let r = 0; r < 2; r++) {
      const coil = new THREE.Mesh(ropeCoilGeo, ropeMat);
      coil.position.set(
        side * B * 0.23,
        (0.335 + r * 0.025) * scaleFactor,
        cockpitZ - 0.16 * scaleFactor,
      );
      coil.scale.setScalar(1 - r * 0.15);
      hullPivot.add(coil);
    }
  });

  // 6. Stern Solar Arch, Windvane Self-Steering & Expedition Radar Dome (Hallberg 42)
  const solarFrameGeo = new THREE.BoxGeometry(
    (spec.lengthFt >= 36 ? 1.35 : 0.92) * scaleFactor,
    0.04 * scaleFactor,
    0.64 * scaleFactor,
  );
  const solarCellMat = new THREE.MeshStandardMaterial({
    color: 0x0f2744,
    roughness: 0.16,
    metalness: 0.78,
  });
  disposables.push(solarFrameGeo, solarCellMat);
  const solarPanel = new THREE.Mesh(solarFrameGeo, solarCellMat);
  solarPanel.position.set(0, (spec.lengthFt >= 36 ? 1.15 : 0.92) * scaleFactor, L * 0.48);
  solarPanel.rotation.x = 0.14;
  hullPivot.add(solarPanel);

  if (spec.lengthFt >= 36) {
    // Twin stainless stern arch uprights
    const archGeo = new THREE.CylinderGeometry(0.022 * scaleFactor, 0.022 * scaleFactor, 0.72 * scaleFactor, 8);
    disposables.push(archGeo);
    [-1, 1].forEach((side) => {
      const archPost = new THREE.Mesh(archGeo, stainlessMat);
      archPost.position.set(side * 0.52 * scaleFactor, 0.82 * scaleFactor, L * 0.47);
      hullPivot.add(archPost);
    });
  }

  const vaneMountGeo = new THREE.CylinderGeometry(0.025 * scaleFactor, 0.025 * scaleFactor, 0.65 * scaleFactor, 8);
  const vanePaddleGeo = new THREE.BoxGeometry(0.03 * scaleFactor, 0.42 * scaleFactor, 0.22 * scaleFactor);
  const vaneMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.45 });
  disposables.push(vaneMountGeo, vanePaddleGeo, vaneMat);
  const vaneMount = new THREE.Mesh(vaneMountGeo, stainlessMat);
  vaneMount.position.set(0.28 * scaleFactor, 0.55 * scaleFactor, L * 0.52);
  hullPivot.add(vaneMount);

  const windvanePaddle = new THREE.Mesh(vanePaddleGeo, vaneMat);
  windvanePaddle.position.set(0.28 * scaleFactor, 0.95 * scaleFactor, L * 0.52);
  hullPivot.add(windvanePaddle);
  registerInteractive(windvanePaddle, 'toggle-windvane', 'Windvane Self-Steering Clutch');

  // 7. Mast, Twin Spreaders, Radar Dome, Standing Rigging, Boom, Sails & Telltales
  const mastBaseY = 0.88 * scaleFactor;
  const mastZ = -L * 0.1;
  const mastGeo = new THREE.CylinderGeometry(0.055 * scaleFactor, 0.08 * scaleFactor, mastH, 12);
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xd9e1ea, roughness: 0.3, metalness: 0.85 });
  disposables.push(mastGeo, mastMat);
  const mastMesh = new THREE.Mesh(mastGeo, mastMat);
  mastMesh.position.set(0, mastBaseY + mastH * 0.5, mastZ);
  mastMesh.castShadow = !isSoftwareGl;
  hullPivot.add(mastMesh);

  // Lower & Upper Spreaders (bluewater boats >= 32ft get twin spreaders)
  const spreaderGeo = new THREE.BoxGeometry(B * 0.8, 0.04 * scaleFactor, 0.05 * scaleFactor);
  disposables.push(spreaderGeo);
  const spreaders = new THREE.Mesh(spreaderGeo, mastMat);
  spreaders.position.set(0, mastBaseY + mastH * 0.52, mastZ);
  hullPivot.add(spreaders);

  if (spec.lengthFt >= 32) {
    const upperSpreader = new THREE.Mesh(spreaderGeo, mastMat);
    upperSpreader.scale.set(0.7, 1, 1);
    upperSpreader.position.set(0, mastBaseY + mastH * 0.76, mastZ);
    hullPivot.add(upperSpreader);
  }

  if (boatId === 'hallberg-42') {
    const radarGeo = new THREE.CylinderGeometry(0.24 * scaleFactor, 0.24 * scaleFactor, 0.16 * scaleFactor, 16);
    disposables.push(radarGeo);
    const radar = new THREE.Mesh(radarGeo, coachroofMat);
    radar.position.set(0, mastBaseY + mastH * 0.56, mastZ - 0.22 * scaleFactor);
    hullPivot.add(radar);
  }

  // Masthead Navigation Light
  const navLightGeo = new THREE.SphereGeometry(0.09 * scaleFactor, 10, 10);
  disposables.push(navLightGeo);
  const navLight = new THREE.Mesh(navLightGeo, navLightMat);
  navLight.position.set(0, mastBaseY + mastH + 0.08 * scaleFactor, mastZ);
  hullPivot.add(navLight);

  // Standing Rigging Shrouds, Forestay, Backstay & Inner Cutter Stay
  const shroudMat = new THREE.LineBasicMaterial({ color: 0xcbd5e1 });
  disposables.push(shroudMat);
  const mastTop = new THREE.Vector3(0, mastBaseY + mastH, mastZ);
  const stayTargets = [
    new THREE.Vector3(0, 0.54 * scaleFactor, -L * 0.49),
    new THREE.Vector3(0, 0.54 * scaleFactor, L * 0.49),
    new THREE.Vector3(-B * 0.45, 0.5 * scaleFactor, -L * 0.04),
    new THREE.Vector3(B * 0.45, 0.5 * scaleFactor, -L * 0.04),
  ];
  stayTargets.forEach((pt) => {
    const lineGeo = new THREE.BufferGeometry().setFromPoints([mastTop, pt]);
    disposables.push(lineGeo);
    hullPivot.add(new THREE.Line(lineGeo, shroudMat));
  });

  if (spec.hasStaysail) {
    const innerStayTop = new THREE.Vector3(0, mastBaseY + mastH * 0.72, mastZ);
    const innerStayDeck = new THREE.Vector3(0, 0.52 * scaleFactor, -L * 0.31);
    const innerGeo = new THREE.BufferGeometry().setFromPoints([innerStayTop, innerStayDeck]);
    disposables.push(innerGeo);
    hullPivot.add(new THREE.Line(innerGeo, shroudMat));
  }

  // Boom + Mainsail + Telltale Ribbons
  const boomPivot = new THREE.Group();
  boomPivot.position.set(0, 1.28 * scaleFactor, mastZ);
  hullPivot.add(boomPivot);

  const boomGeo = new THREE.CylinderGeometry(0.045 * scaleFactor, 0.05 * scaleFactor, boomL, 10);
  boomGeo.rotateX(Math.PI / 2);
  disposables.push(boomGeo);
  const boomMesh = new THREE.Mesh(boomGeo, mastMat);
  boomMesh.position.set(0, 0, boomL * 0.5);
  boomPivot.add(boomMesh);
  registerInteractive(boomMesh, 'cycle-reef', 'Boom & Reefing Pennant (Click to Reef)');

  const mainGeo = createSailGeometry(boomL * 0.96, mastH - 0.55 * scaleFactor);
  disposables.push(mainGeo);
  const mainsailMesh = new THREE.Mesh(mainGeo, sailMat);
  mainsailMesh.position.set(0, 0.05 * scaleFactor, 0.06 * scaleFactor);
  mainsailMesh.castShadow = !isSoftwareGl;
  boomPivot.add(mainsailMesh);

  // Leech telltales (3 crisp wind ribbons on mainsail leech)
  const telltales: THREE.Mesh[] = [];
  const ttGeo = new THREE.BoxGeometry(0.015 * scaleFactor, 0.025 * scaleFactor, 0.24 * scaleFactor);
  const ttRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  disposables.push(ttGeo, ttRedMat);
  [0.28, 0.52, 0.76].forEach((hFrac) => {
    const tt = new THREE.Mesh(ttGeo, ttRedMat);
    tt.position.set(0, (mastH - 0.55 * scaleFactor) * hFrac, boomL * 0.96 * (1 - hFrac * 0.82) + 0.14 * scaleFactor);
    boomPivot.add(tt);
    telltales.push(tt);
  });

  // Jib / Foresail (high-cut clew stays clear of coachroof & cabin)
  const jibHeight = mastH - 0.56 * scaleFactor;
  const jibFoot = L * 0.32;
  const forestayRakeZ = L * 0.38;
  const jibGeo = createJibGeometry(jibFoot, forestayRakeZ, jibHeight, 8, 12);
  disposables.push(jibGeo);
  const jibMesh = new THREE.Mesh(jibGeo, sailMat);
  jibMesh.position.set(0, 0.68 * scaleFactor, -L * 0.48);
  jibMesh.castShadow = !isSoftwareGl;
  hullPivot.add(jibMesh);

  // Cutter Staysail (Rustler 36 & Hallberg-Rassy 42)
  let staysailMesh: THREE.Mesh | null = null;
  if (spec.hasStaysail) {
    const stayHeight = mastH * 0.66;
    const stayFoot = L * 0.19;
    const stayRakeZ = L * 0.21;
    const stayGeo = createJibGeometry(stayFoot, stayRakeZ, stayHeight, 6, 10);
    disposables.push(stayGeo);
    staysailMesh = new THREE.Mesh(stayGeo, sailMat);
    staysailMesh.position.set(0, 0.68 * scaleFactor, -L * 0.31);
    staysailMesh.castShadow = !isSoftwareGl;
    hullPivot.add(staysailMesh);
    registerInteractive(staysailMesh, 'toggle-staysail', 'Cutter Staysail (Click to Furl/Set)');
  }

  // 8. Bow Anchor Roller & Deployed Chain Line
  const anchorGroup = new THREE.Group();
  const shankGeo = new THREE.BoxGeometry(0.06 * scaleFactor, 0.06 * scaleFactor, 0.48 * scaleFactor);
  const flukeGeo = new THREE.ConeGeometry(0.14 * scaleFactor, 0.25 * scaleFactor, 4);
  disposables.push(shankGeo, flukeGeo);
  const shank = new THREE.Mesh(shankGeo, stainlessMat);
  const fluke = new THREE.Mesh(flukeGeo, stainlessMat);
  fluke.rotation.x = Math.PI / 2;
  fluke.position.set(0, -0.04 * scaleFactor, -0.22 * scaleFactor);
  anchorGroup.add(shank, fluke);
  anchorGroup.position.set(0, 0.58 * scaleFactor, -L * 0.51);
  hullPivot.add(anchorGroup);
  registerInteractive(anchorGroup, 'toggle-anchor', 'Bow Anchor & Windlass');

  const chainGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.55 * scaleFactor, -L * 0.51),
    new THREE.Vector3(0, -3.5, -L * 0.85),
  ]);
  const chainMat = new THREE.LineBasicMaterial({ color: 0xf59e0b });
  disposables.push(chainGeo, chainMat);
  const anchorChainLine = new THREE.Line(chainGeo, chainMat);
  anchorChainLine.visible = false;
  hullPivot.add(anchorChainLine);

  // Camera anchors in boat-local coordinates
  const helmEyeLocal = new THREE.Vector3(0.56 * scaleFactor, 1.74 * scaleFactor, cockpitZ + cockpitLen * 0.24);
  const helmLookLocal = new THREE.Vector3(0.46 * scaleFactor, 1.38 * scaleFactor, -L * 0.92);

  const cabinEyeLocal = new THREE.Vector3(0.10 * scaleFactor, 0.66 * scaleFactor, roofZ + roofLength * 0.40);
  const cabinLookLocal = new THREE.Vector3(-0.06 * scaleFactor, 0.43 * scaleFactor, roofZ - roofLength * 0.16);

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
      minX: -roofWidth * 0.52,
      maxX: roofWidth * 0.52,
      minZ: roofZ - roofLength * 0.55,
      maxZ: roofZ + roofLength * 0.55,
    },
    dispose: () => {
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
      : Math.sin(elapsedSec * 1.4) * ((0.012 + state.weather.waveHeightM * 0.008) / pitchDamp));
  const waveRoll = waveMotion
    ? waveMotion.rollRad * 0.65
    : Math.cos(elapsedSec * 1.1) * (0.011 + state.weather.waveHeightM * 0.009);
  boat.hullPivot.rotation.z = heelRad + waveRoll;
  boat.hullPivot.rotation.x = wavePitch;
  // Keep the modeled waterline riding the same rendered Gerstner surface.
  const heave = waveMotion
    ? waveMotion.heaveM + 0.025
    : Math.sin(elapsedSec * 1.7) * (0.045 + state.weather.waveHeightM * 0.038);
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

  // Telltale streaming / fluttering
  boat.telltales.forEach((tt, idx) => {
    tt.rotation.y = state.isLuffing
      ? Math.sin(elapsedSec * 22 + idx * 1.4) * 0.65
      : Math.sin(elapsedSec * 4.5 + idx) * 0.06;
  });

  boat.jibMesh.visible = state.jibDeployed;
  if (state.jibDeployed) {
    const jibOut = ((100 - state.jibsheetPct) / 100) * 0.48 + 0.05;
    boat.jibMesh.rotation.y = boomSide * jibOut + luffFlutter * 0.7;
    boat.jibMesh.scale.x = boomSide * (0.75 + (1 - state.jibsheetPct / 100) * 0.5);
  }

  if (boat.staysailMesh) {
    boat.staysailMesh.visible = state.staysailDeployed;
    if (state.staysailDeployed) {
      const stayOut = ((100 - state.jibsheetPct) / 100) * 0.35 + 0.04;
      boat.staysailMesh.rotation.y = boomSide * stayOut + luffFlutter * 0.5;
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
  boat.cabinLight.intensity = state.electrical.cabinLights ? 1.6 : 0.0;
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

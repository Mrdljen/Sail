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
  | 'open-chandlery';

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
  rudderMesh: THREE.Mesh;
  helmControlMesh: THREE.Object3D;
  windvanePaddle: THREE.Mesh;
  compassCardMesh: THREE.Mesh;
  navLightMat: THREE.MeshStandardMaterial;
  cabinLight: THREE.PointLight;
  cabinLampMat: THREE.MeshStandardMaterial;
  vhfScreenMat: THREE.MeshStandardMaterial;
  anchorGroup: THREE.Group;
  anchorChainLine: THREE.Line;
  breakerMeshes: Record<string, THREE.Mesh>;
  interactables: InteractiveTarget[];
  helmEyeLocal: THREE.Vector3;
  helmLookLocal: THREE.Vector3;
  cabinEyeLocal: THREE.Vector3;
  cabinLookLocal: THREE.Vector3;
  dispose: () => void;
}

function createSailGeometry(width: number, height: number, segX = 12, segY = 14): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= segY; iy++) {
    const v = iy / segY; // 0 = foot, 1 = head
    // Triangular Bermuda sail taper
    const rowWidth = width * (1 - v * 0.88);
    for (let ix = 0; ix <= segX; ix++) {
      const u = ix / segX; // 0 = luff (mast), 1 = leech
      const z = u * rowWidth;
      const y = v * height;
      // Subtle aerodynamic camber
      const camber = Math.sin(u * Math.PI) * (1 - v * 0.5) * 0.24;
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
      const y = v * height;
      const camber = Math.sin(u * Math.PI) * (1 - v * 0.5) * 0.18;
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

function createHullGeometry(length: number, beam: number, depth: number): THREE.BufferGeometry {
  // Multi-station lofted sailboat hull along Z (-length/2 = bow, +length/2 = stern)
  const stations = 16;
  const profilePts = 11; // half-cross-section from keel centerline -> sheer, mirrored port/stbd
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iz = 0; iz <= stations; iz++) {
    const t = iz / stations; // 0 = bow, 1 = stern
    const z = (t - 0.5) * length;

    // Beam envelope: sharp entry at bow, widest at 55%, gentle transom taper
    const widthFactor =
      t < 0.55
        ? Math.pow(Math.sin((t / 0.55) * (Math.PI / 2)), 0.78)
        : 1 - Math.pow((t - 0.55) / 0.45, 1.8) * 0.36;

    // Sheerline curve (slight graceful rise at bow)
    const sheerRise = Math.pow(Math.max(0, 0.45 - t), 1.6) * 0.45 + (t > 0.8 ? (t - 0.8) * 0.25 : 0);
    const keelRock = t < 0.15 ? (0.15 - t) * 1.4 : t > 0.85 ? (t - 0.85) * 1.1 : 0;

    for (let ip = 0; ip < profilePts * 2 - 1; ip++) {
      // ip goes from port sheer (0) -> keel center (profilePts - 1) -> stbd sheer
      const sideIdx = ip - (profilePts - 1); // negative = port, positive = stbd
      const s = Math.abs(sideIdx) / (profilePts - 1); // 0 at keel, 1 at sheer
      const sign = Math.sign(sideIdx);

      const x = sign * Math.pow(s, 0.72) * (beam * 0.5) * widthFactor;
      const y = -depth * (1 - Math.pow(s, 1.45)) + keelRock * (1 - s) + sheerRise * s + 0.42;

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

export function buildSailboatModel(
  boatId: BoatId,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): BuiltBoat {
  const spec = BOAT_SPECS[boatId];
  const scaleFactor = boatId === 'rustler-36' ? 1.38 : 1.0;
  const L = 6.2 * scaleFactor;
  const B = 2.45 * scaleFactor;
  const hullDepth = 0.88 * scaleFactor;
  const mastH = 7.4 * scaleFactor;
  const boomL = 2.85 * scaleFactor;

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

  // Materials (varied roughness >= 0.25 across parts for crisp PBR separation)
  const hullMat = new THREE.MeshPhysicalMaterial({
    color: spec.hullColorHex,
    roughness: 0.28,
    metalness: 0.05,
    clearcoat: 0.7,
    clearcoatRoughness: 0.18,
    side: THREE.DoubleSide,
  });
  const bootStripeMat = new THREE.MeshStandardMaterial({
    color: spec.trimColorHex,
    roughness: 0.42,
    metalness: 0.12,
  });
  const teakMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.teakColor,
    bumpMap: textures.teakBump,
    bumpScale: 0.015,
    roughness: 0.78,
    metalness: 0.0,
  });
  const mahoganyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.mahoganyColor,
    roughness: 0.46,
    metalness: 0.05,
  });
  const coachroofMat = new THREE.MeshStandardMaterial({
    color: 0xf1ede4,
    roughness: 0.45,
    metalness: 0.04,
  });
  const stainlessMat = new THREE.MeshStandardMaterial({
    color: 0xd8dee6,
    roughness: 0.2,
    metalness: 0.9,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4a438,
    roughness: 0.24,
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
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: isSoftwareGl ? 0.35 : 0.45,
    transmission: isSoftwareGl ? 0 : 0.5,
  });
  const navLightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.0,
    roughness: 0.3,
  });
  const cabinLampMat = new THREE.MeshStandardMaterial({
    color: 0xffd28a,
    emissive: 0xffb347,
    emissiveIntensity: 1.1,
    roughness: 0.4,
  });
  const vhfScreenMat = new THREE.MeshStandardMaterial({
    color: 0x102a2a,
    emissive: 0x2dd4bf,
    emissiveIntensity: 0.9,
    roughness: 0.3,
  });

  disposables.push(
    hullMat,
    bootStripeMat,
    teakMat,
    mahoganyMat,
    coachroofMat,
    stainlessMat,
    brassMat,
    sailMat,
    glassMat,
    navLightMat,
    cabinLampMat,
    vhfScreenMat,
  );

  // 1. Primary Silhouette: Lofted Hull
  const hullGeo = createHullGeometry(L, B, hullDepth);
  disposables.push(hullGeo);
  const hullMesh = new THREE.Mesh(hullGeo, hullMat);
  hullMesh.castShadow = !isSoftwareGl;
  hullMesh.receiveShadow = !isSoftwareGl;
  hullPivot.add(hullMesh);

  // Tapered stern transom closure matching hull bilge curve (no protruding box corners)
  const transomShape = new THREE.Shape();
  const tHalfTop = B * 0.31;
  const tHalfBot = B * 0.16;
  transomShape.moveTo(-tHalfTop, 0.42 * scaleFactor);
  transomShape.lineTo(tHalfTop, 0.42 * scaleFactor);
  transomShape.quadraticCurveTo(tHalfTop * 0.85, 0.05 * scaleFactor, tHalfBot, -0.22 * scaleFactor);
  transomShape.lineTo(-tHalfBot, -0.22 * scaleFactor);
  transomShape.quadraticCurveTo(-tHalfTop * 0.85, 0.05 * scaleFactor, -tHalfTop, 0.42 * scaleFactor);
  const transomGeo = new THREE.ExtrudeGeometry(transomShape, { depth: 0.1 * scaleFactor, bevelEnabled: false });
  disposables.push(transomGeo);
  const transomMesh = new THREE.Mesh(transomGeo, bootStripeMat);
  transomMesh.position.set(0, 0, L * 0.47);
  hullPivot.add(transomMesh);

  // Underwater Keel & Rudder Blade
  const keelGeo = new THREE.BoxGeometry(
    0.16 * scaleFactor,
    (boatId === 'rustler-36' ? 1.55 : 1.05) * scaleFactor,
    (boatId === 'rustler-36' ? 2.4 : 1.1) * scaleFactor,
  );
  disposables.push(keelGeo);
  const keelMesh = new THREE.Mesh(keelGeo, bootStripeMat);
  keelMesh.position.set(0, -0.95 * scaleFactor, 0.1 * scaleFactor);
  hullPivot.add(keelMesh);

  const rudderGeo = new THREE.BoxGeometry(0.1 * scaleFactor, 0.95 * scaleFactor, 0.55 * scaleFactor);
  disposables.push(rudderGeo);
  const rudderMesh = new THREE.Mesh(rudderGeo, bootStripeMat);
  rudderMesh.position.set(0, -0.58 * scaleFactor, L * 0.47);
  hullPivot.add(rudderMesh);

  // 2. Teak Foredeck, Side Decks & Open Cockpit + Walk-in Cabin Floor
  const foredeckShape = new THREE.Shape();
  foredeckShape.moveTo(0, -L * 0.5);
  foredeckShape.quadraticCurveTo(B * 0.5, -L * 0.18, B * 0.48, L * 0.49);
  foredeckShape.lineTo(B * 0.27, L * 0.49);
  foredeckShape.lineTo(B * 0.27, -L * 0.23);
  foredeckShape.lineTo(-B * 0.27, -L * 0.23);
  foredeckShape.lineTo(-B * 0.27, L * 0.49);
  foredeckShape.lineTo(-B * 0.48, L * 0.49);
  foredeckShape.quadraticCurveTo(-B * 0.5, -L * 0.18, 0, -L * 0.5);

  const deckGeo = new THREE.ExtrudeGeometry(foredeckShape, {
    depth: 0.06 * scaleFactor,
    bevelEnabled: false,
  });
  deckGeo.rotateX(Math.PI / 2);
  disposables.push(deckGeo);
  const deckMesh = new THREE.Mesh(deckGeo, teakMat);
  deckMesh.position.set(0, 0.46 * scaleFactor, 0);
  deckMesh.receiveShadow = !isSoftwareGl;
  hullPivot.add(deckMesh);

  // Cockpit sole & seating benches
  const cockpitSoleGeo = new THREE.BoxGeometry(B * 0.48, 0.06 * scaleFactor, L * 0.34);
  disposables.push(cockpitSoleGeo);
  const cockpitSole = new THREE.Mesh(cockpitSoleGeo, teakMat);
  cockpitSole.position.set(0, 0.08 * scaleFactor, L * 0.27);
  hullPivot.add(cockpitSole);

  const benchGeo = new THREE.BoxGeometry(0.22 * scaleFactor, 0.22 * scaleFactor, L * 0.26);
  disposables.push(benchGeo);
  [-1, 1].forEach((side) => {
    const bench = new THREE.Mesh(benchGeo, teakMat);
    bench.position.set(side * B * 0.22, 0.22 * scaleFactor, L * 0.25);
    hullPivot.add(bench);
  });

  // 3. Cabin Coachroof & Companionway (Generous headroom, inset cleanly inside hull)
  const roofWidth = B * 0.58;
  const roofLength = L * 0.34;
  const roofZ = -L * 0.06;
  const roofY = 0.88 * scaleFactor;

  const coachTopGeo = new THREE.BoxGeometry(roofWidth, 0.07 * scaleFactor, roofLength);
  disposables.push(coachTopGeo);
  const coachTop = new THREE.Mesh(coachTopGeo, coachroofMat);
  coachTop.position.set(0, roofY, roofZ);
  coachTop.castShadow = !isSoftwareGl;
  hullPivot.add(coachTop);

  // Cabin side walls with glazed portlights
  const sideWallGeo = new THREE.BoxGeometry(0.055 * scaleFactor, 0.42 * scaleFactor, roofLength);
  const portlightGeo = new THREE.BoxGeometry(0.07 * scaleFactor, 0.14 * scaleFactor, roofLength * 0.55);
  disposables.push(sideWallGeo, portlightGeo);
  [-1, 1].forEach((side) => {
    const wall = new THREE.Mesh(sideWallGeo, coachroofMat);
    wall.position.set(side * (roofWidth * 0.48), roofY - 0.22 * scaleFactor, roofZ);
    hullPivot.add(wall);

    const glass = new THREE.Mesh(portlightGeo, glassMat);
    glass.position.set(side * (roofWidth * 0.49), roofY - 0.19 * scaleFactor, roofZ);
    hullPivot.add(glass);
  });

  // Forward cabin bulkhead (kept narrow so it never pokes through hull sides)
  const fwdBulkGeo = new THREE.BoxGeometry(roofWidth * 0.86, 0.82 * scaleFactor, 0.07 * scaleFactor);
  disposables.push(fwdBulkGeo);
  const fwdBulk = new THREE.Mesh(fwdBulkGeo, mahoganyMat);
  fwdBulk.position.set(0, 0.42 * scaleFactor, roofZ - roofLength * 0.48);
  hullPivot.add(fwdBulk);

  // Cabin floor & mahogany settees (narrowed to stay well inside curved hull bilge)
  const cabinFloorGeo = new THREE.BoxGeometry(roofWidth * 0.62, 0.05 * scaleFactor, roofLength * 0.92);
  disposables.push(cabinFloorGeo);
  const cabinFloor = new THREE.Mesh(cabinFloorGeo, teakMat);
  cabinFloor.position.set(0, 0.02 * scaleFactor, roofZ);
  hullPivot.add(cabinFloor);

  // Mahogany Chart Table (Port side inside cabin)
  const tableGeo = new THREE.BoxGeometry(0.38 * scaleFactor, 0.34 * scaleFactor, 0.44 * scaleFactor);
  disposables.push(tableGeo);
  const chartTable = new THREE.Mesh(tableGeo, mahoganyMat);
  chartTable.position.set(-roofWidth * 0.22, 0.22 * scaleFactor, roofZ - 0.04 * scaleFactor);
  hullPivot.add(chartTable);

  // Cabin Dome Light
  const lampGeo = new THREE.CylinderGeometry(0.07 * scaleFactor, 0.07 * scaleFactor, 0.04 * scaleFactor, 14);
  disposables.push(lampGeo);
  const cabinLamp = new THREE.Mesh(lampGeo, cabinLampMat);
  cabinLamp.position.set(0, roofY - 0.06 * scaleFactor, roofZ + 0.08 * scaleFactor);
  hullPivot.add(cabinLamp);
  registerInteractive(cabinLamp, 'toggle-cabin-lights', 'Cabin Dome Light Switch');

  const cabinLight = new THREE.PointLight(0xffcb7d, 1.8, 5.0 * scaleFactor, 1.4);
  cabinLight.position.set(0, roofY - 0.14 * scaleFactor, roofZ + 0.05 * scaleFactor);
  hullPivot.add(cabinLight);

  // 4. Interactive 12V Breaker Switch Panel (inside Cabin on Port bulkhead)
  const panelGeo = new THREE.BoxGeometry(0.32 * scaleFactor, 0.32 * scaleFactor, 0.04 * scaleFactor);
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.switchPanel,
    roughness: 0.4,
    metalness: 0.35,
  });
  disposables.push(panelGeo, panelMat);
  const breakerPanel = new THREE.Mesh(panelGeo, panelMat);
  breakerPanel.position.set(-roofWidth * 0.22, 0.56 * scaleFactor, roofZ - roofLength * 0.42);
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
  const swGeo = new THREE.BoxGeometry(0.055 * scaleFactor, 0.028 * scaleFactor, 0.03 * scaleFactor);
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
      -roofWidth * 0.22 + 0.08 * scaleFactor,
      0.64 * scaleFactor - idx * 0.036 * scaleFactor,
      roofZ - roofLength * 0.4,
    );
    hullPivot.add(sw);
    breakerMeshes[b.key] = sw;
    registerInteractive(sw, b.action, b.label);
  });

  // 5. Interactive VHF Radio & Galley Fridge inside Cabin (Starboard side)
  const vhfBodyGeo = new THREE.BoxGeometry(0.24 * scaleFactor, 0.12 * scaleFactor, 0.14 * scaleFactor);
  const vhfBodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.4 });
  const vhfScreenGeo = new THREE.PlaneGeometry(0.14 * scaleFactor, 0.06 * scaleFactor);
  disposables.push(vhfBodyGeo, vhfBodyMat, vhfScreenGeo);

  const vhfRadio = new THREE.Mesh(vhfBodyGeo, vhfBodyMat);
  vhfRadio.position.set(roofWidth * 0.18, 0.56 * scaleFactor, roofZ - roofLength * 0.4);
  hullPivot.add(vhfRadio);
  const vhfScreen = new THREE.Mesh(vhfScreenGeo, vhfScreenMat);
  vhfScreen.position.set(0, 0, 0.072 * scaleFactor);
  vhfRadio.add(vhfScreen);
  registerInteractive(vhfRadio, 'toggle-vhf', 'VHF Radio & Weatherfax');

  const fridgeGeo = new THREE.BoxGeometry(0.36 * scaleFactor, 0.34 * scaleFactor, 0.4 * scaleFactor);
  const fridgeMat = new THREE.MeshStandardMaterial({ color: 0xdbe4ee, roughness: 0.35, metalness: 0.2 });
  disposables.push(fridgeGeo, fridgeMat);
  const fridgeBox = new THREE.Mesh(fridgeGeo, fridgeMat);
  fridgeBox.position.set(roofWidth * 0.21, 0.22 * scaleFactor, roofZ - 0.06 * scaleFactor);
  hullPivot.add(fridgeBox);
  registerInteractive(fridgeBox, 'toggle-fridge', '12V Galley Fridge & Provisions');

  // 6. Cockpit Binnacle / Compass, Winches, Tiller or Helm Wheel
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
  binnacle.position.set(0, 0.42 * scaleFactor, L * 0.18);
  hullPivot.add(binnacle);

  const compassCardMesh = new THREE.Mesh(compFaceGeo, compFaceMat);
  compassCardMesh.rotation.x = -Math.PI / 2;
  compassCardMesh.position.set(0, 0.085 * scaleFactor, 0);
  binnacle.add(compassCardMesh);
  registerInteractive(binnacle, 'toggle-instruments', 'Binnacle Compass & Instruments');

  // Helm control: Tiller (Elan 19) or Stainless Wheel (Rustler 36)
  let helmControlMesh: THREE.Object3D;
  if (spec.hasWheel) {
    const wheelGroup = new THREE.Group();
    const pedGeo = new THREE.CylinderGeometry(0.11 * scaleFactor, 0.14 * scaleFactor, 0.72 * scaleFactor, 12);
    const rimGeo = new THREE.TorusGeometry(0.42 * scaleFactor, 0.025 * scaleFactor, 10, 24);
    disposables.push(pedGeo, rimGeo);
    const ped = new THREE.Mesh(pedGeo, coachroofMat);
    ped.position.set(0, 0.36 * scaleFactor, L * 0.36);
    hullPivot.add(ped);

    const wheelRim = new THREE.Mesh(rimGeo, stainlessMat);
    wheelGroup.position.set(0, 0.68 * scaleFactor, L * 0.32);
    wheelGroup.add(wheelRim);
    const spokeGeo = new THREE.CylinderGeometry(0.014 * scaleFactor, 0.014 * scaleFactor, 0.82 * scaleFactor, 8);
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

  // Port & Starboard Brass/Chrome Sheet Winches (clickable to trim sails!)
  const winchGeo = new THREE.CylinderGeometry(0.075 * scaleFactor, 0.095 * scaleFactor, 0.14 * scaleFactor, 14);
  disposables.push(winchGeo);
  const mainWinch = new THREE.Mesh(winchGeo, brassMat);
  mainWinch.position.set(-B * 0.34, 0.54 * scaleFactor, L * 0.18);
  hullPivot.add(mainWinch);
  registerInteractive(mainWinch, 'trim-main-in', 'Mainsheet Winch (Click to Trim)');

  const jibWinch = new THREE.Mesh(winchGeo, stainlessMat);
  jibWinch.position.set(B * 0.34, 0.54 * scaleFactor, L * 0.18);
  hullPivot.add(jibWinch);
  registerInteractive(jibWinch, 'trim-jib-in', 'Jib Sheet Winch (Click to Trim)');

  // 7. Stern Solar Panel Arch & Windvane Self-Steering
  const solarFrameGeo = new THREE.BoxGeometry(0.95 * scaleFactor, 0.04 * scaleFactor, 0.62 * scaleFactor);
  const solarCellMat = new THREE.MeshStandardMaterial({
    color: 0x102848,
    roughness: 0.18,
    metalness: 0.72,
  });
  disposables.push(solarFrameGeo, solarCellMat);
  const solarPanel = new THREE.Mesh(solarFrameGeo, solarCellMat);
  solarPanel.position.set(0, 0.92 * scaleFactor, L * 0.49);
  solarPanel.rotation.x = 0.15;
  hullPivot.add(solarPanel);

  // Windvane paddle at transom
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

  // 8. Mast, Spreaders, Standing Rigging, Boom & Dynamic Sails (Deck-stepped at coachroof y=0.88)
  const mastBaseY = 0.88 * scaleFactor;
  const mastGeo = new THREE.CylinderGeometry(0.055 * scaleFactor, 0.08 * scaleFactor, mastH, 12);
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xd9e1ea, roughness: 0.32, metalness: 0.85 });
  disposables.push(mastGeo, mastMat);
  const mastMesh = new THREE.Mesh(mastGeo, mastMat);
  mastMesh.position.set(0, mastBaseY + mastH * 0.5, -L * 0.08);
  mastMesh.castShadow = !isSoftwareGl;
  hullPivot.add(mastMesh);

  // Spreaders
  const spreaderGeo = new THREE.BoxGeometry(B * 0.78, 0.04 * scaleFactor, 0.05 * scaleFactor);
  disposables.push(spreaderGeo);
  const spreaders = new THREE.Mesh(spreaderGeo, mastMat);
  spreaders.position.set(0, mastBaseY + mastH * 0.55, -L * 0.08);
  hullPivot.add(spreaders);

  // Masthead Navigation Light
  const navLightGeo = new THREE.SphereGeometry(0.09 * scaleFactor, 10, 10);
  disposables.push(navLightGeo);
  const navLight = new THREE.Mesh(navLightGeo, navLightMat);
  navLight.position.set(0, mastBaseY + mastH + 0.08 * scaleFactor, -L * 0.08);
  hullPivot.add(navLight);

  // Standing Rigging Shrouds & Stays
  const shroudMat = new THREE.LineBasicMaterial({ color: 0xcbd5e1 });
  disposables.push(shroudMat);
  const mastTop = new THREE.Vector3(0, mastBaseY + mastH, -L * 0.08);
  const stayTargets = [
    new THREE.Vector3(0, 0.52 * scaleFactor, -L * 0.49), // forestay
    new THREE.Vector3(0, 0.52 * scaleFactor, L * 0.49), // backstay
    new THREE.Vector3(-B * 0.44, 0.5 * scaleFactor, -L * 0.04), // port shroud
    new THREE.Vector3(B * 0.44, 0.5 * scaleFactor, -L * 0.04), // stbd shroud
  ];
  stayTargets.forEach((pt) => {
    const lineGeo = new THREE.BufferGeometry().setFromPoints([mastTop, pt]);
    disposables.push(lineGeo);
    hullPivot.add(new THREE.Line(lineGeo, shroudMat));
  });

  // Boom + Mainsail Group
  const boomPivot = new THREE.Group();
  boomPivot.position.set(0, 1.28 * scaleFactor, -L * 0.08);
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

  // Jib / Foresail (luff runs along angled forestay from bow stem up to masthead!)
  const jibHeight = mastH - 0.45 * scaleFactor;
  const jibFoot = L * 0.4;
  const forestayRakeZ = L * 0.39; // bow (-0.47L) -> mast (-0.08L)
  const jibGeo = createJibGeometry(jibFoot, forestayRakeZ, jibHeight, 8, 12);
  disposables.push(jibGeo);
  const jibMesh = new THREE.Mesh(jibGeo, sailMat);
  jibMesh.position.set(0, 0.54 * scaleFactor, -L * 0.47);
  jibMesh.castShadow = !isSoftwareGl;
  hullPivot.add(jibMesh);

  // 9. Bow Anchor Roller & Deployed Chain Line
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
  const helmEyeLocal = new THREE.Vector3(-0.34 * scaleFactor, 1.62 * scaleFactor, L * 0.36);
  const helmLookLocal = new THREE.Vector3(-0.08 * scaleFactor, 1.25 * scaleFactor, -L * 0.85);

  const cabinEyeLocal = new THREE.Vector3(0.02 * scaleFactor, 0.52 * scaleFactor, roofZ + roofLength * 0.42);
  const cabinLookLocal = new THREE.Vector3(-0.04 * scaleFactor, 0.42 * scaleFactor, roofZ - roofLength * 0.42);

  return {
    root,
    hullPivot,
    boomPivot,
    mainsailMesh,
    jibMesh,
    rudderMesh,
    helmControlMesh,
    windvanePaddle,
    compassCardMesh,
    navLightMat,
    cabinLight,
    cabinLampMat,
    vhfScreenMat,
    anchorGroup,
    anchorChainLine,
    breakerMeshes,
    interactables,
    helmEyeLocal,
    helmLookLocal,
    cabinEyeLocal,
    cabinLookLocal,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

export function syncBoatVisuals(
  boat: BuiltBoat,
  state: SimulationState,
  elapsedSec: number,
): void {
  // Heading & Heel (pitch modulated by Virtual Sailor NG pitchDampening)
  boat.root.rotation.y = -(state.headingDeg * Math.PI) / 180;
  const heelRad = (state.heelDeg * Math.PI) / 180;
  const pitchDamp = Math.max(0.5, state.vesselCfg?.pitchDampening ?? 1.0);
  const wavePitch = Math.sin(elapsedSec * 1.4) * ((0.015 + state.weather.waveHeightM * 0.012) / pitchDamp);
  const waveRoll = Math.cos(elapsedSec * 1.1) * (0.012 + state.weather.waveHeightM * 0.01);
  boat.hullPivot.rotation.z = heelRad + waveRoll;
  boat.hullPivot.rotation.x = wavePitch;
  boat.hullPivot.position.y = Math.sin(elapsedSec * 1.7) * (0.05 + state.weather.waveHeightM * 0.04);

  // Rudder & Helm Wheel/Tiller rotation
  const rudRad = (state.rudderAngleDeg * Math.PI) / 180;
  boat.rudderMesh.rotation.y = rudRad;
  if (boat.helmControlMesh) {
    boat.helmControlMesh.rotation.y = -rudRad * 0.7;
    boat.helmControlMesh.rotation.z = rudRad * 2.2;
  }

  // Compass card stays aligned to North
  boat.compassCardMesh.rotation.z = (state.headingDeg * Math.PI) / 180;

  // Boom & Mainsail angle driven directly by foil solver's boomSide & boomAngleDeg
  const boomSide = state.boomSide ?? -Math.sign(state.apparentWindAngleDeg || -1);
  const boomRad = ((state.boomAngleDeg ?? (boomSide * 28)) * Math.PI) / 180;
  const luffFlutter = state.isLuffing ? Math.sin(elapsedSec * 18) * 0.09 : 0;
  boat.boomPivot.rotation.y = boomRad + luffFlutter;

  // Reefing shrinks mainsail vertically & reflects boom side camber
  const reefScaleY = state.reefLevel === 0 ? 1.0 : state.reefLevel === 1 ? 0.73 : 0.48;
  boat.mainsailMesh.scale.set(
    boomSide * (0.7 + (1 - state.mainsheetPct / 100) * 0.65),
    reefScaleY,
    1.0,
  );

  // Jib deployment & trim
  boat.jibMesh.visible = state.jibDeployed;
  if (state.jibDeployed) {
    const jibOut = ((100 - state.jibsheetPct) / 100) * 0.48 + 0.05;
    boat.jibMesh.rotation.y = boomSide * jibOut + luffFlutter * 0.7;
    boat.jibMesh.scale.x = boomSide * (0.75 + (1 - state.jibsheetPct / 100) * 0.5);
  }

  // Windvane paddle indicator
  boat.windvanePaddle.rotation.y =
    state.autopilotMode === 'windvane' ? Math.sin(elapsedSec * 2.5) * 0.15 : 0;

  // Anchor visibility
  boat.anchorGroup.visible = !state.anchor.deployed;
  boat.anchorChainLine.visible = state.anchor.deployed;

  // Electrical Lights & Breaker Switch indicators
  boat.navLightMat.emissiveIntensity = state.electrical.navLights ? 2.2 : 0.0;
  boat.cabinLight.intensity = state.electrical.cabinLights ? 1.6 : 0.0;
  boat.cabinLampMat.emissiveIntensity = state.electrical.cabinLights ? 1.2 : 0.05;
  boat.vhfScreenMat.emissiveIntensity = state.electrical.vhfRadio ? 1.0 : 0.0;

  Object.entries(boat.breakerMeshes).forEach(([key, mesh]) => {
    const isOn = Boolean(state.electrical[key as keyof typeof state.electrical]);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(isOn ? 0x10b981 : 0x475569);
    mat.emissive.setHex(isOn ? 0x10b981 : 0x000000);
    mat.emissiveIntensity = isOn ? 0.85 : 0.0;
    mesh.rotation.x = isOn ? -0.25 : 0.25;
  });
}

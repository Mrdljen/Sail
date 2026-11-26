import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildSailboatModel, syncBoatVisuals, type BuiltBoat, type InteractiveAction } from './boatBuilder';
import { createProceduralTextures } from './proceduralTextures';
import type { BoatId, CameraViewMode, GameScreenState, SimulationState } from '../types/sailing';

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _invBoatMat = new THREE.Matrix4();
const _skyColor = new THREE.Color();
const _sunColor = new THREE.Color();
const _skyZenithColor = new THREE.Color();
const _tradeFog = new THREE.Color(0x9bd2ea);
const _squallFog = new THREE.Color(0x283848);
const _nightFog = new THREE.Color(0x091322);
const _tradeZenith = new THREE.Color(0x1f5c94);
const _squallZenith = new THREE.Color(0x1a2633);
const _nightZenith = new THREE.Color(0x040914);
const _tradeSun = new THREE.Color(0xfff1d6);
const _sunsetSun = new THREE.Color(0xff9f5a);
const _squallSun = new THREE.Color(0x7c8fa3);

// Coupled 6-wave Gerstner spectrum (CPU + GLSL twin, inspired by tides-of-fortune waves.js)
interface GerstnerWave {
  dirX: number;
  dirZ: number;
  lambda: number;
  amp: number;
  q: number;
  speed: number;
}

const GERSTNER_WAVES: readonly GerstnerWave[] = [
  { dirX: 0.84, dirZ: 0.54, lambda: 76, amp: 0.42, q: 0.45, speed: 1.35 },
  { dirX: -0.45, dirZ: 0.89, lambda: 48, amp: 0.27, q: 0.42, speed: 1.72 },
  { dirX: 0.66, dirZ: -0.75, lambda: 27, amp: 0.14, q: 0.36, speed: 2.25 },
  { dirX: 0.92, dirZ: -0.39, lambda: 15, amp: 0.075, q: 0.30, speed: 2.90 },
  { dirX: -0.72, dirZ: -0.69, lambda: 9.5, amp: 0.042, q: 0.24, speed: 3.40 },
  { dirX: 0.32, dirZ: 0.95, lambda: 5.8, amp: 0.022, q: 0.20, speed: 4.10 },
];

function sampleGerstnerMotion(
  elapsedSec: number,
  offsetX: number,
  offsetZ: number,
  waveHeightM: number,
  headingDeg: number,
): { heaveM: number; pitchRad: number; rollRad: number } {
  const waveScale = THREE.MathUtils.clamp(waveHeightM, 0.25, 3.8) * 0.58;
  let h = 0;
  let dHx = 0;
  let dHz = 0;

  for (let i = 0; i < GERSTNER_WAVES.length; i++) {
    const w = GERSTNER_WAVES[i];
    const k = (Math.PI * 2) / w.lambda;
    const amp = w.amp * waveScale;
    const ph = (w.dirX * offsetX + w.dirZ * offsetZ) * k - elapsedSec * w.speed;
    h += amp * Math.sin(ph);
    // Low-pass large swell slopes (>14m wavelength) so small boat deck feels natural inertia
    if (w.lambda >= 14) {
      const slopeWeight = w.lambda >= 40 ? 1.0 : 0.45;
      const c = Math.cos(ph) * amp * k * slopeWeight;
      dHx += c * w.dirX;
      dHz += c * w.dirZ;
    }
  }

  // Boat forward axis in world XZ: (sin(hdg), -cos(hdg)); starboard right: (cos(hdg), sin(hdg))
  const hRad = THREE.MathUtils.degToRad(headingDeg);
  const fwdX = Math.sin(hRad);
  const fwdZ = -Math.cos(hRad);
  const rightX = Math.cos(hRad);
  const rightZ = Math.sin(hRad);

  const pitchSlope = dHx * fwdX + dHz * fwdZ;
  const rollSlope = dHx * rightX + dHz * rightZ;

  return {
    heaveM: h,
    pitchRad: THREE.MathUtils.clamp(Math.atan(pitchSlope) * 0.78, -0.24, 0.24),
    rollRad: THREE.MathUtils.clamp(-Math.atan(rollSlope) * 0.68, -0.22, 0.22),
  };
}

export interface OceanSceneCallbacks {
  getState: () => SimulationState;
  getScreenState: () => GameScreenState;
  getCameraMode: () => CameraViewMode;
  onTickSimulation: (dtSeconds: number) => void;
  onInteract3D: (action: InteractiveAction) => void;
  onHover3D: (label: string | null, x: number, y: number) => void;
}

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createStarfield(): { points: THREE.Points; material: THREE.PointsMaterial; dispose: () => void } {
  const count = 420;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = ((i * 137.5) % 360) * (Math.PI / 180);
    const phi = Math.acos(0.12 + ((i * 29) % 100) / 115);
    const r = 950;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xf8fafc,
    size: 2.8,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, material);
  return {
    points,
    material,
    dispose: () => {
      geo.dispose();
      material.dispose();
    },
  };
}

function createDistantVessel(hullColor: number): { group: THREE.Group; dispose: () => void } {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const hullGeo = new THREE.ConeGeometry(1.1, 6.2, 6);
  hullGeo.rotateX(Math.PI / 2);
  hullGeo.scale(1.0, 0.48, 1.0);
  const hullMat = new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.4 });
  const mastGeo = new THREE.CylinderGeometry(0.05, 0.07, 7.6, 6);
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.7, roughness: 0.3 });
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 1.1, 0, 0, 7.8, 0, 0, 1.1, 2.5, 0, 1.1, 0, 0, 7.8, 0, 0, 1.1, -2.1], 3),
  );
  sailGeo.computeVertexNormals();
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xf8f6ef, roughness: 0.75, side: THREE.DoubleSide });

  disposables.push(hullGeo, hullMat, mastGeo, mastMat, sailGeo, sailMat);

  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 0.2;
  const mast = new THREE.Mesh(mastGeo, mastMat);
  mast.position.y = 4.2;
  const sails = new THREE.Mesh(sailGeo, sailMat);
  group.add(hull, mast, sails);

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

function createIslandGroup(
  seedOffset: number,
  isSoftwareGl: boolean,
  hasQuay: boolean,
): { group: THREE.Group; dispose: () => void } {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const islandGeo = new THREE.ConeGeometry(95, 36, 20, 4);
  const pos = islandGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const ridge = Math.sin(angle * 3 + seedOffset) * 0.22 + Math.cos(angle * 5 - seedOffset) * 0.14;
    if (y < 14) {
      pos.setX(i, x * (1 + ridge));
      pos.setZ(i, z * (1 + ridge));
    }
  }
  islandGeo.computeVertexNormals();
  const islandMat = new THREE.MeshStandardMaterial({
    color: 0x3b5e42,
    roughness: 0.88,
    metalness: 0.02,
    flatShading: true,
  });
  disposables.push(islandGeo, islandMat);

  const islandMesh = new THREE.Mesh(islandGeo, islandMat);
  islandMesh.position.set(0, 13, 0);
  islandMesh.receiveShadow = !isSoftwareGl;
  group.add(islandMesh);

  // Sandy beach ring
  const beachGeo = new THREE.CylinderGeometry(102, 114, 3.2, 24);
  const beachMat = new THREE.MeshStandardMaterial({
    color: 0xdcc79c,
    roughness: 0.92,
  });
  disposables.push(beachGeo, beachMat);
  const beach = new THREE.Mesh(beachGeo, beachMat);
  beach.position.set(0, -0.4, 0);
  group.add(beach);

  // Coastal Lighthouse tower + beacon
  const towerGeo = new THREE.CylinderGeometry(1.4, 2.2, 16, 12);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
  const beaconGeo = new THREE.SphereGeometry(1.1, 10, 10);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 2.0,
  });
  disposables.push(towerGeo, towerMat, beaconGeo, beaconMat);
  const tower = new THREE.Mesh(towerGeo, towerMat);
  tower.position.set(22, 16, 16);
  group.add(tower);
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.set(22, 24.5, 16);
  group.add(beacon);

  // Harbor stone quay / pier for chandlery dock
  if (hasQuay) {
    const quayGeo = new THREE.BoxGeometry(28, 2.6, 8);
    const quayMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.85 });
    const shedGeo = new THREE.BoxGeometry(8, 4.5, 5.5);
    const shedMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.72 });
    disposables.push(quayGeo, quayMat, shedGeo, shedMat);

    const quay = new THREE.Mesh(quayGeo, quayMat);
    quay.position.set(0, 1.0, 96);
    group.add(quay);

    const chandleryShed = new THREE.Mesh(shedGeo, shedMat);
    chandleryShed.position.set(-4, 4.2, 95);
    group.add(chandleryShed);
  }

  // Harbor Channel Marker Buoys (Red Port & Green Starboard lateral buoys guarding safe channel)
  const buoyBaseGeo = new THREE.CylinderGeometry(1.1, 1.3, 1.6, 8);
  const buoyTopGeo = new THREE.ConeGeometry(0.65, 1.8, 8);
  const redBuoyMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45, emissive: 0x7f1d1d, emissiveIntensity: 0.4 });
  const greenBuoyMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.45, emissive: 0x14532d, emissiveIntensity: 0.4 });
  disposables.push(buoyBaseGeo, buoyTopGeo, redBuoyMat, greenBuoyMat);

  [-36, 36].forEach((bz, idx) => {
    const mat = idx === 0 ? redBuoyMat : greenBuoyMat;
    const bBase = new THREE.Mesh(buoyBaseGeo, mat);
    bBase.position.set(seedOffset < 2 ? 128 : -128, 0.5, bz);
    const bTop = new THREE.Mesh(buoyTopGeo, mat);
    bTop.position.set(0, 1.4, 0);
    bBase.add(bTop);
    group.add(bBase);
  });

  // Instanced coastal trees (24 instances)
  const treeCount = 24;
  const treeGeo = new THREE.ConeGeometry(2.8, 9.5, 7);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.85 });
  disposables.push(treeGeo, treeMat);
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeCount);
  const color = new THREE.Color();
  for (let i = 0; i < treeCount; i++) {
    const ang = (i / treeCount) * Math.PI * 2 + seedOffset;
    const rad = 36 + ((i * 17) % 32);
    const scale = 0.85 + ((i * 7) % 5) * 0.08;
    _v1.set(Math.cos(ang) * rad, 8 + (1 - rad / 95) * 14, Math.sin(ang) * rad);
    _mat4.makeTranslation(_v1.x, _v1.y, _v1.z);
    _mat4.scale(_v2.set(scale, scale, scale));
    trees.setMatrixAt(i, _mat4);
    color.setHSL(0.38 + ((i % 4) - 1.5) * 0.02, 0.45, 0.28 + (i % 3) * 0.04);
    trees.setColorAt(i, color);
  }
  trees.instanceMatrix.needsUpdate = true;
  if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
  trees.computeBoundingSphere();
  group.add(trees);

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

export class SailingSceneController {
  private container: HTMLElement;
  private callbacks: OceanSceneCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private textures: ReturnType<typeof createProceduralTextures>;
  private currentBoatId: BoatId;
  private boat: BuiltBoat;
  private sky: Sky;
  private starfield: ReturnType<typeof createStarfield>;
  private departureIsland: ReturnType<typeof createIslandGroup>;
  private destinationIsland: ReturnType<typeof createIslandGroup>;
  private harborVessels: Array<ReturnType<typeof createDistantVessel>>;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private oceanUniforms = {
    uTime: { value: 0 },
    uWaveHeight: { value: 1.1 },
    uOffset: { value: new THREE.Vector2(0, 0) },
    uShoalMix: { value: 0.4 },
    uSquallMix: { value: 0.2 },
    uSunDir: { value: new THREE.Vector3(0.4, 0.65, -0.5).normalize() },
    uSkyHorizon: { value: new THREE.Color(0x9bd2ea) },
    uSkyZenith: { value: new THREE.Color(0x1f5c94) },
    uBoatInvMatrix: { value: new THREE.Matrix4() },
    uBoatHull: { value: new THREE.Vector3(5.9, 2.38, 1.0) },
    uDetailMap: { value: null as THREE.Texture | null },
    uFoamMap: { value: null as THREE.Texture | null },
  };
  private wakeMesh: THREE.InstancedMesh;
  private wakeLife = new Float32Array(42);
  private wakePos = new Float32Array(42 * 3);
  private wakeIndex = 0;
  private sprayMesh: THREE.InstancedMesh;
  private sprayLife = new Float32Array(32);
  private sprayPos = new Float32Array(32 * 3);
  private sprayVel = new Float32Array(32 * 3);
  private sprayIndex = 0;
  private rainMesh: THREE.InstancedMesh;
  private rainOffsets = new Float32Array(120 * 3);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private lastHoverCheck = 0;
  private orbitYaw = 0.65;
  private orbitPitch = 0.28;
  private orbitDist = 14.5;
  // 1st-person look offset (allows looking around inside Helm & Cabin views)
  private fpLookYaw = 0;
  private fpLookPitch = 0;
  private activePointers = new Map<number, { x: number; y: number }>();
  private pinchLastDist = 0;
  private tapStartX = 0;
  private tapStartY = 0;
  private dragMoved = false;
  private lastCamKey = '';
  private camPosCurrent = new THREE.Vector3(-12, 6, 10);
  private camLookCurrent = new THREE.Vector3(0, 2, 0);
  private lastFrameMs = performance.now();
  private lastInstrumentRedrawMs = 0;
  private elapsedSec = 0;
  private frameId = 0;
  private disposed = false;
  private disposables: Array<{ dispose: () => void }> = [];

  constructor(container: HTMLElement, callbacks: OceanSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    const renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.52;
    renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = !this.isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x5fa4d4);
    scene.fog = new THREE.FogExp2(0x7cb7dc, 0.00058);
    this.scene = scene;

    // Studio Environment Reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();
    this.disposables.push(envTex);

    const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    const camera = new THREE.PerspectiveCamera(54, aspect, 0.14, 2400);
    camera.position.copy(this.camPosCurrent);
    this.camera = camera;

    // Procedural Atmospheric Sky Dome (Sky.js) + Starfield
    const sky = new Sky();
    sky.scale.setScalar(1800);
    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 2.4;
    skyUniforms['rayleigh'].value = 1.9;
    skyUniforms['mieCoefficient'].value = 0.0038;
    skyUniforms['mieDirectionalG'].value = 0.78;
    scene.add(sky);
    this.sky = sky;
    this.disposables.push(sky.geometry, sky.material);

    this.starfield = createStarfield();
    scene.add(this.starfield.points);

    // Balanced Maritime Lighting
    const hemiLight = new THREE.HemisphereLight(0xb8e1ff, 0x0b2a3c, 1.05);
    scene.add(hemiLight);
    this.hemiLight = hemiLight;

    const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.5);
    sunLight.position.set(55, 65, -50);
    if (!this.isSoftwareGl) {
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.set(1024, 1024);
      sunLight.shadow.camera.left = -22;
      sunLight.shadow.camera.right = 22;
      sunLight.shadow.camera.top = 22;
      sunLight.shadow.camera.bottom = -22;
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.02;
    }
    scene.add(sunLight);
    this.sunLight = sunLight;

    // Procedural textures & initial boat
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    const initialState = callbacks.getState();
    this.textures.updateCabinInstruments(initialState);
    this.currentBoatId = initialState.boatId;
    this.boat = buildSailboatModel(this.currentBoatId, this.textures, this.isSoftwareGl);
    scene.add(this.boat.root);

    // Upgraded Coupled 6-Wave Gerstner Ocean with Jacobian Whitecaps, Fresnel/SSS & Hull Cavity Exclusion
    const oceanSegs = this.isSoftwareGl ? 76 : 120;
    const oceanGeo = new THREE.PlaneGeometry(1400, 1400, oceanSegs, oceanSegs);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0.05,
      envMapIntensity: 0.45,
    });
    const uniforms = this.oceanUniforms;
    uniforms.uDetailMap.value = this.textures.oceanNormalTex;
    uniforms.uFoamMap.value = this.textures.oceanFoamTex;

    const waveConstsGlsl = GERSTNER_WAVES.map(
      (w, idx) =>
        `const vec4 W_${idx} = vec4(${w.dirX.toFixed(4)}, ${w.dirZ.toFixed(4)}, ${((Math.PI * 2) / w.lambda).toFixed(5)}, ${w.amp.toFixed(4)}); const vec2 WS_${idx} = vec2(${w.q.toFixed(3)}, ${w.speed.toFixed(3)});`,
    ).join('\n');

    oceanMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWaveHeight = uniforms.uWaveHeight;
      shader.uniforms.uOffset = uniforms.uOffset;
      shader.uniforms.uShoalMix = uniforms.uShoalMix;
      shader.uniforms.uSquallMix = uniforms.uSquallMix;
      shader.uniforms.uSunDir = uniforms.uSunDir;
      shader.uniforms.uSkyHorizon = uniforms.uSkyHorizon;
      shader.uniforms.uSkyZenith = uniforms.uSkyZenith;
      shader.uniforms.uBoatInvMatrix = uniforms.uBoatInvMatrix;
      shader.uniforms.uBoatHull = uniforms.uBoatHull;
      shader.uniforms.uDetailMap = uniforms.uDetailMap;
      shader.uniforms.uFoamMap = uniforms.uFoamMap;

      shader.vertexShader =
        `
        uniform float uTime;
        uniform float uWaveHeight;
        uniform vec2 uOffset;
        varying float vWaveCrest;
        varying float vJac;
        varying vec3 vWorldPos;
        varying vec2 vSeaUv;
        varying vec3 vWaveSlope;
        ${waveConstsGlsl}

        void evalWave(vec2 wp, vec4 w, vec2 ws, float waveScale, inout vec3 disp, inout vec3 tx, inout vec3 tz) {
          float k = w.z;
          float a = w.w * waveScale;
          float qa = ws.x * a;
          float ph = dot(w.xy, wp) * k - uTime * ws.y;
          float s = sin(ph);
          float c = cos(ph);
          disp.xz += w.xy * (qa * c);
          disp.y += a * s;
          float qk = qa * k * s;
          float ak = a * k * c;
          tx += vec3(-qk * w.x * w.x, ak * w.x, -qk * w.x * w.y);
          tz += vec3(-qk * w.x * w.y, ak * w.y, -qk * w.y * w.y);
        }
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vec2 wp = transformed.xz + uOffset;
        float distCam = length(transformed.xz);
        float farAtten = 1.0 - smoothstep(220.0, 620.0, distCam);
        float waveScale = clamp(uWaveHeight, 0.25, 3.8) * 0.58 * farAtten;

        vec3 disp = vec3(0.0);
        vec3 tx = vec3(1.0, 0.0, 0.0);
        vec3 tz = vec3(0.0, 0.0, 1.0);
        evalWave(wp, W_0, WS_0, waveScale, disp, tx, tz);
        evalWave(wp, W_1, WS_1, waveScale, disp, tx, tz);
        evalWave(wp, W_2, WS_2, waveScale, disp, tx, tz);
        evalWave(wp, W_3, WS_3, waveScale, disp, tx, tz);
        evalWave(wp, W_4, WS_4, waveScale, disp, tx, tz);
        evalWave(wp, W_5, WS_5, waveScale, disp, tx, tz);

        transformed += disp;
        vWorldPos = transformed;
        vSeaUv = wp + disp.xz;
        vWaveCrest = clamp((disp.y / max(0.35, waveScale * 0.9)) * 0.55 + 0.5, 0.0, 1.0);
        vJac = tx.x * tz.z - tx.z * tz.x;
        vWaveSlope = normalize(cross(tz, tx));
        `,
      );

      shader.fragmentShader =
        `
        uniform float uTime;
        uniform float uWaveHeight;
        uniform float uShoalMix;
        uniform float uSquallMix;
        uniform vec3 uSunDir;
        uniform vec3 uSkyHorizon;
        uniform vec3 uSkyZenith;
        uniform mat4 uBoatInvMatrix;
        uniform vec3 uBoatHull;
        uniform sampler2D uDetailMap;
        uniform sampler2D uFoamMap;
        varying float vWaveCrest;
        varying float vJac;
        varying vec3 vWorldPos;
        varying vec2 vSeaUv;
        varying vec3 vWaveSlope;

        float glslHullHalfWidth(float t, float beam) {
          float tc = clamp(t, 0.001, 0.999);
          float widthFactor = tc < 0.52
            ? pow(max(sin((tc / 0.52) * 1.5707963), 0.0001), 0.76)
            : 1.0 - pow(max((tc - 0.52) / 0.48, 0.0001), 1.75) * 0.34;
          float bowFlare = tc < 0.25 ? (0.25 - tc) * 0.32 : 0.0;
          return (beam * 0.5) * widthFactor * (1.0 + bowFlare);
        }

        float glslHullGunwaleY(float t, float scaleFactor) {
          float tc = clamp(t, 0.0, 1.0);
          float fRise = tc < 0.48 ? pow(max(0.48 - tc, 0.0001), 1.65) * 0.34 : 0.0;
          float sRise = tc > 0.78 ? (tc - 0.78) * 0.22 : 0.0;
          return (0.44 + fRise + sRise) * scaleFactor;
        }
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        // Per-pixel dry hull interior exclusion: discard water inside cockpit, cabin & bilge envelope
        vec3 bPos = (uBoatInvMatrix * vec4(vWorldPos, 1.0)).xyz;
        float bt = bPos.z / max(1.0, uBoatHull.x) + 0.5;
        float hullHw = glslHullHalfWidth(bt, uBoatHull.y);
        float hullGy = glslHullGunwaleY(bt, uBoatHull.z);
        if (
          bt > 0.015 && bt < 0.985 &&
          abs(bPos.x) < hullHw * 0.96 &&
          bPos.y < hullGy + 0.40 * uBoatHull.z &&
          bPos.y > -1.25 * uBoatHull.z
        ) {
          discard;
        }

        // Dual-scrolling procedural capillary ripples faded with distance (tides-of-fortune pattern)
        float camDist = length(cameraPosition - vWorldPos);
        float detFade = 1.0 - smoothstep(32.0, 260.0, camDist);
        vec2 nUv1 = vSeaUv * 0.068 + vec2(uTime * 0.032, uTime * 0.018);
        vec2 nUv2 = vSeaUv * 0.145 + vec2(-uTime * 0.024, uTime * 0.036);
        vec2 dn = (texture2D(uDetailMap, nUv1).rg - 0.5) * 0.55 + (texture2D(uDetailMap, nUv2).rg - 0.5) * 0.42;
        float rippleStr = (0.14 + 0.10 * clamp(uWaveHeight * 0.45, 0.0, 1.0)) * detFade;
        vec3 Nworld = normalize(vWaveSlope + vec3(dn.x * rippleStr, 0.0, dn.y * rippleStr));

        vec3 Vw = normalize(cameraPosition - vWorldPos);
        vec3 Lw = normalize(uSunDir);
        float rFar = smoothstep(55.0, 520.0, camDist);

        // Base absorption + coastal shoal palette
        vec3 deepCobalt = vec3(0.010, 0.062, 0.155);
        vec3 coastalTurquoise = vec3(0.032, 0.295, 0.345);
        vec3 waterCol = mix(deepCobalt, coastalTurquoise, uShoalMix * 0.65);

        // Subsurface crest scatter (back-lit green-cyan translucency in steep wave crests)
        float sssDir = pow(clamp(dot(Vw, -Lw), 0.0, 1.0), 3.0) * 0.65 + 0.35;
        vec3 sssCol = mix(vec3(0.025, 0.255, 0.335), vec3(0.095, 0.515, 0.485), uShoalMix * 0.72);
        waterCol = mix(waterCol, sssCol, clamp(vWaveCrest * 0.85 * sssDir, 0.0, 1.0));

        // Fresnel sky reflection + sun glint glitter
        vec3 NF = normalize(mix(Nworld, vec3(0.0, 1.0, 0.0), rFar * 0.65));
        float NdotV = max(dot(NF, Vw), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
        vec3 Rw = reflect(-Vw, NF);
        vec3 skyRefl = mix(uSkyHorizon, uSkyZenith, clamp(Rw.y * 1.4, 0.0, 1.0));
        skyRefl *= 1.0 - 0.32 * uSquallMix;
        waterCol = mix(waterCol, skyRefl, clamp(fres * 0.76, 0.0, 0.78));

        // Sun glitter highlights on capillary facets
        vec3 Hw = normalize(Lw + Vw);
        float NdotH = max(dot(Nworld, Hw), 0.0);
        float sunElev = smoothstep(-0.04, 0.18, Lw.y);
        float glitter = pow(NdotH, mix(140.0, 42.0, rFar)) * fres * 1.35 * sunElev * (1.0 - uSquallMix * 0.75);
        waterCol += vec3(1.0, 0.95, 0.84) * min(glitter, 1.4);

        // Jacobian crest compression + multi-scale cellular & FBM foam whitecaps
        vec4 fN = texture2D(uFoamMap, vSeaUv * 0.042 + vec2(uTime * 0.008, -uTime * 0.006));
        float capN = texture2D(uFoamMap, vSeaUv * 0.017 - vec2(uTime * 0.004, uTime * 0.005)).r;
        float seaStorm = clamp((uWaveHeight - 0.75) / 2.2 + uSquallMix * 0.45, 0.0, 1.0);
        float jacThresh = mix(0.32, 0.78, seaStorm);
        float crestMask = smoothstep(jacThresh, jacThresh - 0.28, vJac) * smoothstep(0.12, 0.55, seaStorm);
        float capGate = smoothstep(0.55 - seaStorm * 0.22, 0.85 - seaStorm * 0.18, fN.a * 0.55 + capN * 0.65);
        float lacyFoam = crestMask * capGate * fN.g;
        float fairFlecks = smoothstep(0.76, 0.98, vWaveCrest) * smoothstep(0.58, 0.88, fN.r) * fN.g * 0.35;

        // Subtle hull waterline bow/quarter foam collar outside hull
        float collarDist = abs(bPos.x) - hullHw;
        float hullCollar = 0.0;
        if (bt > -0.02 && bt < 1.03 && collarDist >= -0.05 && collarDist < 0.65 && abs(bPos.y - 0.08 * uBoatHull.z) < 0.42) {
          float falloff = (1.0 - smoothstep(0.0, 0.65, max(0.0, collarDist)));
          float bowBoost = smoothstep(0.45, 0.0, bt) * 0.45 + 0.45;
          hullCollar = falloff * bowBoost * (0.45 + 0.55 * fN.g);
        }

        vec3 foamCol = mix(vec3(0.89, 0.95, 0.98), vec3(0.72, 0.79, 0.85), uSquallMix * 0.55);
        float totalFoam = clamp(lacyFoam * 1.15 + fairFlecks + hullCollar * 0.68, 0.0, 0.92);
        diffuseColor.rgb = mix(waterCol, foamCol, totalFoam);
        `,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `
        #include <normal_fragment_begin>
        normal = normalize((viewMatrix * vec4(Nworld, 0.0)).xyz);
        `,
      );
    };
    this.disposables.push(oceanGeo, oceanMat);
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.receiveShadow = !this.isSoftwareGl;
    scene.add(oceanMesh);

    // Islands & Distant Harbor Vessels
    this.departureIsland = createIslandGroup(1.2, this.isSoftwareGl, true);
    this.destinationIsland = createIslandGroup(4.7, this.isSoftwareGl, true);
    scene.add(this.departureIsland.group, this.destinationIsland.group);

    this.harborVessels = [createDistantVessel(0xf8fafc), createDistantVessel(0x1e3a5f)];
    this.harborVessels.forEach((v) => scene.add(v.group));

    // Pooled Stern Wake Foam InstancedMesh (42 particles)
    const wakeGeo = new THREE.PlaneGeometry(1.1, 1.1);
    wakeGeo.rotateX(-Math.PI / 2);
    const wakeMat = new THREE.MeshBasicMaterial({
      map: this.textures.wakeRadial,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.disposables.push(wakeGeo, wakeMat);
    this.wakeMesh = new THREE.InstancedMesh(wakeGeo, wakeMat, 42);
    this.wakeMesh.frustumCulled = false;
    scene.add(this.wakeMesh);

    // Pooled Bow Spray Droplets InstancedMesh (32 particles)
    const sprayGeo = new THREE.PlaneGeometry(0.42, 0.42);
    const sprayMat = new THREE.MeshBasicMaterial({
      map: this.textures.wakeRadial,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.disposables.push(sprayGeo, sprayMat);
    this.sprayMesh = new THREE.InstancedMesh(sprayGeo, sprayMat, 32);
    this.sprayMesh.frustumCulled = false;
    scene.add(this.sprayMesh);

    // Pooled Squall Rain InstancedMesh (120 streaks)
    const rainGeo = new THREE.BoxGeometry(0.03, 1.8, 0.03);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0xcbe4f9,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    this.disposables.push(rainGeo, rainMat);
    this.rainMesh = new THREE.InstancedMesh(rainGeo, rainMat, 120);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    for (let i = 0; i < 120; i++) {
      this.rainOffsets[i * 3] = (Math.random() - 0.5) * 36;
      this.rainOffsets[i * 3 + 1] = Math.random() * 18;
      this.rainOffsets[i * 3 + 2] = (Math.random() - 0.5) * 36;
    }
    scene.add(this.rainMesh);

    if (!this.isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    this.bindEvents();
    this.startLoop();
  }

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('resize', this.onResize);
  }

  private getPinchDistance(): number {
    const pts = Array.from(this.activePointers.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.activePointers.size === 1) {
      this.dragMoved = false;
      this.tapStartX = e.clientX;
      this.tapStartY = e.clientY;
    } else if (this.activePointers.size >= 2) {
      this.dragMoved = true;
      this.pinchLastDist = this.getPinchDistance();
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.activePointers.has(e.pointerId)) {
      const prev = this.activePointers.get(e.pointerId)!;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activePointers.size >= 2) {
        const dist = this.getPinchDistance();
        if (this.pinchLastDist > 0 && dist > 0) {
          this.adjustZoom((this.pinchLastDist - dist) * 0.045);
        }
        this.pinchLastDist = dist;
        this.dragMoved = true;
        return;
      }

      if (Math.hypot(e.clientX - this.tapStartX, e.clientY - this.tapStartY) > 6) {
        this.dragMoved = true;
      }
      this.panCamera(dx, dy);
      return;
    }

    if (e.pointerType === 'touch') return;

    if (e.target !== this.renderer.domElement) {
      this.callbacks.onHover3D(null, e.clientX, e.clientY);
      return;
    }

    const now = performance.now();
    if (now - this.lastHoverCheck < 55) return;
    this.lastHoverCheck = now;

    const hit = this.raycastInteractables(e.clientX, e.clientY);
    if (hit) {
      this.renderer.domElement.style.cursor = 'pointer';
      this.callbacks.onHover3D(hit.label, e.clientX, e.clientY);
    } else {
      this.renderer.domElement.style.cursor = 'grab';
      this.callbacks.onHover3D(null, e.clientX, e.clientY);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const wasSingleActive = this.activePointers.size === 1 && this.activePointers.has(e.pointerId);
    if (wasSingleActive && !this.dragMoved) {
      const hit = this.raycastInteractables(e.clientX, e.clientY);
      if (hit) {
        this.callbacks.onInteract3D(hit.action);
      }
    }
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) {
      this.pinchLastDist = 0;
    }
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.callbacks.getCameraMode() === 'third-person') {
      this.orbitDist = THREE.MathUtils.clamp(this.orbitDist + e.deltaY * 0.012, 7.5, 36);
    }
  };

  public adjustZoom(delta: number): void {
    this.orbitDist = THREE.MathUtils.clamp(this.orbitDist + delta, 7.5, 36);
  }

  public panCamera(dx: number, dy: number): void {
    const mode = this.callbacks.getCameraMode();
    if (mode === 'third-person') {
      this.orbitYaw -= dx * 0.0065;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dy * 0.005, 0.08, 1.15);
    } else {
      this.fpLookYaw = THREE.MathUtils.clamp(this.fpLookYaw - dx * 0.005, -1.65, 1.65);
      this.fpLookPitch = THREE.MathUtils.clamp(this.fpLookPitch - dy * 0.004, -0.55, 0.65);
    }
  }

  private onResize = (): void => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private raycastInteractables(clientX: number, clientY: number): { action: InteractiveAction; label: string } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return null;
    }
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = this.boat.interactables.map((i) => i.mesh);
    const hits = this.raycaster.intersectObjects(meshes, true);
    if (hits.length === 0) return null;

    let obj: THREE.Object3D | null = hits[0].object;
    while (obj) {
      if (obj.userData.interactiveAction) {
        return {
          action: obj.userData.interactiveAction as InteractiveAction,
          label: String(obj.userData.interactiveLabel || 'Switch'),
        };
      }
      obj = obj.parent;
    }
    return null;
  }

  private swapBoatIfNeeded(state: SimulationState): void {
    if (state.boatId === this.currentBoatId) return;
    this.scene.remove(this.boat.root);
    this.boat.dispose();
    this.currentBoatId = state.boatId;
    this.boat = buildSailboatModel(this.currentBoatId, this.textures, this.isSoftwareGl);
    this.scene.add(this.boat.root);
  }

  private updateEnvironment(state: SimulationState): void {
    const tod = state.weather.timeOfDayHours;
    // Solar elevation angle: peaks at 12:30 (~62°), drops below horizon at night
    const sunArc = Math.sin(((tod - 5.5) / 13) * Math.PI);
    const daylight = Math.max(0, sunArc);
    const squallMix = state.weather.cloudCover;

    // Update Sky.js sun vector & atmospheric scattering
    const elevationDeg = THREE.MathUtils.lerp(-8, 62, (sunArc + 1) * 0.5);
    const phi = THREE.MathUtils.degToRad(90 - Math.max(-4, elevationDeg));
    const azimuthDeg = 120 + (tod / 24) * 160;
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    _v1.setFromSphericalCoords(1, phi, theta);

    const skyUniforms = this.sky.material.uniforms;
    skyUniforms['sunPosition'].value.copy(_v1);
    skyUniforms['turbidity'].value = THREE.MathUtils.lerp(2.2, 10.5, squallMix);
    skyUniforms['rayleigh'].value = THREE.MathUtils.lerp(1.9, 0.45, squallMix);

    // Toggle Sky vs Starfield at night
    const nightWeight = THREE.MathUtils.clamp((0.22 - daylight) / 0.22, 0, 1);
    this.sky.visible = nightWeight < 0.96;
    this.starfield.material.opacity = nightWeight * (1 - squallMix * 0.85) * 0.9;

    // Fog & Light Temperature matched to Sky & Weather
    _skyColor.copy(_tradeFog).lerp(_squallFog, squallMix * 0.92);
    if (daylight < 0.35) {
      _skyColor.lerp(_nightFog, (0.35 - daylight) * 2.5);
    }
    (this.scene.background as THREE.Color).copy(_skyColor);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(_skyColor);
      this.scene.fog.density = 0.00052 + squallMix * 0.0024;
    }

    const goldenHour = daylight > 0.02 && daylight < 0.35 ? 1 - daylight / 0.35 : 0;
    _sunColor.copy(_tradeSun).lerp(_sunsetSun, goldenHour * 0.75).lerp(_squallSun, squallMix);
    this.sunLight.color.copy(_sunColor);
    this.sunLight.position.copy(_v1).multiplyScalar(90);
    this.sunLight.intensity = (0.45 + daylight * 2.4) * (1 - squallMix * 0.48);
    this.hemiLight.intensity = 0.45 + daylight * 0.75;
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.52, 0.42, squallMix * 0.65 + nightWeight * 0.35);

    // Ocean wave uniforms + depth coastal shoal color + sky reflection colors + boat hull exclusion
    const shoalMix = THREE.MathUtils.clamp(1 - (state.passage.depthM - 4) / 36, 0, 1);
    this.oceanUniforms.uTime.value = this.elapsedSec;
    this.oceanUniforms.uWaveHeight.value = state.weather.waveHeightM;
    this.oceanUniforms.uOffset.value.set(state.passage.xNm * 60, state.passage.zNm * 60);
    this.oceanUniforms.uShoalMix.value = shoalMix;
    this.oceanUniforms.uSquallMix.value = squallMix;
    this.oceanUniforms.uSunDir.value.copy(_v1).normalize();
    this.oceanUniforms.uSkyHorizon.value.copy(_skyColor);
    _skyZenithColor.copy(_tradeZenith).lerp(_squallZenith, squallMix * 0.92);
    if (daylight < 0.35) {
      _skyZenithColor.lerp(_nightZenith, (0.35 - daylight) * 2.5);
    }
    this.oceanUniforms.uSkyZenith.value.copy(_skyZenithColor);

    this.boat.hullPivot.updateMatrixWorld(true);
    _invBoatMat.copy(this.boat.hullPivot.matrixWorld).invert();
    this.oceanUniforms.uBoatInvMatrix.value.copy(_invBoatMat);
    this.oceanUniforms.uBoatHull.value.set(
      this.boat.hullLengthM,
      this.boat.hullBeamM,
      this.boat.hullScaleFactor,
    );

    // Position Departure & Destination Islands + Distant Harbor Vessels
    const nmToM = 55;
    const depX = (0 - state.passage.xNm) * nmToM - 135;
    const depZ = (0 - state.passage.zNm) * nmToM - 55;
    this.departureIsland.group.position.set(depX, 0, depZ);
    this.departureIsland.group.visible = Math.hypot(depX, depZ) < 1600;

    const destX = (state.passage.totalDistanceNm - state.passage.xNm) * nmToM + 125;
    const destZ = (0 - state.passage.zNm) * nmToM - 30;
    this.destinationIsland.group.position.set(destX, 0, destZ);
    this.destinationIsland.group.visible = Math.hypot(destX, destZ) < 1600;

    // Two distant harbor vessels gently cruising/tacking near departure & destination coves
    const v0 = this.harborVessels[0].group;
    v0.position.set(depX + 165 + Math.sin(this.elapsedSec * 0.08) * 35, 0, depZ + 95);
    v0.rotation.y = Math.cos(this.elapsedSec * 0.08) * 0.6 + 0.8;
    v0.visible = this.departureIsland.group.visible;

    const v1 = this.harborVessels[1].group;
    v1.position.set(destX - 155, 0, destZ + 80 + Math.cos(this.elapsedSec * 0.07) * 32);
    v1.rotation.y = -0.7;
    v1.visible = this.destinationIsland.group.visible;
  }

  private updateParticles(state: SimulationState, dt: number): void {
    const hRad = (state.headingDeg * Math.PI) / 180;
    const sternDist = this.boat.deckLengthM * 0.49;

    // 1. Stern Kelvin Wake Foam
    if (state.boatSpeedKts > 0.6 && Math.random() < 0.78) {
      const idx = this.wakeIndex % 42;
      this.wakeIndex++;
      this.wakePos[idx * 3] = -Math.sin(hRad) * sternDist + (Math.random() - 0.5) * 0.65;
      this.wakePos[idx * 3 + 1] = 0.08;
      this.wakePos[idx * 3 + 2] = Math.cos(hRad) * sternDist + (Math.random() - 0.5) * 0.65;
      this.wakeLife[idx] = 1.0;
    }

    const driftSpeed = state.boatSpeedKts * 0.52;
    for (let i = 0; i < 42; i++) {
      if (this.wakeLife[i] > 0) {
        this.wakeLife[i] = Math.max(0, this.wakeLife[i] - dt * 0.45);
        this.wakePos[i * 3] -= Math.sin(hRad) * driftSpeed * dt;
        this.wakePos[i * 3 + 2] += Math.cos(hRad) * driftSpeed * dt;
        const s = (1.6 - this.wakeLife[i] * 0.8) * 1.45;
        _mat4.makeTranslation(this.wakePos[i * 3], 0.08, this.wakePos[i * 3 + 2]);
        _mat4.scale(_v1.set(s * this.wakeLife[i], 1, s * this.wakeLife[i]));
      } else {
        _mat4.makeScale(0, 0, 0);
      }
      this.wakeMesh.setMatrixAt(i, _mat4);
    }
    this.wakeMesh.instanceMatrix.needsUpdate = true;

    // 2. Animated Bow Spray Plumes (kicks out from bow stem when speed > 3 kts or choppy waves)
    const bowDist = this.boat.deckLengthM * 0.47;
    const sprayRate = (state.boatSpeedKts / 6.5) * (0.4 + state.weather.waveHeightM * 0.35);
    if (state.boatSpeedKts > 2.4 && Math.random() < Math.min(0.9, sprayRate * 0.55)) {
      const idx = this.sprayIndex % 32;
      this.sprayIndex++;
      const side = Math.random() < 0.5 ? -1 : 1;
      const bowX = Math.sin(hRad) * bowDist;
      const bowZ = -Math.cos(hRad) * bowDist;
      const latX = Math.cos(hRad) * side;
      const latZ = Math.sin(hRad) * side;
      this.sprayPos[idx * 3] = bowX + latX * 0.25;
      this.sprayPos[idx * 3 + 1] = 0.35;
      this.sprayPos[idx * 3 + 2] = bowZ + latZ * 0.25;
      this.sprayVel[idx * 3] = latX * (1.2 + Math.random() * 1.1) - Math.sin(hRad) * 1.4;
      this.sprayVel[idx * 3 + 1] = 1.6 + Math.random() * 1.5;
      this.sprayVel[idx * 3 + 2] = latZ * (1.2 + Math.random() * 1.1) + Math.cos(hRad) * 1.4;
      this.sprayLife[idx] = 1.0;
    }

    for (let i = 0; i < 32; i++) {
      if (this.sprayLife[i] > 0) {
        this.sprayLife[i] = Math.max(0, this.sprayLife[i] - dt * 1.35);
        this.sprayVel[i * 3 + 1] -= 5.8 * dt;
        this.sprayPos[i * 3] += this.sprayVel[i * 3] * dt;
        this.sprayPos[i * 3 + 1] += this.sprayVel[i * 3 + 1] * dt;
        this.sprayPos[i * 3 + 2] += this.sprayVel[i * 3 + 2] * dt;
        const sc = (0.4 + (1 - this.sprayLife[i]) * 1.1) * this.sprayLife[i];
        _mat4.makeTranslation(this.sprayPos[i * 3], Math.max(0.05, this.sprayPos[i * 3 + 1]), this.sprayPos[i * 3 + 2]);
        _mat4.scale(_v1.set(sc, sc, sc));
      } else {
        _mat4.makeScale(0, 0, 0);
      }
      this.sprayMesh.setMatrixAt(i, _mat4);
    }
    this.sprayMesh.instanceMatrix.needsUpdate = true;

    // 3. Rain particles during squall (excluded over enclosed cabin coachroof so rain never falls indoors)
    const raining = state.weather.rainIntensity > 0.15;
    this.rainMesh.visible = raining;
    if (raining) {
      const cosH = Math.cos(hRad);
      const sinH = Math.sin(hRad);
      const cb = this.boat.cabinRoofBounds;
      for (let i = 0; i < 120; i++) {
        this.rainOffsets[i * 3 + 1] -= dt * 26;
        this.rainOffsets[i * 3] -= dt * 6;
        if (this.rainOffsets[i * 3 + 1] < 0) {
          this.rainOffsets[i * 3 + 1] = 16 + Math.random() * 4;
          this.rainOffsets[i * 3] = (Math.random() - 0.5) * 34;
        }
        const rx = this.rainOffsets[i * 3];
        const ry = this.rainOffsets[i * 3 + 1];
        const rz = this.rainOffsets[i * 3 + 2];
        // Transform rain drop into boat local XZ (inverse of rotation.y = -hRad)
        const lx = rx * cosH + rz * sinH;
        const lz = -rx * sinH + rz * cosH;
        const overCabin =
          lx > cb.minX - 0.35 &&
          lx < cb.maxX + 0.35 &&
          lz > cb.minZ - 0.35 &&
          lz < cb.maxZ + 0.45 &&
          ry < 2.8;
        if (overCabin) {
          _mat4.makeScale(0, 0, 0);
        } else {
          _mat4.makeTranslation(rx, ry, rz);
        }
        this.rainMesh.setMatrixAt(i, _mat4);
      }
      this.rainMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateCamera(camDt: number, state: SimulationState): void {
    const screen = this.callbacks.getScreenState();
    const mode = this.callbacks.getCameraMode();
    const camKey = `${screen}:${mode}`;
    const modeChanged = camKey !== this.lastCamKey;
    if (modeChanged) {
      this.lastCamKey = camKey;
      if (mode !== 'third-person') {
        this.fpLookYaw = 0;
        this.fpLookPitch = 0;
      }
    }

    // Smooth exponential damping across all transitions (never snaps abruptly except enclosed cabin entry)
    const dampAlpha = 1 - Math.exp(-8.5 * camDt);
    const fpDampAlpha = modeChanged && mode === 'first-person-cabin' ? 1.0 : 1 - Math.exp(-12.5 * camDt);

    if (screen === 'title') {
      const angle = 0.38 + Math.sin(this.elapsedSec * 0.18) * 0.25;
      const dist = 12.5 + this.boat.deckLengthM * 0.72;
      _v1.set(-Math.sin(angle) * dist, 4.4, Math.cos(angle) * dist);
      _v2.set(-2.2, 2.5, 0);
      this.camPosCurrent.lerp(_v1, dampAlpha);
      this.camLookCurrent.lerp(_v2, dampAlpha);
      this.camera.position.copy(this.camPosCurrent);
      this.camera.lookAt(this.camLookCurrent);
      return;
    }

    if (mode === 'first-person-helm' || mode === 'first-person-cabin') {
      this.boat.root.updateMatrixWorld(true);
      const baseEye =
        mode === 'first-person-helm' ? this.boat.helmEyeLocal : this.boat.cabinEyeLocal;
      const baseLook =
        mode === 'first-person-helm' ? this.boat.helmLookLocal : this.boat.cabinLookLocal;
      const windwardSign = mode === 'first-person-helm' ? -Math.sign(state.boomSide || 1) : 1;
      const eyeLocal = _v4.set(baseEye.x * windwardSign, baseEye.y, baseEye.z);
      const baseLookLocal = _v5.set(baseLook.x * windwardSign, baseLook.y, baseLook.z);

      _v1.copy(eyeLocal).applyMatrix4(this.boat.hullPivot.matrixWorld);
      // Apply 1st-person look offset relative to boat local axes
      _v3.copy(baseLookLocal).sub(eyeLocal);
      const cosY = Math.cos(this.fpLookYaw);
      const sinY = Math.sin(this.fpLookYaw);
      const rotX = _v3.x * cosY - _v3.z * sinY;
      const rotZ = _v3.x * sinY + _v3.z * cosY;
      _v3.set(rotX, _v3.y + this.fpLookPitch * _v3.length() * 0.65, rotZ).add(eyeLocal);
      _v2.copy(_v3).applyMatrix4(this.boat.hullPivot.matrixWorld);

      this.camPosCurrent.lerp(_v1, fpDampAlpha);
      this.camLookCurrent.lerp(_v2, fpDampAlpha);
      this.camera.position.copy(this.camPosCurrent);
      this.camera.lookAt(this.camLookCurrent);
      return;
    }

    // 3rd-person orbit chase camera behind stern quarter
    const hRad = (state.headingDeg * Math.PI) / 180;
    const totalYaw = -hRad + this.orbitYaw;
    const horiz = Math.cos(this.orbitPitch) * this.orbitDist;
    const vert = Math.sin(this.orbitPitch) * this.orbitDist + 1.6;
    _v1.set(Math.sin(totalYaw) * horiz, vert, Math.cos(totalYaw) * horiz);
    _v2.set(0, 1.8, 0);
    this.camPosCurrent.lerp(_v1, dampAlpha);
    this.camLookCurrent.lerp(_v2, dampAlpha);
    this.camera.position.copy(this.camPosCurrent);
    this.camera.lookAt(this.camLookCurrent);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (status === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    this.lastFrameMs = performance.now();
    const tick = () => {
      if (this.disposed) return;
      const nowMs = performance.now();
      const rawDt = (nowMs - this.lastFrameMs) / 1000;
      this.lastFrameMs = nowMs;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      const camDt = this.isSoftwareGl ? Math.min(Math.max(rawDt, 0.01), 0.45) : dt;
      this.elapsedSec += dt;

      const screen = this.callbacks.getScreenState();
      if (screen === 'playing') {
        this.callbacks.onTickSimulation(dt);
      }

      const state = this.callbacks.getState();
      this.swapBoatIfNeeded(state);
      const waveMotion = sampleGerstnerMotion(
        this.elapsedSec,
        state.passage.xNm * 60,
        state.passage.zNm * 60,
        state.weather.waveHeightM,
        state.headingDeg,
      );
      syncBoatVisuals(this.boat, state, this.elapsedSec, waveMotion);
      if (
        (this.callbacks.getCameraMode() === 'first-person-cabin' && nowMs - this.lastInstrumentRedrawMs > 280) ||
        nowMs - this.lastInstrumentRedrawMs > 1200
      ) {
        this.lastInstrumentRedrawMs = nowMs;
        this.textures.updateCabinInstruments(state);
      }
      this.updateEnvironment(state);
      this.updateParticles(state, dt);
      this.updateCamera(camDt, state);

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    dom.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('resize', this.onResize);

    this.boat.dispose();
    this.starfield.dispose();
    this.departureIsland.dispose();
    this.destinationIsland.dispose();
    this.harborVessels.forEach((v) => v.dispose());
    this.textures.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}

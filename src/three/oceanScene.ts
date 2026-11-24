import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildSailboatModel, syncBoatVisuals, type BuiltBoat, type InteractiveAction } from './boatBuilder';
import { createProceduralTextures } from './proceduralTextures';
import type { BoatId, CameraViewMode, GameScreenState, SimulationState } from '../types/sailing';

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _skyColor = new THREE.Color();
const _sunColor = new THREE.Color();
const _tradeSky = new THREE.Color(0x8ecae6);
const _squallSky = new THREE.Color(0x223344);
const _nightSky = new THREE.Color(0x0b1624);
const _tradeSun = new THREE.Color(0xfff1d6);
const _squallSun = new THREE.Color(0x7c8fa3);

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

function createIslandGroup(
  seedOffset: number,
  isSoftwareGl: boolean,
  hasQuay: boolean,
): { group: THREE.Group; dispose: () => void } {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // Volcanic / coastal island terrain cone + ridge
  const islandGeo = new THREE.ConeGeometry(95, 34, 18, 4);
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
  islandMesh.position.set(0, 12, 0);
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
  private departureIsland: ReturnType<typeof createIslandGroup>;
  private destinationIsland: ReturnType<typeof createIslandGroup>;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private oceanUniforms = {
    uTime: { value: 0 },
    uWaveHeight: { value: 1.1 },
    uOffset: { value: new THREE.Vector2(0, 0) },
  };
  private wakeMesh: THREE.InstancedMesh;
  private wakeLife = new Float32Array(42);
  private wakePos = new Float32Array(42 * 3);
  private wakeIndex = 0;
  private rainMesh: THREE.InstancedMesh;
  private rainOffsets = new Float32Array(120 * 3);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private lastHoverCheck = 0;
  private orbitYaw = 0.65;
  private orbitPitch = 0.28;
  private orbitDist = 14.5;
  private dragging = false;
  private dragMoved = false;
  private lastPtrX = 0;
  private lastPtrY = 0;
  private lastCamKey = '';
  private camPosCurrent = new THREE.Vector3(-12, 6, 10);
  private camLookCurrent = new THREE.Vector3(0, 2, 0);
  private clock = new THREE.Clock();
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
    renderer.toneMappingExposure = 0.96;
    renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = !this.isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8ecae6);
    scene.fog = new THREE.FogExp2(0x8ecae6, 0.0008);
    this.scene = scene;

    // Studio Environment Reflections for stainless rigging, brass compass & solar panels
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();
    this.disposables.push(envTex);

    const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    const camera = new THREE.PerspectiveCamera(54, aspect, 0.15, 2200);
    camera.position.copy(this.camPosCurrent);
    this.camera = camera;

    // Balanced 3-point maritime lighting (Warm Sun + Cool Sky/Sea Hemisphere)
    const hemiLight = new THREE.HemisphereLight(0xcbe8ff, 0x0b2a3c, 0.8);
    scene.add(hemiLight);
    this.hemiLight = hemiLight;

    const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.0);
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
    this.currentBoatId = initialState.boatId;
    this.boat = buildSailboatModel(this.currentBoatId, this.textures, this.isSoftwareGl);
    scene.add(this.boat.root);

    // Dynamic PBR Ocean Plane using MeshStandardMaterial + onBeforeCompile Gerstner Waves
    const oceanGeo = new THREE.PlaneGeometry(2400, 2400, this.isSoftwareGl ? 64 : 96, this.isSoftwareGl ? 64 : 96);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x063454,
      roughness: 0.42,
      metalness: 0.06,
    });
    const uniforms = this.oceanUniforms;
    oceanMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWaveHeight = uniforms.uWaveHeight;
      shader.uniforms.uOffset = uniforms.uOffset;
      shader.vertexShader = `
        uniform float uTime;
        uniform float uWaveHeight;
        uniform vec2 uOffset;
        varying float vWaveCrest;
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vec2 wp = transformed.xz + uOffset;
        float w1 = sin(wp.x * 0.085 + uTime * 1.35) * cos(wp.y * 0.065 + uTime * 0.95);
        float w2 = sin((wp.x * 0.15 - wp.y * 0.12) + uTime * 1.9) * 0.45;
        float h = (w1 + w2) * 0.55 * uWaveHeight;
        transformed.y += h;
        vWaveCrest = clamp((h / max(0.3, uWaveHeight)) * 0.5 + 0.5, 0.0, 1.0);
        `,
      );
      shader.fragmentShader = `
        varying float vWaveCrest;
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        vec3 deepCol = vec3(0.014, 0.095, 0.20);
        vec3 crestCol = vec3(0.035, 0.24, 0.37);
        vec3 foamCol = vec3(0.86, 0.94, 0.99);
        diffuseColor.rgb = mix(deepCol, crestCol, vWaveCrest);
        float foamMask = smoothstep(0.76, 0.96, vWaveCrest);
        diffuseColor.rgb = mix(diffuseColor.rgb, foamCol, foamMask * 0.65);
        `,
      );
    };
    this.disposables.push(oceanGeo, oceanMat);
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.receiveShadow = !this.isSoftwareGl;
    scene.add(oceanMesh);

    // Islands (Departure at passage start, Destination cove at passage end)
    this.departureIsland = createIslandGroup(1.2, this.isSoftwareGl, true);
    this.destinationIsland = createIslandGroup(4.7, this.isSoftwareGl, true);
    scene.add(this.departureIsland.group, this.destinationIsland.group);

    // Pooled Wake Foam InstancedMesh (42 particles)
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
    dom.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('resize', this.onResize);
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.dragMoved = false;
    this.lastPtrX = e.clientX;
    this.lastPtrY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent): void => {
    const mode = this.callbacks.getCameraMode();
    if (this.dragging) {
      const dx = e.clientX - this.lastPtrX;
      const dy = e.clientY - this.lastPtrY;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        this.dragMoved = true;
      }
      this.lastPtrX = e.clientX;
      this.lastPtrY = e.clientY;

      if (mode === 'third-person') {
        this.orbitYaw -= dx * 0.0065;
        this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dy * 0.005, 0.08, 1.15);
      }
      return;
    }

    // Throttled hover raycast on boat 3D interactables
    const now = performance.now();
    if (now - this.lastHoverCheck < 55) return;
    this.lastHoverCheck = now;

    const hit = this.raycastInteractables(e.clientX, e.clientY);
    if (hit) {
      this.renderer.domElement.style.cursor = 'pointer';
      this.callbacks.onHover3D(hit.label, e.clientX, e.clientY);
    } else {
      this.renderer.domElement.style.cursor = mode === 'third-person' ? 'grab' : 'default';
      this.callbacks.onHover3D(null, e.clientX, e.clientY);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.dragging && !this.dragMoved) {
      const hit = this.raycastInteractables(e.clientX, e.clientY);
      if (hit) {
        this.callbacks.onInteract3D(hit.action);
      }
    }
    this.dragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.callbacks.getCameraMode() === 'third-person') {
      this.orbitDist = THREE.MathUtils.clamp(this.orbitDist + e.deltaY * 0.012, 7.5, 34);
    }
  };

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
    const daylight = Math.max(0.15, Math.sin(((tod - 5.5) / 13) * Math.PI));
    const squallMix = state.weather.cloudCover;

    _skyColor.copy(_tradeSky).lerp(_squallSky, squallMix * 0.9);
    if (daylight < 0.35) {
      _skyColor.lerp(_nightSky, (0.35 - daylight) * 2.4);
    }

    (this.scene.background as THREE.Color).copy(_skyColor);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(_skyColor);
      this.scene.fog.density = 0.00075 + squallMix * 0.0028;
    }

    _sunColor.copy(_tradeSun).lerp(_squallSun, squallMix);
    this.sunLight.color.copy(_sunColor);
    this.sunLight.intensity = (0.7 + daylight * 1.7) * (1 - squallMix * 0.45);
    this.hemiLight.intensity = 0.45 + daylight * 0.55;

    // Ocean wave uniforms
    this.oceanUniforms.uTime.value = this.elapsedSec;
    this.oceanUniforms.uWaveHeight.value = state.weather.waveHeightM;
    // Scale 1 NM = 60m for ocean texture drift
    this.oceanUniforms.uOffset.value.set(state.passage.xNm * 60, state.passage.zNm * 60);

    // Position Departure & Destination Islands relative to boat (boat stays at origin!)
    // 1 NM = 55 scene meters so coastlines are clearly visible near ports
    const nmToM = 55;
    const depX = (0 - state.passage.xNm) * nmToM - 135;
    const depZ = (0 - state.passage.zNm) * nmToM - 55;
    this.departureIsland.group.position.set(depX, 0, depZ);
    this.departureIsland.group.visible = Math.hypot(depX, depZ) < 1500;

    const destX = (state.passage.totalDistanceNm - state.passage.xNm) * nmToM + 125;
    const destZ = (0 - state.passage.zNm) * nmToM - 30;
    this.destinationIsland.group.position.set(destX, 0, destZ);
    this.destinationIsland.group.visible = Math.hypot(destX, destZ) < 1500;
  }

  private updateParticles(state: SimulationState, dt: number): void {
    // Wake foam trail behind stern
    if (state.boatSpeedKts > 0.6 && Math.random() < 0.75) {
      const idx = this.wakeIndex % 42;
      this.wakeIndex++;
      const hRad = (state.headingDeg * Math.PI) / 180;
      const sternDist = state.boatId === 'rustler-36' ? 4.4 : 3.2;
      this.wakePos[idx * 3] = -Math.sin(hRad) * sternDist + (Math.random() - 0.5) * 0.6;
      this.wakePos[idx * 3 + 1] = 0.08;
      this.wakePos[idx * 3 + 2] = Math.cos(hRad) * sternDist + (Math.random() - 0.5) * 0.6;
      this.wakeLife[idx] = 1.0;
    }

    const hRad = (state.headingDeg * Math.PI) / 180;
    const driftSpeed = state.boatSpeedKts * 0.52;
    for (let i = 0; i < 42; i++) {
      if (this.wakeLife[i] > 0) {
        this.wakeLife[i] = Math.max(0, this.wakeLife[i] - dt * 0.45);
        this.wakePos[i * 3] -= Math.sin(hRad) * driftSpeed * dt;
        this.wakePos[i * 3 + 2] += Math.cos(hRad) * driftSpeed * dt;
        const s = (1.6 - this.wakeLife[i] * 0.8) * 1.4;
        _mat4.makeTranslation(this.wakePos[i * 3], 0.08, this.wakePos[i * 3 + 2]);
        _mat4.scale(_v1.set(s * this.wakeLife[i], 1, s * this.wakeLife[i]));
      } else {
        _mat4.makeScale(0, 0, 0);
      }
      this.wakeMesh.setMatrixAt(i, _mat4);
    }
    this.wakeMesh.instanceMatrix.needsUpdate = true;

    // Rain particles during squall
    const raining = state.weather.rainIntensity > 0.15;
    this.rainMesh.visible = raining;
    if (raining) {
      for (let i = 0; i < 120; i++) {
        this.rainOffsets[i * 3 + 1] -= dt * 26;
        this.rainOffsets[i * 3] -= dt * 6;
        if (this.rainOffsets[i * 3 + 1] < 0) {
          this.rainOffsets[i * 3 + 1] = 16 + Math.random() * 4;
          this.rainOffsets[i * 3] = (Math.random() - 0.5) * 34;
        }
        _mat4.makeTranslation(
          this.rainOffsets[i * 3],
          this.rainOffsets[i * 3 + 1],
          this.rainOffsets[i * 3 + 2],
        );
        this.rainMesh.setMatrixAt(i, _mat4);
      }
      this.rainMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateCamera(dt: number, state: SimulationState): void {
    const screen = this.callbacks.getScreenState();
    const mode = this.callbacks.getCameraMode();
    const camKey = `${screen}:${mode}`;
    const modeChanged = camKey !== this.lastCamKey;
    this.lastCamKey = camKey;
    const dampAlpha = modeChanged ? 1.0 : 1 - Math.exp(-8.5 * dt);

    if (screen === 'title') {
      // Live world camera tour framing the yacht on the right side of the viewport
      const angle = 0.38 + Math.sin(this.elapsedSec * 0.18) * 0.25;
      const dist = state.boatId === 'rustler-36' ? 18.5 : 14.5;
      _v1.set(-Math.sin(angle) * dist, 4.4, Math.cos(angle) * dist);
      _v2.set(-2.2, 2.5, 0);
      this.camPosCurrent.lerp(_v1, dampAlpha);
      this.camLookCurrent.lerp(_v2, dampAlpha);
      this.camera.position.copy(this.camPosCurrent);
      this.camera.lookAt(this.camLookCurrent);
      return;
    }

    if (mode === 'first-person-helm') {
      this.boat.hullPivot.updateMatrixWorld(true);
      _v1.copy(this.boat.helmEyeLocal).applyMatrix4(this.boat.hullPivot.matrixWorld);
      _v2.copy(this.boat.helmLookLocal).applyMatrix4(this.boat.hullPivot.matrixWorld);
      this.camPosCurrent.lerp(_v1, modeChanged ? 1.0 : 1 - Math.exp(-14 * dt));
      this.camLookCurrent.lerp(_v2, modeChanged ? 1.0 : 1 - Math.exp(-14 * dt));
      this.camera.position.copy(this.camPosCurrent);
      this.camera.lookAt(this.camLookCurrent);
      return;
    }

    if (mode === 'first-person-cabin') {
      this.boat.hullPivot.updateMatrixWorld(true);
      _v1.copy(this.boat.cabinEyeLocal).applyMatrix4(this.boat.hullPivot.matrixWorld);
      _v2.copy(this.boat.cabinLookLocal).applyMatrix4(this.boat.hullPivot.matrixWorld);
      this.camPosCurrent.lerp(_v1, modeChanged ? 1.0 : 1 - Math.exp(-14 * dt));
      this.camLookCurrent.lerp(_v2, modeChanged ? 1.0 : 1 - Math.exp(-14 * dt));
      this.camera.position.copy(this.camPosCurrent);
      this.camera.lookAt(this.camLookCurrent);
      return;
    }

    // 3rd-person orbit chase camera behind stern quarter (matches boat.root.rotation.y = -hRad)
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
    const tick = () => {
      if (this.disposed) return;
      const rawDt = this.clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      this.elapsedSec += dt;

      const screen = this.callbacks.getScreenState();
      if (screen === 'playing') {
        this.callbacks.onTickSimulation(dt);
      }

      const state = this.callbacks.getState();
      this.swapBoatIfNeeded(state);
      syncBoatVisuals(this.boat, state, this.elapsedSec);
      this.updateEnvironment(state);
      this.updateParticles(state, dt);
      this.updateCamera(dt, state);

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
    dom.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('resize', this.onResize);

    this.boat.dispose();
    this.departureIsland.dispose();
    this.destinationIsland.dispose();
    this.textures.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}

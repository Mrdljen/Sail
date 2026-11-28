import * as THREE from 'three';
import {
  generateIsland,
  generatePort,
  type IslandArchetype,
  type IslandTerrainData,
  type PortLayout,
} from './generators';
export { archetypeForHub, portRegionForHub } from './generators';

interface IslandWorldResult {
  id: number;
  near: IslandTerrainData;
  far: IslandTerrainData;
  port: PortLayout;
  error?: string;
}

/**
 * Seeded shoreline approach adapted from Tides of Fortune's `WorldShape.islandHeight` and
 * `WorldShape._spineDist` (`src/world/terrain/heightfield.js`), `sitePort`/`findCoast`
 * (`src/world/terrain/siting.js`), transferable bake messages (`src/world/terrain/bakeWorker.js`),
 * and its near/far instanced sets (`src/world/terrain/vegetation.js`). Port blocks use the
 * modular geometry idea from `GeoBuilder.box`, `GeoBuilder.gable`, and `GeoBuilder.buildChunks`
 * (`src/world/towns/builder.js`). These are design references; this implementation is original.
 */
export function createIslandGroup(
  hubId: string,
  region: string,
  archetype: IslandArchetype,
  isSoftwareGl: boolean,
  rotatePortSide = false,
): { group: THREE.Group; updateLod: (camera: THREE.Vector3) => void; dispose: () => void } {
  const seed = `${hubId}:${region}`;
  const group = new THREE.Group();
  group.name = `generated-island-${hubId}`;
  if (rotatePortSide) group.rotation.y = Math.PI;

  const nearGroup = new THREE.Group();
  const farGroup = new THREE.Group();
  const portGroup = new THREE.Group();
  group.add(nearGroup, farGroup, portGroup);
  farGroup.visible = false;
  portGroup.visible = false;

  const disposables: Array<{ dispose: () => void }> = [];
  const terrainMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.01,
    flatShading: isSoftwareGl,
  });
  disposables.push(terrainMaterial);

  let disposed = false;
  let generated = false;
  let worker: Worker | null = null;
  let lastLodNear = true;
  let lodInitialized = false;

  const rememberGeometry = <T extends THREE.BufferGeometry>(geometry: T): T => {
    disposables.push(geometry);
    return geometry;
  };

  const makeTerrainMesh = (data: IslandTerrainData): THREE.Mesh => {
    const geometry = rememberGeometry(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, terrainMaterial);
    mesh.receiveShadow = !isSoftwareGl;
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    return mesh;
  };

  const addVegetation = (parent: THREE.Group, terrain: IslandTerrainData, lowDetail: boolean): void => {
    const treeCount = terrain.trees.length / 5;
    const rockCount = terrain.rocks.length / 5;
    const scaleFactor = lowDetail ? 0.82 : 1;

    if (treeCount > 0) {
      if (lowDetail) {
        const treeGeometry = rememberGeometry(new THREE.ConeGeometry(4.2, 9.0, 5));
        const treeMaterial = new THREE.MeshStandardMaterial({ color: archetype === 'volcanic' ? 0x536243 : 0x386241, roughness: 0.96 });
        disposables.push(treeMaterial);
        const treeMesh = new THREE.InstancedMesh(treeGeometry, treeMaterial, treeCount);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        for (let i = 0; i < treeCount; i++) {
          const offset = i * 5;
          const size = terrain.trees[offset + 3] * scaleFactor;
          position.set(terrain.trees[offset], terrain.trees[offset + 1] + 4.5 * size, terrain.trees[offset + 2]);
          rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, terrain.trees[offset + 4]);
          scale.set(size, size, size);
          matrix.compose(position, rotation, scale);
          treeMesh.setMatrixAt(i, matrix);
        }
        treeMesh.instanceMatrix.needsUpdate = true;
        treeMesh.castShadow = false;
        parent.add(treeMesh);
      } else {
        const trunkGeometry = rememberGeometry(new THREE.CylinderGeometry(0.24, 0.42, 6.8, 5));
        const crownGeometry = rememberGeometry(new THREE.ConeGeometry(3.0, 5.8, 6));
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b533a, roughness: 0.9 });
        const crownMaterial = new THREE.MeshStandardMaterial({ color: archetype === 'volcanic' ? 0x596342 : 0x356544, roughness: 0.96 });
        disposables.push(trunkMaterial, crownMaterial);
        const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeCount);
        const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, treeCount);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        for (let i = 0; i < treeCount; i++) {
          const offset = i * 5;
          const size = terrain.trees[offset + 3];
          const yaw = terrain.trees[offset + 4];
          rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
          scale.set(size, size, size);
          position.set(terrain.trees[offset], terrain.trees[offset + 1] + 3.4 * size, terrain.trees[offset + 2]);
          matrix.compose(position, rotation, scale);
          trunks.setMatrixAt(i, matrix);
          position.y += 6.3 * size;
          matrix.compose(position, rotation, scale);
          crowns.setMatrixAt(i, matrix);
        }
        trunks.instanceMatrix.needsUpdate = true;
        crowns.instanceMatrix.needsUpdate = true;
        trunks.castShadow = crowns.castShadow = !isSoftwareGl;
        trunks.receiveShadow = crowns.receiveShadow = !isSoftwareGl;
        parent.add(trunks, crowns);
      }
    }

    if (rockCount > 0) {
      const rockGeometry = rememberGeometry(new THREE.DodecahedronGeometry(1.7, 0));
      const rockMaterial = new THREE.MeshStandardMaterial({ color: archetype === 'volcanic' ? 0x51473e : 0x6a6963, roughness: 1 });
      disposables.push(rockMaterial);
      const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      for (let i = 0; i < rockCount; i++) {
        const offset = i * 5;
        const size = terrain.rocks[offset + 3] * (lowDetail ? 0.8 : 1);
        position.set(terrain.rocks[offset], terrain.rocks[offset + 1] + size * 0.5, terrain.rocks[offset + 2]);
        rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, terrain.rocks[offset + 4]);
        scale.set(size, size * 0.7, size * 0.82);
        matrix.compose(position, rotation, scale);
        rocks.setMatrixAt(i, matrix);
      }
      rocks.instanceMatrix.needsUpdate = true;
      rocks.castShadow = !lowDetail && !isSoftwareGl;
      rocks.receiveShadow = !isSoftwareGl;
      parent.add(rocks);
    }
  };

  const addPort = (terrain: IslandTerrainData, layout: PortLayout): void => {
    const origin = new THREE.Group();
    origin.position.set(terrain.portCoastX, 0, 0);
    portGroup.position.set(0, 0, 0);
    portGroup.add(origin);

    const stoneMaterial = new THREE.MeshStandardMaterial({ color: layout.stoneColor, roughness: 0.88 });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: layout.wallColor, roughness: 0.83 });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: layout.trimColor, roughness: 0.78 });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: layout.roofColor, roughness: 0.86 });
    const boatMaterial = new THREE.MeshStandardMaterial({ color: 0x233b48, roughness: 0.56, metalness: 0.1 });
    const sailMaterial = new THREE.MeshStandardMaterial({ color: 0xf2eee2, roughness: 0.84, side: THREE.DoubleSide });
    disposables.push(stoneMaterial, wallMaterial, trimMaterial, roofMaterial, boatMaterial, sailMaterial);

    const addBox = (width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number): void => {
      const geometry = rememberGeometry(new THREE.BoxGeometry(width, height, depth));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = !isSoftwareGl;
      mesh.receiveShadow = !isSoftwareGl;
      origin.add(mesh);
    };

    // A straight outer pier joins a quay, with breakwaters on each side of the channel.
    addBox(layout.pierLengthM, 1.8, layout.quayWidthM, stoneMaterial, layout.pierLengthM * 0.5, 0.9, 0);
    addBox(layout.quayWidthM, 2.2, layout.quayLengthM, stoneMaterial, layout.pierLengthM - 7, 1.1, 0);
    for (const side of [-1, 1]) {
      addBox(layout.breakwaterLengthM, 3.2, 4.8, stoneMaterial, layout.breakwaterLengthM * 0.48, 1.5, side * (layout.quayWidthM * 1.5));
    }

    const bollardGeometry = rememberGeometry(new THREE.CylinderGeometry(0.38, 0.48, 1.5, 8));
    const bollards = new THREE.InstancedMesh(bollardGeometry, trimMaterial, layout.mooringCount);
    const bollardMatrix = new THREE.Matrix4();
    for (let i = 0; i < layout.mooringCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const along = (i / Math.ceil(layout.mooringCount / 2) - 0.5) * layout.quayLengthM * 0.86;
      bollardMatrix.makeTranslation(layout.pierLengthM - 7 + side * (layout.quayWidthM * 0.37), 1.9, along);
      bollards.setMatrixAt(i, bollardMatrix);
    }
    bollards.instanceMatrix.needsUpdate = true;
    origin.add(bollards);

    if (layout.buildings.length > 0) {
      const baseGeometry = rememberGeometry(new THREE.BoxGeometry(1, 1, 1));
      const roofGeometry = rememberGeometry(new THREE.ConeGeometry(0.82, 0.46, 4));
      const bases = new THREE.InstancedMesh(baseGeometry, wallMaterial, layout.buildings.length);
      const roofs = new THREE.InstancedMesh(roofGeometry, roofMaterial, layout.buildings.length);
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      for (let i = 0; i < layout.buildings.length; i++) {
        const building = layout.buildings[i];
        rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, building.yaw);
        position.set(building.x, building.height * 0.5, building.z);
        scale.set(building.width, building.height, building.depth);
        matrix.compose(position, rotation, scale);
        bases.setMatrixAt(i, matrix);
        position.y = building.height + 0.13 * Math.max(building.width, building.depth);
        scale.set(building.width, Math.max(building.width, building.depth) * 0.3, building.depth);
        matrix.compose(position, rotation, scale);
        roofs.setMatrixAt(i, matrix);
      }
      bases.instanceMatrix.needsUpdate = true;
      roofs.instanceMatrix.needsUpdate = true;
      bases.castShadow = roofs.castShadow = !isSoftwareGl;
      bases.receiveShadow = roofs.receiveShadow = !isSoftwareGl;
      origin.add(bases, roofs);
    }

    // Lighthouse and beacon mark the end of the breakwater.
    const towerHeight = layout.lighthouseHeightM;
    const towerGeometry = rememberGeometry(new THREE.CylinderGeometry(1.1, 1.65, towerHeight, 10));
    const tower = new THREE.Mesh(towerGeometry, wallMaterial);
    tower.position.set(layout.breakwaterLengthM * 0.92, towerHeight * 0.5, layout.quayWidthM * 1.5);
    tower.castShadow = !isSoftwareGl;
    origin.add(tower);
    const beaconGeometry = rememberGeometry(new THREE.SphereGeometry(1.25, 10, 8));
    const beaconMaterial = new THREE.MeshStandardMaterial({ color: 0xffe8a0, emissive: 0xf59e0b, emissiveIntensity: 1.2 });
    disposables.push(beaconMaterial);
    const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
    beacon.position.set(tower.position.x, towerHeight + 0.8, tower.position.z);
    origin.add(beacon);
    const towerRoofGeometry = rememberGeometry(new THREE.ConeGeometry(1.9, 2.3, 8));
    const towerRoof = new THREE.Mesh(towerRoofGeometry, trimMaterial);
    towerRoof.position.set(tower.position.x, towerHeight + 1.65, tower.position.z);
    origin.add(towerRoof);

    // Small moored sailboats use the project's own procedural geometry rather than new model assets.
    const hullGeometry = rememberGeometry(new THREE.BoxGeometry(8.5, 1.15, 2.7));
    const mastGeometry = rememberGeometry(new THREE.CylinderGeometry(0.09, 0.12, 9.5, 6));
    const sailGeometry = rememberGeometry(new THREE.PlaneGeometry(4.3, 6.1));
    for (let i = 0; i < layout.boatCount; i++) {
      const boat = new THREE.Group();
      const z = (i - (layout.boatCount - 1) / 2) * 7.2;
      const hull = new THREE.Mesh(hullGeometry, boatMaterial);
      hull.position.set(layout.pierLengthM + 18 + (i % 2) * 10, 0.3, z);
      boat.add(hull);
      const mast = new THREE.Mesh(mastGeometry, trimMaterial);
      mast.position.set(layout.pierLengthM + 17 + (i % 2) * 10, 5.2, z);
      boat.add(mast);
      const sail = new THREE.Mesh(sailGeometry, sailMaterial);
      sail.position.set(layout.pierLengthM + 17 + (i % 2) * 10, 5.1, z + 1.8);
      boat.add(sail);
      boat.rotation.y = (i % 2 === 0 ? 1 : -1) * 0.12;
      origin.add(boat);
    }
  };

  const install = (result: IslandWorldResult): void => {
    if (disposed || generated || result.error) return;
    generated = true;
    nearGroup.add(makeTerrainMesh(result.near));
    farGroup.add(makeTerrainMesh(result.far));
    addVegetation(nearGroup, result.near, false);
    addVegetation(farGroup, result.far, true);
    addPort(result.near, result.port);
  };

  const buildFallback = (): void => {
    if (disposed || generated) return;
    const near = generateIsland(seed, archetype, 'near');
    const far = generateIsland(seed, archetype, 'far');
    install({ id: 0, near, far, port: generatePort(seed, region) });
  };

  if (typeof Worker !== 'undefined') {
    try {
      const workerId = 1;
      worker = new Worker(new URL('./islandWorld.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<IslandWorldResult>) => {
        if (event.data.id === workerId) {
          worker?.terminate();
          worker = null;
          if (event.data.error) {
            buildFallback();
            return;
          }
          install(event.data);
        }
      };
      worker.onerror = () => {
        worker?.terminate();
        worker = null;
        buildFallback();
      };
      worker.postMessage({ id: workerId, seed, region, archetype });
    } catch {
      worker?.terminate();
      worker = null;
      buildFallback();
    }
  } else {
    buildFallback();
  }

  const updateLod = (camera: THREE.Vector3): void => {
    const distance = camera.distanceTo(group.position);
    group.visible = distance < 1600;
    if (!lodInitialized) {
      lastLodNear = distance < 480;
      lodInitialized = true;
    } else if (lastLodNear && distance > 500) {
      lastLodNear = false;
    } else if (!lastLodNear && distance < 440) {
      lastLodNear = true;
    }
    nearGroup.visible = lastLodNear;
    farGroup.visible = !lastLodNear;
    portGroup.visible = distance < 1150;
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    worker?.terminate();
    worker = null;
    for (const resource of disposables) resource.dispose();
  };

  return { group, updateLod, dispose };
}

import { generateIsland, generatePort, type IslandArchetype } from './generators';

interface IslandWorldRequest {
  id: number;
  seed: string;
  region: string;
  archetype: IslandArchetype;
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<IslandWorldRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

// The worker only returns typed height/color/index and instance buffers; Three.js objects stay on the render thread.
workerScope.onmessage = ({ data }) => {
  try {
    const near = generateIsland(data.seed, data.archetype, 'near');
    const far = generateIsland(data.seed, data.archetype, 'far');
    const port = generatePort(data.seed, data.region);
    const transfer: Transferable[] = [];
    for (const terrain of [near, far]) {
      transfer.push(
        terrain.positions.buffer as ArrayBuffer,
        terrain.colors.buffer as ArrayBuffer,
        terrain.indices.buffer as ArrayBuffer,
        terrain.trees.buffer as ArrayBuffer,
        terrain.rocks.buffer as ArrayBuffer,
      );
    }
    workerScope.postMessage({ id: data.id, near, far, port }, transfer);
  } catch (error) {
    workerScope.postMessage({ id: data.id, error: String(error) });
  }
};

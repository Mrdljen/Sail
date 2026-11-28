import * as THREE from 'three';
import type { SimulationState } from '../types/sailing';
import { BOAT_SPECS } from '../sim/boats';
import { toMarineInstrumentData } from '../sim/instrumentData';

export interface ProceduralTextureSet {
  teakColor: THREE.CanvasTexture;
  teakBump: THREE.CanvasTexture;
  teakHollyTex: THREE.CanvasTexture;
  mahoganyColor: THREE.CanvasTexture;
  nauticalChartTex: THREE.CanvasTexture;
  sailCloth: THREE.CanvasTexture;
  compassDial: THREE.CanvasTexture;
  switchPanel: THREE.CanvasTexture;
  wakeRadial: THREE.CanvasTexture;
  oceanNormalTex: THREE.DataTexture;
  oceanFoamTex: THREE.DataTexture;
  chartPlotterTex: THREE.CanvasTexture;
  barometerTex: THREE.CanvasTexture;
  ammeterTex: THREE.CanvasTexture;
  helmInstrumentTex: THREE.CanvasTexture;
  vhfLiveTex: THREE.CanvasTexture;
  updateCabinInstruments: (state: SimulationState) => void;
  dispose: () => void;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ported from tides-of-fortune/src/world/ocean/textures.js: tileable ocean detail normal map
function createOceanDetailNormalTexture(anisotropy: number): THREE.DataTexture {
  const N = 256;
  const rnd = mulberry32(9137);
  const waves: Array<{ kx: number; ky: number; a: number; p: number }> = [];
  for (let i = 0; i < 40; i++) {
    const f = 1 + Math.floor(Math.pow(rnd(), 1.6) * 14);
    const ang = (rnd() - 0.5) * Math.PI * 1.5;
    let kx = Math.round(Math.cos(ang) * f);
    const ky = Math.round(Math.sin(ang) * f);
    if (kx === 0 && ky === 0) kx = 1;
    const kl = Math.hypot(kx, ky);
    waves.push({ kx, ky, a: 0.5 / Math.pow(kl, 1.2), p: rnd() * Math.PI * 2 });
  }
  const H = new Float32Array(N * N);
  const DX = new Float32Array(N * N);
  const DY = new Float32Array(N * N);
  let maxD = 0;
  let minH = 1e9;
  let maxH = -1e9;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let h = 0;
      let dx = 0;
      let dy = 0;
      const u = (x / N) * Math.PI * 2;
      const v = (y / N) * Math.PI * 2;
      for (const w of waves) {
        const th = w.kx * u + w.ky * v + w.p;
        const s = Math.sin(th);
        const c = Math.cos(th);
        h += w.a * (s - 0.25 * Math.cos(2 * th));
        const d = w.a * (c + 0.5 * Math.sin(2 * th));
        dx += d * w.kx;
        dy += d * w.ky;
      }
      const i = y * N + x;
      H[i] = h;
      DX[i] = dx;
      DY[i] = dy;
      maxD = Math.max(maxD, Math.abs(dx), Math.abs(dy));
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
    }
  }
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = Math.round(((-DX[i] / maxD) * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round(((-DY[i] / maxD) * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round(((H[i] - minH) / Math.max(1e-5, maxH - minH)) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function valueNoiseTile(N: number, cells: number, rnd: () => number): Float32Array {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * cells;
      const fy = (y / N) * cells;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      let tx = fx - ix;
      let ty = fy - iy;
      tx = tx * tx * (3 - 2 * tx);
      ty = ty * ty * (3 - 2 * ty);
      const x1 = (ix + 1) % cells;
      const y1 = (iy + 1) % cells;
      const a = g[iy * cells + ix];
      const b = g[iy * cells + x1];
      const c = g[y1 * cells + ix];
      const d = g[y1 * cells + x1];
      out[y * N + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

function fbmTile(N: number, base: number, oct: number, rnd: () => number): Float32Array {
  const out = new Float32Array(N * N);
  let amp = 0.5;
  let tot = 0;
  for (let o = 0; o < oct; o++) {
    const n = valueNoiseTile(N, base << o, rnd);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    tot += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function normalize01(a: Float32Array): Float32Array {
  let lo = 1e9;
  let hi = -1e9;
  for (let i = 0; i < a.length; i++) {
    if (a[i] < lo) lo = a[i];
    if (a[i] > hi) hi = a[i];
  }
  const span = Math.max(1e-6, hi - lo);
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / span;
  return a;
}

function cellTile(N: number, cells: number, rnd: () => number): Float32Array {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < cells * cells; i++) pts.push([rnd(), rnd()]);
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * cells;
      const fy = (y / N) * cells;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      let f1 = 9;
      let f2 = 9;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = ix + ox;
          const cy = iy + oy;
          const p = pts[((cy + cells) % cells) * cells + ((cx + cells) % cells)];
          const d = Math.hypot(cx + p[0] - fx, cy + p[1] - fy);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) {
            f2 = d;
          }
        }
      }
      out[y * N + x] = f2 - f1;
    }
  }
  return out;
}

// Ported from tides-of-fortune/src/world/ocean/textures.js: tileable cellular + FBM foam map
function createOceanFoamTexture(anisotropy: number): THREE.DataTexture {
  const N = 256;
  const rnd = mulberry32(4242);
  const r = normalize01(fbmTile(N, 4, 5, rnd));
  const c1 = normalize01(cellTile(N, 12, rnd));
  const c2 = normalize01(cellTile(N, 26, rnd));
  const g = new Float32Array(N * N);
  const b0 = normalize01(fbmTile(N, 8, 4, rnd));
  for (let i = 0; i < g.length; i++) {
    const l1 = Math.pow(1 - c1[i], 3.0);
    const l2 = Math.pow(1 - c2[i], 4.0);
    const solid = Math.max(0, r[i] - 0.55) * 2.2;
    g[i] = Math.min(1, (l1 * 0.7 + l2 * 0.5) * (0.55 + r[i] * 0.9) + solid * 0.6 + b0[i] * 0.2);
  }
  normalize01(g);
  const b = normalize01(fbmTile(N, 16, 3, rnd));
  const a = normalize01(fbmTile(N, 2, 3, rnd));
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = Math.round(r[i] * 255);
    data[i * 4 + 1] = Math.round(g[i] * 255);
    data[i * 4 + 2] = Math.round(b[i] * 255);
    data[i * 4 + 3] = Math.round(a[i] * 255);
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Teak deck planking with black sikaflex caulking
  const teakCanvas = document.createElement('canvas');
  teakCanvas.width = 512;
  teakCanvas.height = 512;
  const tCtx = teakCanvas.getContext('2d')!;
  tCtx.fillStyle = '#9c6e44';
  tCtx.fillRect(0, 0, 512, 512);
  const plankCount = 12;
  const plankW = 512 / plankCount;
  for (let i = 0; i < plankCount; i++) {
    const shade = (i % 3) * 7 - 7;
    tCtx.fillStyle = `rgb(${156 + shade}, ${112 + shade}, ${72 + shade})`;
    tCtx.fillRect(i * plankW + 2, 0, plankW - 4, 512);
    tCtx.fillStyle = 'rgba(70, 42, 20, 0.14)';
    for (let g = 0; g < 16; g++) {
      const gx = i * plankW + 4 + ((g * 13) % (plankW - 8));
      tCtx.fillRect(gx, 0, 1.5, 512);
    }
    tCtx.fillStyle = '#1d1b1a';
    tCtx.fillRect(i * plankW, 0, 3, 512);
  }
  const teakColor = new THREE.CanvasTexture(teakCanvas);
  teakColor.colorSpace = THREE.SRGBColorSpace;
  teakColor.wrapS = teakColor.wrapT = THREE.RepeatWrapping;
  teakColor.repeat.set(2, 3);
  teakColor.anisotropy = maxAnisotropy;

  // Teak bump map (linear)
  const teakBumpCanvas = document.createElement('canvas');
  teakBumpCanvas.width = 512;
  teakBumpCanvas.height = 512;
  const tbCtx = teakBumpCanvas.getContext('2d')!;
  tbCtx.fillStyle = '#d8d8d8';
  tbCtx.fillRect(0, 0, 512, 512);
  tbCtx.fillStyle = '#242424';
  for (let i = 0; i < plankCount; i++) {
    tbCtx.fillRect(i * plankW, 0, 3, 512);
  }
  const teakBump = new THREE.CanvasTexture(teakBumpCanvas);
  teakBump.wrapS = teakBump.wrapT = THREE.RepeatWrapping;
  teakBump.repeat.set(2, 3);

  // 2. Mahogany cabin joinery
  const mahCanvas = document.createElement('canvas');
  mahCanvas.width = 256;
  mahCanvas.height = 256;
  const mCtx = mahCanvas.getContext('2d')!;
  mCtx.fillStyle = '#5a2c18';
  mCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4) {
    mCtx.fillStyle = y % 8 === 0 ? 'rgba(35, 14, 6, 0.25)' : 'rgba(130, 68, 36, 0.18)';
    mCtx.fillRect(0, y, 256, 2);
  }
  const mahoganyColor = new THREE.CanvasTexture(mahCanvas);
  mahoganyColor.colorSpace = THREE.SRGBColorSpace;
  mahoganyColor.wrapS = mahoganyColor.wrapT = THREE.RepeatWrapping;
  mahoganyColor.anisotropy = maxAnisotropy;

  // 2b. Classic Cabin Sole Teak & Holly Striping
  const thCanvas = document.createElement('canvas');
  thCanvas.width = 512;
  thCanvas.height = 512;
  const thCtx = thCanvas.getContext('2d')!;
  thCtx.fillStyle = '#8d592d';
  thCtx.fillRect(0, 0, 512, 512);
  const solePlanks = 10;
  const spW = 512 / solePlanks;
  for (let i = 0; i < solePlanks; i++) {
    const shade = ((i * 5) % 3) * 6 - 6;
    thCtx.fillStyle = `rgb(${144 + shade}, ${91 + Math.round(shade * 0.7)}, ${46 + Math.round(shade * 0.5)})`;
    thCtx.fillRect(i * spW + 5, 0, spW - 5, 512);
    // Warm holly inlay strip
    thCtx.fillStyle = '#e7dcc2';
    thCtx.fillRect(i * spW, 0, 5, 512);
    thCtx.fillStyle = 'rgba(65, 34, 14, 0.16)';
    for (let g = 0; g < 12; g++) {
      const gx = i * spW + 7 + ((g * 17) % (spW - 10));
      thCtx.fillRect(gx, 0, 1.5, 512);
    }
  }
  const teakHollyTex = new THREE.CanvasTexture(thCanvas);
  teakHollyTex.colorSpace = THREE.SRGBColorSpace;
  teakHollyTex.wrapS = teakHollyTex.wrapT = THREE.RepeatWrapping;
  teakHollyTex.repeat.set(1.5, 2.2);
  teakHollyTex.anisotropy = maxAnisotropy;

  // 2c. Open Paper Nautical Chart on Cabin Navigation Desk
  const chCanvas = document.createElement('canvas');
  chCanvas.width = 512;
  chCanvas.height = 384;
  const chCtx = chCanvas.getContext('2d')!;
  chCtx.fillStyle = '#f2e8cf';
  chCtx.fillRect(0, 0, 512, 384);
  chCtx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
  chCtx.lineWidth = 1;
  for (let x = 48; x < 512; x += 64) {
    chCtx.beginPath();
    chCtx.moveTo(x, 12);
    chCtx.lineTo(x, 372);
    chCtx.stroke();
  }
  for (let y = 48; y < 384; y += 64) {
    chCtx.beginPath();
    chCtx.moveTo(12, y);
    chCtx.lineTo(500, y);
    chCtx.stroke();
  }
  // Coastal headland & bathymetry contour
  chCtx.fillStyle = '#dfd0a8';
  chCtx.beginPath();
  chCtx.moveTo(0, 0);
  chCtx.lineTo(145, 0);
  chCtx.quadraticCurveTo(175, 95, 95, 165);
  chCtx.quadraticCurveTo(45, 220, 0, 240);
  chCtx.closePath();
  chCtx.fill();
  chCtx.strokeStyle = '#5c4d35';
  chCtx.lineWidth = 2;
  chCtx.stroke();
  // Compass rose
  chCtx.save();
  chCtx.translate(365, 135);
  chCtx.strokeStyle = '#991b1b';
  chCtx.lineWidth = 1.5;
  chCtx.beginPath();
  chCtx.arc(0, 0, 48, 0, Math.PI * 2);
  chCtx.stroke();
  for (let r = 0; r < 16; r++) {
    const a = (r * Math.PI) / 8;
    chCtx.beginPath();
    chCtx.moveTo(Math.cos(a) * 32, Math.sin(a) * 32);
    chCtx.lineTo(Math.cos(a) * 48, Math.sin(a) * 48);
    chCtx.stroke();
  }
  chCtx.restore();
  // Rhumb line plotted across chart
  chCtx.strokeStyle = '#b91c1c';
  chCtx.lineWidth = 2;
  chCtx.setLineDash([7, 5]);
  chCtx.beginPath();
  chCtx.moveTo(115, 245);
  chCtx.lineTo(435, 95);
  chCtx.stroke();
  chCtx.setLineDash([]);
  chCtx.fillStyle = '#334155';
  chCtx.font = 'bold 12px serif';
  chCtx.fillText('NORTH ATLANTIC · CANARY APPROACH', 155, 34);
  const nauticalChartTex = new THREE.CanvasTexture(chCanvas);
  nauticalChartTex.colorSpace = THREE.SRGBColorSpace;
  nauticalChartTex.anisotropy = maxAnisotropy;

  const oceanNormalTex = createOceanDetailNormalTexture(maxAnisotropy);
  const oceanFoamTex = createOceanFoamTexture(maxAnisotropy);

  // 3. Dacron sailcloth weave with panel seams & reef cringles
  const sailCanvas = document.createElement('canvas');
  sailCanvas.width = 512;
  sailCanvas.height = 512;
  const sCtx = sailCanvas.getContext('2d')!;
  sCtx.fillStyle = '#f8f6ef';
  sCtx.fillRect(0, 0, 512, 512);
  sCtx.strokeStyle = 'rgba(165, 155, 138, 0.35)';
  sCtx.lineWidth = 2;
  for (let y = 64; y < 512; y += 64) {
    sCtx.beginPath();
    sCtx.moveTo(0, y);
    sCtx.lineTo(512, y);
    sCtx.stroke();
  }
  sCtx.strokeStyle = '#1e3a5f';
  sCtx.lineWidth = 3;
  [330, 415].forEach((ry) => {
    sCtx.beginPath();
    sCtx.moveTo(0, ry);
    sCtx.lineTo(512, ry);
    sCtx.stroke();
  });
  const sailCloth = new THREE.CanvasTexture(sailCanvas);
  sailCloth.colorSpace = THREE.SRGBColorSpace;
  sailCloth.anisotropy = maxAnisotropy;

  // 4. Brass Compass Dial
  const compCanvas = document.createElement('canvas');
  compCanvas.width = 256;
  compCanvas.height = 256;
  const cCtx = compCanvas.getContext('2d')!;
  cCtx.fillStyle = '#0c1824';
  cCtx.beginPath();
  cCtx.arc(128, 128, 122, 0, Math.PI * 2);
  cCtx.fill();
  cCtx.strokeStyle = '#d4af37';
  cCtx.lineWidth = 4;
  cCtx.stroke();
  cCtx.save();
  cCtx.translate(128, 128);
  for (let d = 0; d < 36; d++) {
    cCtx.save();
    cCtx.rotate((d * 10 * Math.PI) / 180);
    cCtx.strokeStyle = d % 9 === 0 ? '#f59e0b' : '#cbd5e1';
    cCtx.lineWidth = d % 9 === 0 ? 3 : 1.5;
    cCtx.beginPath();
    cCtx.moveTo(0, -112);
    cCtx.lineTo(0, d % 3 === 0 ? -94 : -104);
    cCtx.stroke();
    cCtx.restore();
  }
  cCtx.fillStyle = '#f8fafc';
  cCtx.font = 'bold 22px sans-serif';
  cCtx.textAlign = 'center';
  cCtx.textBaseline = 'middle';
  cCtx.fillText('N', 0, -76);
  cCtx.fillText('E', 76, 0);
  cCtx.fillText('S', 0, 76);
  cCtx.fillText('W', -76, 0);
  cCtx.restore();
  const compassDial = new THREE.CanvasTexture(compCanvas);
  compassDial.colorSpace = THREE.SRGBColorSpace;
  compassDial.anisotropy = maxAnisotropy;

  // 5. Cabin 12V Breaker Panel Label Plate
  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = 256;
  panelCanvas.height = 256;
  const pCtx = panelCanvas.getContext('2d')!;
  pCtx.fillStyle = '#18222f';
  pCtx.fillRect(0, 0, 256, 256);
  pCtx.strokeStyle = '#475569';
  pCtx.lineWidth = 6;
  pCtx.strokeRect(4, 4, 248, 248);
  pCtx.fillStyle = '#e2e8f0';
  pCtx.font = 'bold 16px monospace';
  pCtx.fillText('12V DC BREAKER PANEL', 22, 30);
  const labels = ['NAV LTS', 'CABIN', 'VHF / WX', 'INSTRUM', 'FRIDGE', 'BILGE'];
  labels.forEach((lbl, idx) => {
    const y = 64 + idx * 30;
    pCtx.fillStyle = '#94a3b8';
    pCtx.font = 'bold 14px monospace';
    pCtx.fillText(lbl, 24, y + 6);
  });
  const switchPanel = new THREE.CanvasTexture(panelCanvas);
  switchPanel.colorSpace = THREE.SRGBColorSpace;
  switchPanel.anisotropy = maxAnisotropy;

  // 6. Soft radial wake foam sprite
  const wakeCanvas = document.createElement('canvas');
  wakeCanvas.width = 64;
  wakeCanvas.height = 64;
  const wCtx = wakeCanvas.getContext('2d')!;
  const grad = wCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  grad.addColorStop(0.5, 'rgba(226, 244, 255, 0.35)');
  grad.addColorStop(1, 'rgba(226, 244, 255, 0)');
  wCtx.fillStyle = grad;
  wCtx.fillRect(0, 0, 64, 64);
  const wakeRadial = new THREE.CanvasTexture(wakeCanvas);
  wakeRadial.colorSpace = THREE.SRGBColorSpace;

  // 7. Live 3D Cabin Instrument Canvases (M4)
  const plotterCanvas = document.createElement('canvas');
  plotterCanvas.width = 320;
  plotterCanvas.height = 224;
  const plCtx = plotterCanvas.getContext('2d')!;
  const chartPlotterTex = new THREE.CanvasTexture(plotterCanvas);
  chartPlotterTex.colorSpace = THREE.SRGBColorSpace;
  chartPlotterTex.anisotropy = maxAnisotropy;

  const baroCanvas = document.createElement('canvas');
  baroCanvas.width = 192;
  baroCanvas.height = 192;
  const bCtx = baroCanvas.getContext('2d')!;
  const barometerTex = new THREE.CanvasTexture(baroCanvas);
  barometerTex.colorSpace = THREE.SRGBColorSpace;
  barometerTex.anisotropy = maxAnisotropy;

  const ampCanvas = document.createElement('canvas');
  ampCanvas.width = 256;
  ampCanvas.height = 160;
  const aCtx = ampCanvas.getContext('2d')!;
  const ammeterTex = new THREE.CanvasTexture(ampCanvas);
  ammeterTex.colorSpace = THREE.SRGBColorSpace;
  ammeterTex.anisotropy = maxAnisotropy;

  const vhfCanvas = document.createElement('canvas');
  vhfCanvas.width = 256;
  vhfCanvas.height = 128;
  const vCtx = vhfCanvas.getContext('2d')!;
  const vhfLiveTex = new THREE.CanvasTexture(vhfCanvas);
  vhfLiveTex.colorSpace = THREE.SRGBColorSpace;
  vhfLiveTex.anisotropy = maxAnisotropy;

  const helmCanvas = document.createElement('canvas');
  helmCanvas.width = 384;
  helmCanvas.height = 256;
  const helmCtx = helmCanvas.getContext('2d')!;
  const helmInstrumentTex = new THREE.CanvasTexture(helmCanvas);
  helmInstrumentTex.colorSpace = THREE.SRGBColorSpace;
  helmInstrumentTex.anisotropy = maxAnisotropy;

  const updateCabinInstruments = (state: SimulationState) => {
    const instruments = toMarineInstrumentData(state, BOAT_SPECS[state.boatId].noGoAngleDeg);
    const pressureHpa = instruments.environment.outside.pressure.value / 100;
    // Cockpit repeater: familiar wind, log, depth and heading fields on one waterproof display.
    helmCtx.fillStyle = '#06121d';
    helmCtx.fillRect(0, 0, 384, 256);
    helmCtx.fillStyle = '#10283a';
    helmCtx.fillRect(0, 0, 384, 31);
    helmCtx.fillStyle = instruments.sailing.instrumentsPowered ? '#e2e8f0' : '#64748b';
    helmCtx.font = 'bold 15px monospace';
    helmCtx.fillText(instruments.sailing.instrumentsPowered ? 'SAIL / NAV' : 'INSTRUMENTS OFF', 14, 21);
    helmCtx.textAlign = 'right';
    helmCtx.fillStyle = '#34d399';
    helmCtx.fillText(instruments.sailing.autopilotMode.toUpperCase(), 370, 21);
    helmCtx.textAlign = 'left';
    if (instruments.sailing.instrumentsPowered) {
      const wx = 83;
      const wy = 133;
      const wr = 66;
      helmCtx.fillStyle = '#0c1d2b';
      helmCtx.beginPath();
      helmCtx.arc(wx, wy, wr, 0, Math.PI * 2);
      helmCtx.fill();
      helmCtx.strokeStyle = '#657c8a';
      helmCtx.lineWidth = 2;
      helmCtx.stroke();
      helmCtx.fillStyle = 'rgba(248,113,113,.2)';
      helmCtx.beginPath();
      helmCtx.moveTo(wx, wy);
      helmCtx.arc(wx, wy, wr - 8, -Math.PI / 2 - (instruments.sailing.noGoAngleDeg * Math.PI) / 180,
        -Math.PI / 2 + (instruments.sailing.noGoAngleDeg * Math.PI) / 180);
      helmCtx.closePath();
      helmCtx.fill();
      for (let d = 0; d < 360; d += 30) {
        const a = (d * Math.PI) / 180 - Math.PI / 2;
        const inner = wr - (d % 90 === 0 ? 18 : 10);
        helmCtx.strokeStyle = '#cbd5e1';
        helmCtx.beginPath();
        helmCtx.moveTo(wx + Math.cos(a) * inner, wy + Math.sin(a) * inner);
        helmCtx.lineTo(wx + Math.cos(a) * (wr - 4), wy + Math.sin(a) * (wr - 4));
        helmCtx.stroke();
      }
      const awa = instruments.sailing.apparentWindAngleDeg * Math.PI / 180 - Math.PI / 2;
      helmCtx.strokeStyle = '#fbbf24';
      helmCtx.lineWidth = 4;
      helmCtx.beginPath();
      helmCtx.moveTo(wx, wy);
      helmCtx.lineTo(wx + Math.cos(awa) * (wr - 20), wy + Math.sin(awa) * (wr - 20));
      helmCtx.stroke();
      helmCtx.fillStyle = '#f8fafc';
      helmCtx.beginPath();
      helmCtx.moveTo(wx, wy - 9);
      helmCtx.lineTo(wx - 6, wy + 6);
      helmCtx.lineTo(wx + 6, wy + 6);
      helmCtx.closePath();
      helmCtx.fill();

      const readout = (label: string, value: string, x: number, y: number, color = '#f8fafc') => {
        helmCtx.fillStyle = '#91a5b2';
        helmCtx.font = '11px monospace';
        helmCtx.fillText(label, x, y);
        helmCtx.fillStyle = color;
        helmCtx.font = 'bold 20px monospace';
        helmCtx.fillText(value, x, y + 24);
      };
      readout('APP WIND', `${Math.round(instruments.sailing.apparentWindAngleDeg)}°`, 174, 60, '#fbbf24');
      readout('BOAT SPEED', `${instruments.navigation.speedThroughWater.value.toFixed(1)} kt`, 174, 103, '#7dd3fc');
      readout('DEPTH', `${instruments.route.depthM.toFixed(1)} m`, 174, 146, instruments.route.depthM < 6 ? '#fb7185' : '#f8fafc');
      readout('HEADING', `${String(Math.round(instruments.sailing.headingDeg) % 360).padStart(3, '0')}°`, 174, 189, '#34d399');
      helmCtx.fillStyle = '#9fb2bf';
      helmCtx.font = '11px monospace';
      helmCtx.fillText(
        `TWS ${instruments.sailing.trueWindSpeedKts.toFixed(1)}  TWA ${Math.round(instruments.environment.wind.angleTrueWater.value * 180 / Math.PI)}° / ${Math.round(instruments.sailing.targetUpwindAngleDeg)}°`,
        16,
        235,
      );
      helmCtx.fillText(
        `VMG ${instruments.navigation.velocityMadeGoodToWaypoint.value.toFixed(1)} kt  CTS ${String(Math.round(instruments.route.bearingToWaypointDeg) % 360).padStart(3, '0')}°`,
        16,
        251,
      );
    } else {
      helmCtx.fillStyle = '#64748b';
      helmCtx.font = 'bold 16px monospace';
      helmCtx.textAlign = 'center';
      helmCtx.fillText('SWITCH ON INSTRUMENTS', 192, 139);
      helmCtx.textAlign = 'left';
    }
    helmInstrumentTex.needsUpdate = true;

    // A. Chart Plotter Display
    plCtx.fillStyle = '#071522';
    plCtx.fillRect(0, 0, 320, 224);
    if (!instruments.sailing.instrumentsPowered) {
      plCtx.strokeStyle = '#334155';
      plCtx.lineWidth = 4;
      plCtx.strokeRect(4, 4, 312, 216);
      plCtx.fillStyle = '#64748b';
      plCtx.font = 'bold 16px monospace';
      plCtx.textAlign = 'center';
      plCtx.fillText('PLOTTER STANDBY', 160, 102);
      plCtx.font = '12px monospace';
      plCtx.fillText('SWITCH ON INSTRUM BREAKER', 160, 128);
      plCtx.textAlign = 'left';
    } else {
      // Lat/Lon chart grid
      plCtx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
      plCtx.lineWidth = 1;
      for (let gx = 32; gx < 320; gx += 48) {
        plCtx.beginPath();
        plCtx.moveTo(gx, 28);
        plCtx.lineTo(gx, 188);
        plCtx.stroke();
      }
      for (let gy = 40; gy < 188; gy += 36) {
        plCtx.beginPath();
        plCtx.moveTo(12, gy);
        plCtx.lineTo(308, gy);
        plCtx.stroke();
      }

      // Rhumb line corridor + channel hazard boundaries
      plCtx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
      plCtx.setLineDash([6, 4]);
      plCtx.beginPath();
      plCtx.moveTo(28, 108);
      plCtx.lineTo(292, 108);
      plCtx.stroke();
      plCtx.setLineDash([]);

      // Departure & Destination Harbor Markers
      plCtx.fillStyle = '#38bdf8';
      plCtx.beginPath();
      plCtx.arc(28, 108, 5, 0, Math.PI * 2);
      plCtx.fill();
      plCtx.fillStyle = '#10b981';
      plCtx.beginPath();
      plCtx.arc(292, 108, 6, 0, Math.PI * 2);
      plCtx.fill();

      // Vessel marker on track
      const fracX = instruments.route.progress;
      const vx = 28 + fracX * 264;
      const vy = Math.min(180, Math.max(36, 108 + instruments.route.crossTrackNm * 7));
      const hRad = ((instruments.sailing.headingDeg - 90) * Math.PI) / 180;
      plCtx.save();
      plCtx.translate(vx, vy);
      plCtx.rotate(hRad);
      plCtx.fillStyle = '#f59e0b';
      plCtx.beginPath();
      plCtx.moveTo(9, 0);
      plCtx.lineTo(-6, -5);
      plCtx.lineTo(-6, 5);
      plCtx.closePath();
      plCtx.fill();
      plCtx.restore();

      // Header + Footer telemetry bar
      plCtx.fillStyle = '#0f2538';
      plCtx.fillRect(0, 0, 320, 26);
      plCtx.fillRect(0, 190, 320, 34);
      plCtx.fillStyle = instruments.systems.weatherPhase === 'squall' ? '#f87171' : '#38bdf8';
      plCtx.font = 'bold 12px monospace';
      plCtx.fillText(
        state.weather.phase === 'squall'
          ? 'SQUALL ALERT · REEF ADVISED'
          : `${state.passage.fromName.slice(0, 10)} > ${state.passage.toName.slice(0, 10)}`,
        10,
        17,
      );
      plCtx.fillStyle = '#e2e8f0';
      plCtx.font = 'bold 12px monospace';
      const dtw = Math.max(0, Math.round(instruments.route.distanceRemainingNm));
      plCtx.fillText(
        `HDG ${String(Math.round(instruments.sailing.headingDeg)).padStart(3, '0')}  SOG ${instruments.navigation.speedOverGround.value.toFixed(1)}kt  DTW ${dtw}NM`,
        10,
        207,
      );
      plCtx.fillStyle = state.passage.depthM < 6 ? '#f87171' : '#34d399';
      plCtx.font = '11px monospace';
      plCtx.fillText(`DEPTH ${state.passage.depthM.toFixed(1)}m · REEF ${state.reefLevel}`, 10, 220);
    }
    chartPlotterTex.needsUpdate = true;

    // B. Aneroid Barometer Dial
    bCtx.fillStyle = '#1b140d';
    bCtx.fillRect(0, 0, 192, 192);
    bCtx.fillStyle = '#f8f3e6';
    bCtx.beginPath();
    bCtx.arc(96, 96, 86, 0, Math.PI * 2);
    bCtx.fill();
    bCtx.strokeStyle = '#ca8a04';
    bCtx.lineWidth = 8;
    bCtx.stroke();

    // Scale ticks 980..1040 hPa mapped -135deg to +135deg
    for (let h = 980; h <= 1040; h += 5) {
      const norm = (h - 980) / 60;
      const ang = (-135 + norm * 270 - 90) * (Math.PI / 180);
      const inner = h % 10 === 0 ? 58 : 66;
      bCtx.strokeStyle = h <= 1000 ? '#dc2626' : '#1e293b';
      bCtx.lineWidth = h % 10 === 0 ? 2.5 : 1.5;
      bCtx.beginPath();
      bCtx.moveTo(96 + Math.cos(ang) * inner, 96 + Math.sin(ang) * inner);
      bCtx.lineTo(96 + Math.cos(ang) * 76, 96 + Math.sin(ang) * 76);
      bCtx.stroke();
    }
    bCtx.fillStyle = '#0f172a';
    bCtx.font = 'bold 11px sans-serif';
    bCtx.textAlign = 'center';
    bCtx.fillText('STORM', 52, 134);
    bCtx.fillText('FAIR', 140, 134);
    bCtx.font = 'bold 15px monospace';
    bCtx.fillText(`${Math.round(pressureHpa)}`, 96, 148);
    bCtx.font = '10px sans-serif';
    bCtx.fillStyle = pressureHpa < 1005 ? '#dc2626' : '#475569';
    bCtx.fillText(instruments.systems.barometerTrend.toUpperCase(), 96, 162);
    bCtx.textAlign = 'left';

    // Needle
    const bNorm = Math.min(1, Math.max(0, (pressureHpa - 980) / 60));
    const nAng = (-135 + bNorm * 270 - 90) * (Math.PI / 180);
    bCtx.strokeStyle = '#0f172a';
    bCtx.lineWidth = 4;
    bCtx.beginPath();
    bCtx.moveTo(96, 96);
    bCtx.lineTo(96 + Math.cos(nAng) * 64, 96 + Math.sin(nAng) * 64);
    bCtx.stroke();
    bCtx.fillStyle = '#b45309';
    bCtx.beginPath();
    bCtx.arc(96, 96, 7, 0, Math.PI * 2);
    bCtx.fill();
    barometerTex.needsUpdate = true;

    // C. 12V Battery / Solar Ammeter Gauge
    aCtx.fillStyle = '#0f172a';
    aCtx.fillRect(0, 0, 256, 160);
    aCtx.strokeStyle = '#475569';
    aCtx.lineWidth = 4;
    aCtx.strokeRect(2, 2, 252, 156);
    const soc = Math.min(1, Math.max(0, instruments.electrical.batteries.house.capacity.stateOfCharge.value));
    aCtx.fillStyle = '#94a3b8';
    aCtx.font = 'bold 12px monospace';
    aCtx.fillText('12V HOUSE BANK & SOLAR', 14, 24);
    aCtx.fillStyle = soc < 0.25 ? '#f87171' : '#34d399';
    aCtx.font = 'bold 20px monospace';
    aCtx.fillText(`${state.electrical.voltage.toFixed(1)}V · ${Math.round(soc * 100)}%`, 14, 52);

    // SOC Bar
    aCtx.fillStyle = '#1e293b';
    aCtx.fillRect(14, 62, 228, 14);
    aCtx.fillStyle = soc < 0.25 ? '#ef4444' : '#10b981';
    aCtx.fillRect(14, 62, Math.round(228 * soc), 14);

    aCtx.fillStyle = '#fbbf24';
    aCtx.font = 'bold 13px monospace';
    aCtx.fillText(
      `SOLAR +${Math.round(state.electrical.solarWatts)}W   LOAD -${Math.round(state.electrical.drawWatts)}W`,
      14,
      98,
    );
    aCtx.fillStyle = state.electrical.fridgeTempC > 10 ? '#f87171' : '#7dd3fc';
    aCtx.fillText(
      `FRIDGE ${state.electrical.fridgeTempC.toFixed(1)}C  PROV ${state.electrical.provisionsDays.toFixed(1)}d`,
      14,
      120,
    );
    aCtx.fillStyle = state.autopilotMode === 'windvane' ? '#34d399' : '#cbd5e1';
    aCtx.fillText(`AUTO: ${state.autopilotMode.toUpperCase()} · ${Math.round(state.autopilotTargetDeg)}deg`, 14, 142);
    ammeterTex.needsUpdate = true;

    // D. VHF Channel 16 Screen
    vCtx.fillStyle = state.electrical.vhfRadio ? '#062624' : '#0b1117';
    vCtx.fillRect(0, 0, 256, 128);
    vCtx.strokeStyle = state.electrical.vhfRadio ? '#14b8a6' : '#334155';
    vCtx.lineWidth = 4;
    vCtx.strokeRect(2, 2, 252, 124);
    if (!state.electrical.vhfRadio) {
      vCtx.fillStyle = '#475569';
      vCtx.font = 'bold 18px monospace';
      vCtx.fillText('VHF RADIO OFF', 50, 70);
    } else {
      vCtx.fillStyle = '#2dd4bf';
      vCtx.font = 'bold 18px monospace';
      vCtx.fillText('CH 16 · WX MONITOR', 14, 30);
      vCtx.fillStyle = state.weather.phase === 'squall' ? '#fca5a5' : '#ccfbf1';
      vCtx.font = 'bold 14px monospace';
      vCtx.fillText(
        `TWS ${Math.round(state.weather.trueWindSpeedKts)}kt  GUST ${Math.round(state.weather.gustSpeedKts)}kt`,
        14,
        62,
      );
      vCtx.fillText(`SEAS ${state.weather.waveHeightM.toFixed(1)}m · ${state.weather.barometerTrend}`, 14, 88);
      vCtx.fillStyle = '#5eead4';
      vCtx.font = '12px monospace';
      vCtx.fillText(state.weather.phase.toUpperCase(), 14, 112);
    }
    vhfLiveTex.needsUpdate = true;
  };

  return {
    teakColor,
    teakBump,
    teakHollyTex,
    mahoganyColor,
    nauticalChartTex,
    sailCloth,
    compassDial,
    switchPanel,
    wakeRadial,
    oceanNormalTex,
    oceanFoamTex,
    chartPlotterTex,
    barometerTex,
    ammeterTex,
    helmInstrumentTex,
    vhfLiveTex,
    updateCabinInstruments,
    dispose: () => {
      teakColor.dispose();
      teakBump.dispose();
      teakHollyTex.dispose();
      mahoganyColor.dispose();
      nauticalChartTex.dispose();
      sailCloth.dispose();
      compassDial.dispose();
      switchPanel.dispose();
      wakeRadial.dispose();
      oceanNormalTex.dispose();
      oceanFoamTex.dispose();
      chartPlotterTex.dispose();
      barometerTex.dispose();
      ammeterTex.dispose();
      helmInstrumentTex.dispose();
      vhfLiveTex.dispose();
    },
  };
}

import * as THREE from 'three';

export interface ProceduralTextureSet {
  teakColor: THREE.CanvasTexture;
  teakBump: THREE.CanvasTexture;
  mahoganyColor: THREE.CanvasTexture;
  sailCloth: THREE.CanvasTexture;
  compassDial: THREE.CanvasTexture;
  switchPanel: THREE.CanvasTexture;
  wakeRadial: THREE.CanvasTexture;
  dispose: () => void;
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
    // Subtle grain streaks
    tCtx.fillStyle = 'rgba(70, 42, 20, 0.14)';
    for (let g = 0; g < 16; g++) {
      const gx = i * plankW + 4 + ((g * 13) % (plankW - 8));
      tCtx.fillRect(gx, 0, 1.5, 512);
    }
    // Caulking seam
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
  // Reefing stripes
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

  return {
    teakColor,
    teakBump,
    mahoganyColor,
    sailCloth,
    compassDial,
    switchPanel,
    wakeRadial,
    dispose: () => {
      teakColor.dispose();
      teakBump.dispose();
      mahoganyColor.dispose();
      sailCloth.dispose();
      compassDial.dispose();
      switchPanel.dispose();
      wakeRadial.dispose();
    },
  };
}

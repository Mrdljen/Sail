import * as THREE from 'three';
import type { UltraOceanWeatherParams } from '../sim/oceanConfig';

/**
 * WebGL2-only Ultra Water Ocean Module
 * Ported from Humpalumps/Ultra-Water (MIT License, Copyright (c) 2026 Humpalumps):
 *   - src/engine/fullscreen.js (FullscreenQuad, rawPass)
 *   - src/water/bakeTextures.js (Voronoi lace & cauliflower billow foam texture)
 *   - src/water/OceanSim.js (4-cascade JONSWAP spectrum + Stockham radix-2 FFT + LEAN slopes)
 *   - src/water/OceanSurface.js (camera-centered polar grid, Cox-Munk roughness, Lagarde Fresnel,
 *     GGX + Poisson facet sun glints, Atlas SSS crests, two-layer eroded Voronoi foam)
 * Adapted for Meridian Passage open-ocean WebGL2 rendering with passage offset scrolling,
 * Sky.js-matched analytical sky reflection & fog, Three.js ACES/sRGB output, and hull exclusion.
 */

const QUAD_GEO = new THREE.BufferGeometry();
QUAD_GEO.setAttribute(
  'position',
  new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
);
const QUAD_CAM = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const FULLSCREEN_VERT = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

function rawPass(
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform> = {},
): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: FULLSCREEN_VERT,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
}

class FullscreenQuad {
  public mesh: THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial>;

  constructor(material: THREE.RawShaderMaterial) {
    this.mesh = new THREE.Mesh(QUAD_GEO, material);
    this.mesh.frustumCulled = false;
  }

  get material(): THREE.RawShaderMaterial {
    return this.mesh.material;
  }

  set material(m: THREE.RawShaderMaterial) {
    this.mesh.material = m;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null): void {
    renderer.setRenderTarget(target);
    renderer.render(this.mesh, QUAD_CAM);
  }
}

export function isWebGL2UltraWaterSupported(renderer: THREE.WebGLRenderer): boolean {
  if (!renderer.capabilities.isWebGL2) return false;
  const gl = renderer.getContext() as WebGL2RenderingContext | null;
  if (!gl || typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) {
    return false;
  }
  const colorFloat = gl.getExtension('EXT_color_buffer_float');
  return Boolean(colorFloat);
}

// Tileable procedural foam texture (Hash without Sine by David Hoskins, MIT License)
const FOAM_BAKE_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 outColor;

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec2 voronoi(vec2 p, float period) {
  vec2 i = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash22(mod(i + g, period));
      float d = length(g + o - f);
      if (d < f1) { f2 = f1; f1 = d; }
      else if (d < f2) { f2 = d; }
    }
  }
  return vec2(f1, f2);
}

float billow(vec2 uv) {
  vec2 a = voronoi(uv * 7.0 + 0.3, 7.0);
  vec2 b = voronoi(uv * 17.0 + 0.7, 17.0);
  vec2 c = voronoi(uv * 41.0 + 0.1, 41.0);
  return 0.5 * sqrt(clamp((a.y - a.x) * 2.2, 0.0, 1.0))
       + 0.32 * sqrt(clamp((b.y - b.x) * 2.2, 0.0, 1.0))
       + 0.18 * sqrt(clamp((c.y - c.x) * 2.2, 0.0, 1.0));
}

void main() {
  vec2 a = voronoi(vUv * 9.0, 9.0);
  vec2 b = voronoi(vUv * 23.0 + 0.5, 23.0);
  vec2 c = voronoi(vUv * 61.0, 61.0);
  float lace = 1.0 - smoothstep(0.0, 0.22, a.y - a.x);
  float fine = 1.0 - smoothstep(0.0, 0.16, b.y - b.x);
  float bubbles = smoothstep(0.55, 0.15, c.x);
  float v = lace * 0.55 + fine * 0.3 + bubbles * 0.25 + (1.0 - a.x) * 0.25;
  const float e = 1.0 / 1024.0;
  vec2 g = vec2(
    billow(vUv + vec2(e, 0.0)) - billow(vUv - vec2(e, 0.0)),
    billow(vUv + vec2(0.0, e)) - billow(vUv - vec2(0.0, e))
  ) / (2.0 * e);
  outColor = vec4(clamp(v * 0.85, 0.0, 1.0), billow(vUv), clamp(0.5 + g / 64.0, 0.0, 1.0));
}
`;

function bakeFoamTarget(
  renderer: THREE.WebGLRenderer,
  size: number,
): THREE.WebGLRenderTarget {
  const prevRt = renderer.getRenderTarget();
  const rt = new THREE.WebGLRenderTarget(size, size, {
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
    anisotropy: renderer.capabilities.getMaxAnisotropy(),
  });
  const mat = rawPass(FOAM_BAKE_FRAG);
  new FullscreenQuad(mat).render(renderer, rt);
  mat.dispose();
  renderer.setRenderTarget(prevRt);
  return rt;
}

const CASCADE_LENGTHS: [number, number, number, number] = [600, 85, 12, 2.1];
const G = 9.81;
const SIGMA_RHO = 7.4e-5;
const LOOP = 300;

function makeSimShaders(n: number) {
  const common = /* glsl */ `
precision highp float;
precision highp int;
#define N ${n}
#define PI 3.14159265359
#define G ${G.toFixed(2)}
#define ST ${SIGMA_RHO.toExponential()}
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
float omega(float k) { return sqrt(G * k + ST * k * k * k); }
`;

  const initFrag =
    common +
    /* glsl */ `
uniform vec4 uSpecA[2];
uniform vec4 uSpecB[2];
uniform vec4 uLength;
uniform vec4 uCut;
uniform float uCapFade;
uniform uint uSeed;
out vec4 outColor;

uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}

vec2 gauss(ivec2 id, int c) {
  uvec2 h = pcg2d(uvec2(id) + uvec2(uint(c) * 7919u, uint(c) * 104729u) + uSeed);
  float u1 = (float(h.x) + 1.0) / 4294967296.0;
  float u2 = float(h.y) / 4294967296.0;
  float r = sqrt(-2.0 * log(u1));
  return r * vec2(cos(2.0 * PI * u2), sin(2.0 * PI * u2));
}

float jonswap(float w, vec4 a, vec4 b) {
  float wp = b.y;
  float sigma = w <= wp ? 0.07 : 0.09;
  float r = exp(-(w - wp) * (w - wp) / (2.0 * sigma * sigma * wp * wp));
  float iw = 1.0 / w;
  float q = wp * iw;
  return a.x * b.x * G * G * iw * iw * iw * iw * iw * exp(-1.25 * q * q * q * q) * pow(b.z, r);
}

float normalisation(float s) {
  float s2 = s * s, s3 = s2 * s, s4 = s3 * s;
  if (s < 5.0) return -0.000564 * s4 + 0.00776 * s3 - 0.044 * s2 + 0.192 * s + 0.163;
  return -4.80e-08 * s4 + 1.07e-05 * s3 - 9.53e-04 * s2 + 5.90e-02 * s + 3.93e-01;
}

float directional(float theta, float w, vec4 a, vec4 b) {
  float x = w / b.y;
  float s = x > 1.0 ? 9.77 * pow(x, -2.5) : 6.97 * pow(x, 5.0);
  s += 16.0 * tanh(min(x, 20.0)) * a.w * a.w;
  float t = theta - a.y;
  float cosine2s = normalisation(s) * pow(abs(cos(0.5 * t)), 2.0 * s);
  return mix(2.0 / PI * cos(t) * cos(t), cosine2s, a.z);
}

vec2 h0(ivec2 id, int c) {
  float L = uLength[c];
  float dk = 2.0 * PI / L;
  vec2 k = vec2(id - N / 2) * dk;
  float kl = length(k);
  float lo = c == 0 ? 1e-4 : uCut[c - 1];
  float hi = c == 3 ? 1e4 : uCut[c];
  if (kl < lo || kl > hi) return vec2(0.0);
  float w = omega(kl);
  float dwdk = (G + 3.0 * ST * kl * kl) / (2.0 * w);
  float theta = atan(k.y, k.x);
  float S = 0.0;
  for (int i = 0; i < 2; i++) {
    if (uSpecA[i].x <= 0.0) continue;
    float fade = c == 3 ? uCapFade : uSpecB[i].w;
    S += jonswap(w, uSpecA[i], uSpecB[i]) * directional(theta, w, uSpecA[i], uSpecB[i])
       * exp(-fade * fade * kl * kl);
  }
  return gauss(id, c) * sqrt(2.0 * S * dwdk / kl * dk * dk);
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int c = p.y / N;
  ivec2 id = ivec2(p.x, p.y - c * N);
  vec2 a = h0(id, c);
  vec2 b = h0((N - id) % N, c);
  outColor = vec4(a, b.x, -b.y);
}
`;

  const evolveFrag =
    common +
    /* glsl */ `
uniform highp sampler2D uH0;
uniform vec4 uLength;
uniform float uTime;
layout(location = 0) out vec4 out0;
layout(location = 1) out vec4 out1;

vec2 pack2(vec2 a, vec2 b) { return vec2(a.x - b.y, a.y + b.x); }

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int c = p.y / N;
  vec2 k = vec2(ivec2(p.x, p.y - c * N) - N / 2) * (2.0 * PI / uLength[c]);
  float kl = length(k);
  float ik = kl > 1e-6 ? 1.0 / kl : 0.0;
  const float W0 = 2.0 * PI / ${LOOP.toFixed(1)};
  float ph = 2.0 * PI * fract(floor(omega(kl) / W0) * (uTime / ${LOOP.toFixed(1)}));
  vec2 e = vec2(cos(ph), sin(ph));
  vec4 h0 = texelFetch(uH0, p, 0);
  vec2 h = cmul(h0.xy, e) + cmul(h0.zw, vec2(e.x, -e.y));
  vec2 ih = vec2(-h.y, h.x);
  vec2 dx = ih * k.x * ik, dz = ih * k.y * ik;
  vec2 dxdx = -h * k.x * k.x * ik, dzdz = -h * k.y * k.y * ik, dxdz = -h * k.x * k.y * ik;
  vec2 dydx = ih * k.x, dydz = ih * k.y;
  out0 = vec4(pack2(dx, dz), pack2(h, dxdz));
  out1 = vec4(pack2(dydx, dydz), pack2(dxdx, dzdz));
}
`;

  const fftFrag =
    common +
    /* glsl */ `
uniform highp sampler2D uIn0;
uniform highp sampler2D uIn1;
uniform int uSub;
uniform int uVertical;
layout(location = 0) out vec4 out0;
layout(location = 1) out vec4 out1;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int i = uVertical == 1 ? p.y % N : p.x;
  int hs = uSub >> 1;
  int e = (i / uSub) * hs + (i & (hs - 1));
  ivec2 pe, po;
  if (uVertical == 1) {
    int base = p.y - i;
    pe = ivec2(p.x, base + e);
    po = ivec2(p.x, base + e + N / 2);
  } else {
    pe = ivec2(e, p.y);
    po = ivec2(e + N / 2, p.y);
  }
  float a = 2.0 * PI * float(i & (uSub - 1)) / float(uSub);
  vec2 tw = vec2(cos(a), sin(a));
  vec4 e0 = texelFetch(uIn0, pe, 0), o0 = texelFetch(uIn0, po, 0);
  vec4 e1 = texelFetch(uIn1, pe, 0), o1 = texelFetch(uIn1, po, 0);
  out0 = vec4(e0.xy + cmul(tw, o0.xy), e0.zw + cmul(tw, o0.zw));
  out1 = vec4(e1.xy + cmul(tw, o1.xy), e1.zw + cmul(tw, o1.zw));
}
`;

  const assembleFrag =
    common +
    /* glsl */ `
uniform highp sampler2D uIn0;
uniform highp sampler2D uIn1;
uniform sampler2D uPrev;
uniform int uCascade;
uniform float uLambda;
uniform float uDt;
uniform float uFoamRecovery;
layout(location = 0) out vec4 outDisp;
layout(location = 1) out vec4 outSlope;

void main() {
  ivec2 id = ivec2(gl_FragCoord.xy);
  ivec2 p = id + ivec2(0, uCascade * N);
  float s = ((id.x + id.y) & 1) == 0 ? 1.0 : -1.0;
  vec4 a = texelFetch(uIn0, p, 0) * s;
  vec4 b = texelFetch(uIn1, p, 0) * s;
  float dxx = uLambda * b.z, dzz = uLambda * b.w, dxz = uLambda * a.w;
  float jac = (1.0 + dxx) * (1.0 + dzz) - dxz * dxz;
  vec2 slope = b.xy / max(vec2(1.0 + dxx, 1.0 + dzz), vec2(0.2));
  float prev = texelFetch(uPrev, id, 0).w;
  float turb = min(jac, prev + uDt * uFoamRecovery / max(jac, 0.5));
  outDisp = vec4(uLambda * a.x, a.z, uLambda * a.y, turb);
  outSlope = vec4(slope, slope * slope);
}
`;

  return { initFrag, evolveFrag, fftFrag, assembleFrag };
}

function jonswapParams(windSpeed: number, fetchKm: number) {
  const fetch = fetchKm * 1000;
  const ws = Math.max(1.0, windSpeed);
  return {
    alpha: 0.076 * Math.pow((G * fetch) / (ws * ws), -0.22),
    peakOmega: 22 * Math.pow((ws * fetch) / (G * G), -0.33),
  };
}

interface SimStateParams {
  windSpeed: number;
  windDirection: number;
  fetchKm: number;
  spreadBlend: number;
  windSwell: number;
  gamma: number;
  shortWavesFade: number;
  capillaryFade: number;
  waveScale: number;
  swellScale: number;
  swellWindSpeed: number;
  swellDirection: number;
  swellFetchKm: number;
  swellSwell: number;
  choppiness: number;
  foamRecovery: number;
}

class UltraOceanSim {
  public readonly n: number;
  public readonly logN: number;
  public readonly lengths = CASCADE_LENGTHS;
  public readonly params: SimStateParams = {
    windSpeed: 9,
    windDirection: 20,
    fetchKm: 120,
    spreadBlend: 0.85,
    windSwell: 0.25,
    gamma: 3.3,
    shortWavesFade: 0.04,
    capillaryFade: 0.08,
    waveScale: 0.9,
    swellScale: 0.65,
    swellWindSpeed: 7,
    swellDirection: 38,
    swellFetchKm: 900,
    swellSwell: 1.0,
    choppiness: 0.8,
    foamRecovery: 0.68,
  };
  public displacement: THREE.Texture[];
  public slope: THREE.Texture[];

  private renderer: THREE.WebGLRenderer;
  private h0RT: THREE.WebGLRenderTarget;
  private ping: THREE.WebGLRenderTarget;
  private pong: THREE.WebGLRenderTarget;
  private out: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget][];
  private initMat: THREE.RawShaderMaterial;
  private evolveMat: THREE.RawShaderMaterial;
  private fftMat: THREE.RawShaderMaterial;
  private assembleMat: THREE.RawShaderMaterial;
  private quad: FullscreenQuad;
  private time = 0;
  private dirty = true;
  private parity = 0;
  private lastBakedWind = -999;
  private lastBakedDir = -999;
  private lastBakedWaveScale = -999;
  private scratchClearColor = new THREE.Color();

  constructor(renderer: THREE.WebGLRenderer, n: number) {
    this.renderer = renderer;
    this.n = n;
    this.logN = Math.round(Math.log2(n));

    const fftOpts: THREE.RenderTargetOptions = {
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      generateMipmaps: false,
    };
    const atlasH = n * CASCADE_LENGTHS.length;
    this.h0RT = new THREE.WebGLRenderTarget(n, atlasH, fftOpts);

    const halfOpts: THREE.RenderTargetOptions = {
      ...fftOpts,
      type: THREE.HalfFloatType,
      count: 2,
    };
    this.ping = new THREE.WebGLRenderTarget(n, atlasH, halfOpts);
    this.pong = new THREE.WebGLRenderTarget(n, atlasH, halfOpts);

    const outOpts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      generateMipmaps: true,
      anisotropy: renderer.capabilities.getMaxAnisotropy(),
      depthBuffer: false,
      count: 2,
    };
    this.out = CASCADE_LENGTHS.map(() => [
      new THREE.WebGLRenderTarget(n, n, outOpts),
      new THREE.WebGLRenderTarget(n, n, outOpts),
    ]);

    const prevRt = renderer.getRenderTarget();
    const prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.scratchClearColor);
    renderer.setClearColor(0x000000, 1);
    for (const pair of this.out) {
      for (const rt of pair) {
        renderer.setRenderTarget(rt);
        renderer.clear(true, false, false);
      }
    }
    renderer.setClearColor(this.scratchClearColor, prevAlpha);
    renderer.setRenderTarget(prevRt);

    const shaders = makeSimShaders(n);
    const lengths = new THREE.Vector4(...CASCADE_LENGTHS);

    this.initMat = rawPass(shaders.initFrag, {
      uSpecA: { value: [new THREE.Vector4(), new THREE.Vector4()] },
      uSpecB: { value: [new THREE.Vector4(), new THREE.Vector4()] },
      uLength: { value: lengths },
      uCut: {
        value: new THREE.Vector4(
          ...CASCADE_LENGTHS.slice(1).map((L) => ((2 * Math.PI) / L) * 6),
          0,
        ),
      },
      uCapFade: { value: 0 },
      uSeed: { value: 1337 },
    });
    this.evolveMat = rawPass(shaders.evolveFrag, {
      uH0: { value: this.h0RT.texture },
      uLength: { value: lengths },
      uTime: { value: 0 },
    });
    this.fftMat = rawPass(shaders.fftFrag, {
      uIn0: { value: null },
      uIn1: { value: null },
      uSub: { value: 2 },
      uVertical: { value: 0 },
    });
    this.assembleMat = rawPass(shaders.assembleFrag, {
      uIn0: { value: null },
      uIn1: { value: null },
      uPrev: { value: null },
      uCascade: { value: 0 },
      uLambda: { value: 1 },
      uDt: { value: 0 },
      uFoamRecovery: { value: 0.45 },
    });

    this.quad = new FullscreenQuad(this.initMat);
    this.displacement = this.out.map((p) => p[0].textures[0]);
    this.slope = this.out.map((p) => p[0].textures[1]);
  }

  public syncWeather(wp: UltraOceanWeatherParams): void {
    this.params.windSpeed = wp.windSpeed;
    this.params.windDirection = wp.windDirection;
    this.params.waveScale = wp.waveScale;
    this.params.swellScale = wp.swellScale;
    this.params.swellWindSpeed = wp.swellWindSpeed;
    this.params.swellDirection = wp.swellDirection;
    this.params.choppiness = wp.choppiness;

    if (
      Math.abs(wp.windSpeed - this.lastBakedWind) > 0.45 ||
      Math.abs(wp.windDirection - this.lastBakedDir) > 3.5 ||
      Math.abs(wp.waveScale - this.lastBakedWaveScale) > 0.06
    ) {
      this.dirty = true;
    }
  }

  private updateSpectrum(): void {
    const p = this.params;
    const u = this.initMat.uniforms;
    const wind = jonswapParams(p.windSpeed, p.fetchKm);
    const swell = jonswapParams(p.swellWindSpeed, p.swellFetchKm);
    const rad = THREE.MathUtils.degToRad;
    (u.uSpecA.value as THREE.Vector4[])[0].set(
      p.waveScale,
      rad(p.windDirection),
      p.spreadBlend,
      p.windSwell,
    );
    (u.uSpecB.value as THREE.Vector4[])[0].set(
      wind.alpha,
      wind.peakOmega,
      p.gamma,
      p.shortWavesFade,
    );
    (u.uSpecA.value as THREE.Vector4[])[1].set(
      p.swellScale * p.waveScale,
      rad(p.swellDirection),
      1,
      p.swellSwell,
    );
    (u.uSpecB.value as THREE.Vector4[])[1].set(
      swell.alpha,
      swell.peakOmega,
      p.gamma,
      p.shortWavesFade,
    );
    u.uCapFade.value = p.capillaryFade;
    this.quad.material = this.initMat;
    this.quad.render(this.renderer, this.h0RT);
    this.lastBakedWind = p.windSpeed;
    this.lastBakedDir = p.windDirection;
    this.lastBakedWaveScale = p.waveScale;
    this.dirty = false;
  }

  public update(dt: number): void {
    const r = this.renderer;
    const prevRt = r.getRenderTarget();
    const prevAutoClear = r.autoClear;
    r.autoClear = false;

    if (this.dirty) {
      this.updateSpectrum();
    }

    this.time = (this.time + dt) % LOOP;
    const q = this.quad;
    this.evolveMat.uniforms.uTime.value = this.time;
    q.material = this.evolveMat;
    q.render(r, this.ping);

    let src = this.ping;
    let dst = this.pong;
    const fu = this.fftMat.uniforms;
    q.material = this.fftMat;
    for (let dir = 0; dir < 2; dir++) {
      fu.uVertical.value = dir;
      for (let s = 1; s <= this.logN; s++) {
        fu.uSub.value = 1 << s;
        fu.uIn0.value = src.textures[0];
        fu.uIn1.value = src.textures[1];
        q.render(r, dst);
        [src, dst] = [dst, src];
      }
    }

    const au = this.assembleMat.uniforms;
    au.uIn0.value = src.textures[0];
    au.uIn1.value = src.textures[1];
    au.uLambda.value = this.params.choppiness;
    au.uDt.value = dt;
    au.uFoamRecovery.value = this.params.foamRecovery;
    q.material = this.assembleMat;
    const next = this.parity ^ 1;
    for (let c = 0; c < this.out.length; c++) {
      au.uCascade.value = c;
      au.uPrev.value = this.out[c][this.parity].textures[0];
      q.render(r, this.out[c][next]);
      this.displacement[c] = this.out[c][next].textures[0];
      this.slope[c] = this.out[c][next].textures[1];
    }
    this.parity = next;

    r.autoClear = prevAutoClear;
    r.setRenderTarget(prevRt);
  }

  public dispose(): void {
    this.h0RT.dispose();
    this.ping.dispose();
    this.pong.dispose();
    for (const pair of this.out) {
      pair[0].dispose();
      pair[1].dispose();
    }
    this.initMat.dispose();
    this.evolveMat.dispose();
    this.fftMat.dispose();
    this.assembleMat.dispose();
  }
}

const HIGH_CAMERA = 60;
const INNER = 1;
const OUTER = 1400;
const SKIRT = 1750;

function buildPolarGrid(angular: number): THREE.BufferGeometry {
  const q = 1 + (2 * Math.PI) / angular;
  const radii: number[] = [];
  for (let r = INNER / 16; r < INNER * 0.99; r *= 1.12) radii.push(r);
  for (let r = INNER; r < OUTER; r *= q) radii.push(r);
  radii.push(SKIRT);

  const verts = new Float32Array((1 + radii.length * angular) * 3);
  let v = 3;
  for (const r of radii) {
    for (let a = 0; a < angular; a++) {
      const t = (a / angular) * Math.PI * 2;
      verts[v++] = Math.cos(t) * r;
      verts[v++] = 0;
      verts[v++] = Math.sin(t) * r;
    }
  }

  const idx: number[] = [];
  for (let a = 0; a < angular; a++) idx.push(0, 1 + ((a + 1) % angular), 1 + a);
  for (let ring = 0; ring < radii.length - 1; ring++) {
    const i0 = 1 + ring * angular;
    const i1 = i0 + angular;
    for (let a = 0; a < angular; a++) {
      const b = (a + 1) % angular;
      idx.push(i0 + a, i0 + b, i1 + a, i0 + b, i1 + b, i1 + a);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  return geo;
}

function makeSurfaceVert(nTex: number): string {
  return /* glsl */ `
#define N_TEX ${nTex.toFixed(1)}
uniform sampler2D uDisp0, uDisp1, uDisp2;
uniform sampler2D uSlope0, uSlope1, uSlope2, uSlope3;
uniform vec4 uLength;
uniform vec2 uOffset;
uniform float uGridScale;
uniform float uCellStep;
uniform float uWind;

out vec3 vWorld;
out vec2 vXZ;
out float vUnresolved;

vec3 waterDisplacement(vec2 xz, vec3 lod) {
  return textureLod(uDisp0, xz / uLength.x, max(lod.x, 0.0)).xyz
       + textureLod(uDisp1, xz / uLength.y, max(lod.y, 0.0)).xyz
       + textureLod(uDisp2, xz / uLength.z, max(lod.z, 0.0)).xyz;
}

void main() {
  vec2 local = position.xz;
  float r = length(local);
  float scale = r > ${OUTER.toFixed(1)} ? 1.0 : uGridScale;
  vec2 worldBase = cameraPosition.xz + local * scale;
  vec2 xz = worldBase + uOffset;
  float cell = max(r, ${INNER.toFixed(1)}) * uCellStep * scale;
  vec3 d = waterDisplacement(xz, log2(cell * N_TEX / uLength.xyz) + 1.0);
  // Gently taper extreme crests in the far field to keep horizon clean
  float farFade = 1.0 - smoothstep(420.0, 1400.0, r * scale) * 0.55;
  d *= farFade;

  vec4 m0 = textureLod(uSlope0, vec2(0.5), 8.0);
  vec4 m1 = textureLod(uSlope1, vec2(0.5), 8.0);
  vec4 m2 = textureLod(uSlope2, vec2(0.5), 8.0);
  vec4 m3 = textureLod(uSlope3, vec2(0.5), 8.0);
  vUnresolved = max(
    0.003 + 0.00512 * uWind - (m0.z + m0.w + m1.z + m1.w + m2.z + m2.w + m3.z + m3.w),
    0.0
  );
  vXZ = xz;
  vWorld = vec3(worldBase.x + d.x, d.y, worldBase.y + d.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;
}

const SURFACE_FRAG = /* glsl */ `
precision highp float;
#define PI 3.14159265359

uniform sampler2D uDisp0, uDisp1, uDisp2;
uniform sampler2D uSlope0, uSlope1, uSlope2, uSlope3;
uniform sampler2D uFoamTex;
uniform vec4 uLength;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyZenith;
uniform float uShoalMix;
uniform float uSquallMix;
uniform float uFogDensity;
uniform float uExposure;
uniform vec4 uSSS;
uniform vec4 uFoam;
uniform vec4 uOptics;
uniform float uGlint;
uniform mat4 uBoatInvMatrix;
uniform vec3 uBoatHull;

in vec3 vWorld;
in vec2 vXZ;
in float vUnresolved;
out vec4 fragColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + 1.0), u.x),
    u.y
  );
}

float glslHullHalfWidth(float t, float beam) {
  float tc = clamp(t, 0.001, 0.999);
  float widthFactor = tc < 0.52
    ? pow(max(sin((tc / 0.52) * 1.5707963), 0.0001), 0.76)
    : 1.0 - pow(max((tc - 0.52) / 0.48, 0.0001), 1.75) * 0.34;
  float bowFlare = tc < 0.25 ? (0.25 - tc) * 0.32 : 0.0;
  return (beam * 0.5) * widthFactor * (1.0 + bowFlare);
}

float poisson(float lam, float u) {
  if (lam > 6.0) return max(0.0, lam + sqrt(lam) * log(u / (1.0 - u)) / 1.702);
  float p = exp(-lam), F = p, n = 0.0;
  for (int k = 0; k < 14; k++) {
    if (u <= F) break;
    n += 1.0;
    p *= lam / n;
    F += p;
  }
  return n;
}

vec3 skyAnalytical(vec3 dir, float rough) {
  float y = max(dir.y, 0.0);
  float grad = clamp(pow(y, 0.68) * 1.25, 0.0, 1.0);
  vec3 skyCol = mix(uSkyHorizon, uSkyZenith, grad);
  // Subtle solar forward scatter halo in sky reflection
  float sunCos = max(dot(normalize(dir), uSunDir), 0.0);
  float halo = pow(sunCos, mix(18.0, 3.0, clamp(rough * 3.0, 0.0, 1.0))) * 0.28 * (1.0 - uSquallMix * 0.8);
  return skyCol + uSunColor * halo;
}

vec3 ultraRRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

vec3 ultraAcesFilmic(vec3 color, float exposure) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  const mat3 ACESOutputMat = mat3(
    vec3( 1.60475, -0.10208, -0.00327),
    vec3(-0.53108,  1.10813, -0.07276),
    vec3(-0.07367, -0.00605,  1.07602)
  );
  color *= exposure / 0.6;
  color = ACESInputMat * color;
  color = ultraRRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}

vec3 ultraLinearToSrgb(vec3 rgb) {
  return mix(
    pow(max(rgb, vec3(0.0)), vec3(0.41666)) * 1.055 - vec3(0.055),
    rgb * 12.92,
    vec3(lessThanEqual(rgb, vec3(0.0031308)))
  );
}

void main() {
  // Per-pixel dry hull interior exclusion (identical footprint to Standard ocean)
  vec3 bPos = (uBoatInvMatrix * vec4(vWorld, 1.0)).xyz;
  float bt = bPos.z / max(1.0, uBoatHull.x) + 0.5;
  float hullHw = glslHullHalfWidth(bt, uBoatHull.y);
  if (
    bt > 0.28 && bt < 0.87 &&
    abs(bPos.x) < hullHw * 0.44 &&
    bPos.y < 0.32 * uBoatHull.z &&
    bPos.y > -0.02 * uBoatHull.z
  ) {
    discard;
  }

  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 1e-4);

  // 4-cascade LEAN slopes + second moments
  vec4 s0 = texture(uSlope0, vXZ / uLength.x);
  vec4 s1 = texture(uSlope1, vXZ / uLength.y);
  vec4 s2 = texture(uSlope2, vXZ / uLength.z);
  vec4 s3 = texture(uSlope3, vXZ / uLength.w);

  // Wind slicks modulate capillary cascades
  float slick = smoothstep(0.3, 0.7, vnoise(vXZ * 0.006 + uTime * 0.01));
  float sl2 = mix(0.75, 1.0, slick);
  float sl3 = mix(0.4, 1.0, slick);
  s2.xy *= sl2; s2.zw *= sl2 * sl2;
  s3.xy *= sl3; s3.zw *= sl3 * sl3;

  vec2 slope = s0.xy + s1.xy + s2.xy + s3.xy;
  vec2 variance = max(s0.zw - s0.xy * s0.xy, 0.0)
                + max(s1.zw - s1.xy * s1.xy, 0.0)
                + max(s2.zw - s2.xy * s2.xy, 0.0)
                + max(s3.zw - s3.xy * s3.xy, 0.0);

  vec3 Nrm = normalize(vec3(-slope.x, 1.0, -slope.y));

  // Kaplanyan geometric specular AA
  vec3 dndx = dFdx(Nrm), dndy = dFdy(Nrm);
  float geoVar = min(0.25 * (dot(dndx, dndx) + dot(dndy, dndy)), 0.18);
  float alpha2 = uOptics.x * uOptics.x + vUnresolved * sl3 * sl3 + variance.x + variance.y + geoVar;
  float alpha = sqrt(alpha2);

  float NoV = max(dot(Nrm, V), 1e-4);
  float NoL = dot(Nrm, uSunDir);
  float sunElev = smoothstep(-0.04, 0.22, uSunDir.y);

  // Jacobian whitecap turbulence + bow waterline collar
  float jac0 = texture(uDisp0, vXZ / uLength.x).w;
  float jac1 = texture(uDisp1, vXZ / uLength.y).w;
  float jac2 = texture(uDisp2, vXZ / uLength.z).w;
  float jac = jac0 + jac1 + jac2 - 2.0;
  float foam = clamp((uFoam.x - jac) * uFoam.y, 0.0, 1.0);

  float collarDist = abs(bPos.x) - hullHw;
  if (bt > -0.02 && bt < 1.08 && collarDist >= -0.04 && collarDist < 0.62 && abs(bPos.y - 0.08 * uBoatHull.z) < 0.44) {
    float falloff = 1.0 - smoothstep(0.0, 0.62, max(0.0, collarDist));
    float bowBoost = smoothstep(0.38, 0.0, bt) * 0.45 + (bt > 0.78 ? 0.36 : 0.22);
    foam = max(foam, clamp(falloff * bowBoost * 0.9, 0.0, 0.75));
  }

  // Deep-ocean & coastal-shoal scatter + Atlas SSS crest translucency
  vec3 ambient = uSkyZenith * 0.42 + uSkyHorizon * 0.58;
  vec3 sun = uSunColor * (0.35 + 0.95 * sunElev) * (1.0 - uSquallMix * 0.58);
  vec3 deepScatter = vec3(0.008, 0.055, 0.135);
  vec3 coastalScatter = vec3(0.024, 0.24, 0.29);
  vec3 scatterCol = mix(deepScatter, coastalScatter, uShoalMix * 0.72);
  vec3 inscatter = scatterCol * (ambient * 0.75 + sun * (0.28 + 0.52 * max(uSunDir.y, 0.0)));

  float h = max(vWorld.y, 0.0);
  float k1 = uSSS.x * h * pow(clamp(dot(uSunDir, -V), 0.0, 1.0), 4.0) * pow(0.5 - 0.5 * NoL, 3.0);
  float k2 = uSSS.y * pow(NoV, 2.0);
  vec3 sss = (k1 + k2) * scatterCol * sun * 1.4 + uSSS.z * max(NoL, 0.0) * scatterCol * sun;
  vec3 body = inscatter + sss * (1.0 - uSquallMix * 0.5);

  // Lagarde roughness-aware Fresnel
  const float F0 = 0.02;
  float F90 = max(1.0 - 0.7 * sqrt(alpha), F0);
  float F = F0 + (F90 - F0) * pow(1.0 - NoV, 5.0);

  vec3 R = reflect(-V, Nrm);
  R.y = abs(R.y);
  vec3 refl = skyAnalytical(R, alpha) * (1.0 - 0.25 * uSquallMix);

  // GGX sun specular + Poisson sub-pixel glitter facets
  float aS = max(alpha, 0.015);
  float aS2 = aS * aS;
  vec3 H = normalize(uSunDir + V);
  float NoH = max(dot(Nrm, H), 0.0);
  float nl = max(NoL, 0.0);
  float dd = NoH * NoH * (aS2 - 1.0) + 1.0;
  float D = aS2 / (PI * dd * dd);
  float vis = 0.5 / (nl * sqrt(NoV * NoV * (1.0 - aS2) + aS2) + NoV * sqrt(nl * nl * (1.0 - aS2) + aS2) + 1e-5);
  float Fs = F0 + (1.0 - F0) * pow(1.0 - max(dot(V, H), 0.0), 5.0);
  vec3 spec = sun * (PI * D * vis * Fs * nl);

  vec2 fwXZ = fwidth(vXZ);
  if (uGlint > 0.0 && dot(spec, vec3(1.0)) > 0.02) {
    const float FACETS = 2e4;
    float lf = log2(max(max(fwXZ.x, fwXZ.y), 1e-3)) + 1.0;
    float l0 = floor(lf);
    float per = FACETS * D * NoH * 6.8e-5 / (4.0 * max(dot(V, H), 0.05));
    float m = 0.0;
    for (int j = 0; j < 2; j++) {
      float l = l0 + float(j), sz = exp2(l);
      vec2 cell = floor(vXZ / sz);
      float lam = per * sz * sz;
      float tt = uTime * 3.0 + hash12(cell + l * 17.17) * 64.0, it = floor(tt);
      float n0 = poisson(lam, clamp(hash12(cell * 1.31 + it * 3.7), 1e-4, 0.9999));
      float n1 = poisson(lam, clamp(hash12(cell * 1.31 + (it + 1.0) * 3.7), 1e-4, 0.9999));
      m += (j == 0 ? 1.0 - (lf - l0) : lf - l0) * min(mix(n0, n1, smoothstep(0.0, 1.0, tt - it)) / max(lam, 1e-4), 30.0);
    }
    spec *= mix(1.0, m, uGlint * smoothstep(4.0, 30.0, dist));
  }

  vec3 col = mix(body, refl, F) + spec;

  // Voronoi lace & cauliflower billow foam
  if (foam > 0.001) {
    vec4 tf = texture(uFoamTex, vXZ * 0.11);
    float pat = tf.r * 0.65 + texture(uFoamTex, vXZ * 0.031 + 0.37).r * 0.35;
    float cover = smoothstep(1.05 - foam, 1.3 - foam, pat) * sqrt(foam);
    if (cover > 0.001) {
      float fh = tf.g;
      vec2 fg = (tf.ba - 0.5) * 64.0 * 0.11;
      vec3 fN = normalize(Nrm - vec3(fg.x, 0.0, fg.y) * (0.03 + 0.12 * foam));
      float fl = dot(fN, uSunDir);
      float ao = mix(0.45, 1.0, smoothstep(0.15, 0.75, fh));
      float solid = smoothstep(0.2, 0.9, foam * (0.55 + 0.7 * fh));
      vec3 foamTint = mix(vec3(0.55, 0.76, 0.80), vec3(0.93, 0.94, 0.92), max(solid, smoothstep(0.3, 0.9, pat) * 0.6));
      vec3 lit = sun * (0.15 + 0.85 * clamp(fl * 0.8 + 0.2, 0.0, 1.0)) * mix(ao, 1.0, 0.4) + ambient * 0.7 * ao;
      lit += sun * pow(clamp(dot(uSunDir, -V), 0.0, 1.0), 4.0) * 0.35 * (1.0 - solid);
      vec3 foamCol = uFoam.w * foamTint * lit;
      foamCol += sun * pow(max(dot(fN, H), 0.0), 90.0) * 0.45 * smoothstep(0.55, 0.85, fh) * solid;
      col = mix(col, foamCol, cover * mix(0.8, 1.0, solid));
    }
  }

  // Exponential distance fog matching THREE.FogExp2(uSkyHorizon, uFogDensity)
  float fogArg = dist * uFogDensity;
  float fogFactor = 1.0 - exp(-fogArg * fogArg);
  col = mix(col, uSkyHorizon, clamp(fogFactor, 0.0, 1.0));

  col = ultraAcesFilmic(col, uExposure);
  col = ultraLinearToSrgb(col);
  fragColor = vec4(col, 1.0);
}
`;

export class UltraWaterOcean {
  public readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private sim: UltraOceanSim;
  private foamRT: THREE.WebGLRenderTarget;
  private grids: [THREE.BufferGeometry, THREE.BufferGeometry];
  private material: THREE.ShaderMaterial;
  private angular: number;
  private elapsed = 0;

  constructor(renderer: THREE.WebGLRenderer, isSoftwareGl: boolean) {
    if (!isWebGL2UltraWaterSupported(renderer)) {
      throw new Error('Ultra Water requires WebGL2 with EXT_color_buffer_float.');
    }
    const n = isSoftwareGl ? 128 : 256;
    const foamSize = isSoftwareGl ? 256 : 512;
    this.angular = isSoftwareGl ? 192 : 384;

    this.foamRT = bakeFoamTarget(renderer, foamSize);
    this.sim = new UltraOceanSim(renderer, n);

    const uniforms: Record<string, THREE.IUniform> = {
      uDisp0: { value: this.sim.displacement[0] },
      uDisp1: { value: this.sim.displacement[1] },
      uDisp2: { value: this.sim.displacement[2] },
      uSlope0: { value: this.sim.slope[0] },
      uSlope1: { value: this.sim.slope[1] },
      uSlope2: { value: this.sim.slope[2] },
      uSlope3: { value: this.sim.slope[3] },
      uFoamTex: { value: this.foamRT.texture },
      uLength: { value: new THREE.Vector4(...this.sim.lengths) },
      uOffset: { value: new THREE.Vector2(0, 0) },
      uGridScale: { value: 1 },
      uCellStep: { value: (2 * Math.PI) / this.angular },
      uWind: { value: 9 },
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.65, -0.5).normalize() },
      uSunColor: { value: new THREE.Color(0xfff1d6) },
      uSkyHorizon: { value: new THREE.Color(0x9bd2ea) },
      uSkyZenith: { value: new THREE.Color(0x1f5c94) },
      uShoalMix: { value: 0.35 },
      uSquallMix: { value: 0.15 },
      uFogDensity: { value: 0.00058 },
      uExposure: { value: 0.52 },
      uSSS: { value: new THREE.Vector4(1.6, 0.08, 0.06, 0) },
      uFoam: { value: new THREE.Vector4(0.18, 1.35, 0.2, 0.78) },
      uOptics: { value: new THREE.Vector4(0.022, 0.06, 0.04, 0) },
      uGlint: { value: 0.65 },
      uBoatInvMatrix: { value: new THREE.Matrix4() },
      uBoatHull: { value: new THREE.Vector3(5.9, 2.38, 1.0) },
    };

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: makeSurfaceVert(n),
      fragmentShader: SURFACE_FRAG,
      uniforms,
      side: THREE.DoubleSide,
    });

    this.grids = [buildPolarGrid(this.angular), buildPolarGrid(Math.floor(this.angular / 2))];
    this.mesh = new THREE.Mesh(this.grids[0], this.material);
    this.mesh.frustumCulled = false;
  }

  public update(
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    dt: number,
    weatherParams: UltraOceanWeatherParams,
    env: {
      offsetX: number;
      offsetZ: number;
      sunDir: THREE.Vector3;
      sunColor: THREE.Color;
      skyHorizon: THREE.Color;
      skyZenith: THREE.Color;
      fogDensity: number;
      exposure: number;
      boatInvMatrix: THREE.Matrix4;
      boatHull: THREE.Vector3;
    },
  ): void {
    this.elapsed += dt;
    this.sim.syncWeather(weatherParams);
    this.sim.update(dt);

    const u = this.material.uniforms;
    u.uDisp0.value = this.sim.displacement[0];
    u.uDisp1.value = this.sim.displacement[1];
    u.uDisp2.value = this.sim.displacement[2];
    u.uSlope0.value = this.sim.slope[0];
    u.uSlope1.value = this.sim.slope[1];
    u.uSlope2.value = this.sim.slope[2];
    u.uSlope3.value = this.sim.slope[3];

    u.uWind.value = weatherParams.windSpeed;
    u.uTime.value = this.elapsed;
    (u.uOffset.value as THREE.Vector2).set(env.offsetX, env.offsetZ);
    u.uGridScale.value = Math.max(1, Math.abs(camera.position.y) / 2);

    const coarse =
      Math.abs(camera.position.y) >
      HIGH_CAMERA * (this.mesh.geometry === this.grids[1] ? 0.85 : 1.15)
        ? 1
        : 0;
    this.mesh.geometry = this.grids[coarse];
    u.uCellStep.value = (2 * Math.PI) / (this.angular >> coarse);

    (u.uSunDir.value as THREE.Vector3).copy(env.sunDir);
    (u.uSunColor.value as THREE.Color).copy(env.sunColor);
    (u.uSkyHorizon.value as THREE.Color).copy(env.skyHorizon);
    (u.uSkyZenith.value as THREE.Color).copy(env.skyZenith);
    u.uShoalMix.value = weatherParams.shoalMix;
    u.uSquallMix.value = weatherParams.squallMix;
    u.uFogDensity.value = env.fogDensity;
    u.uExposure.value = env.exposure;
    (u.uBoatInvMatrix.value as THREE.Matrix4).copy(env.boatInvMatrix);
    (u.uBoatHull.value as THREE.Vector3).copy(env.boatHull);
  }

  public dispose(): void {
    this.sim.dispose();
    this.foamRT.dispose();
    this.grids[0].dispose();
    this.grids[1].dispose();
    this.material.dispose();
  }
}

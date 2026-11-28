import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { AutopilotMode } from '../types/sailing';
import type { MarineInstrumentData } from '../sim/instrumentData';

interface SailingInstrumentPanelProps {
  data: MarineInstrumentData;
  onSteerStep: (degrees: number) => void;
  onSetMainsheet: (percent: number) => void;
  onSetJibsheet: (percent: number) => void;
  onSetAutopilot: (mode: AutopilotMode) => void;
}

interface DisplayValues {
  heading: number;
  apparentAngle: number;
  trueAngle: number;
  apparentWind: number;
  trueWind: number;
  speed: number;
  sog: number;
  vmg: number;
  bearing: number;
  targetUpwindAngle: number;
  depth: number;
  battery: number;
  voltage: number;
  solar: number;
  heel: number;
  pitch: number;
}

const WIDTH = 720;
const HEIGHT = 414;
const TAU = Math.PI * 2;

function lerpAngle(current: number, target: number, alpha: number): number {
  const delta = ((target - current + 540) % 360) - 180;
  return current + delta * alpha;
}

function polar(angle: number, radius: number): [number, number] {
  const a = angle - Math.PI / 2;
  return [Math.cos(a) * radius, Math.sin(a) * radius];
}

function drawInstrumentFace(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const face = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  face.addColorStop(0, '#183249');
  face.addColorStop(1, '#07131f');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#71889a';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawSparkline(
  ctx: CanvasRenderingContext2D,
  values: number[],
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  if (values.length < 2) return;
  const min = Math.min(...values);
  const span = Math.max(0.35, Math.max(...values) - min);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((value, index) => {
    const px = x + (index / (values.length - 1)) * width;
    const py = y + height - ((value - min) / span) * height;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  ctx.fillStyle = 'rgba(8, 20, 32, 0.92)';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(113, 136, 154, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawCanvas(
  ctx: CanvasRenderingContext2D,
  values: DisplayValues,
  data: MarineInstrumentData,
  speedHistory: number[],
  depthHistory: number[],
  windTrendKts: number,
  now: number,
): void {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  background.addColorStop(0, '#10283b');
  background.addColorStop(1, '#07131d');
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(0, 0, WIDTH, HEIGHT, 16);
  ctx.fill();
  ctx.strokeStyle = '#496274';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Instrument nameplate
  ctx.fillStyle = '#f2eee3';
  ctx.font = '600 19px system-ui, sans-serif';
  ctx.fillText('MERIDIAN  /  SAILING INSTRUMENTS', 22, 31);
  ctx.fillStyle = data.sailing.instrumentsPowered ? '#6ee7c1' : '#fbbf24';
  ctx.font = '600 12px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(data.sailing.instrumentsPowered ? '12V  ONLINE' : 'INSTRUMENTS OFF', WIDTH - 22, 30);
  ctx.textAlign = 'left';

  // Apparent / true wind steering rose
  drawCard(ctx, 14, 44, 283, 214);
  const wx = 155;
  const wy = 151;
  const wr = 83;
  drawInstrumentFace(ctx, wx, wy, wr);
  ctx.save();
  ctx.translate(wx, wy);
  ctx.fillStyle = 'rgba(248, 113, 113, 0.24)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, wr - 7, -Math.PI / 2 - (data.sailing.noGoAngleDeg * Math.PI) / 180,
    -Math.PI / 2 + (data.sailing.noGoAngleDeg * Math.PI) / 180);
  ctx.closePath();
  ctx.fill();

  for (let deg = 0; deg < 360; deg += 15) {
    const major = deg % 45 === 0;
    const [outerX, outerY] = polar((deg * Math.PI) / 180, wr - 5);
    const [innerX, innerY] = polar((deg * Math.PI) / 180, wr - (major ? 17 : 11));
    ctx.strokeStyle = major ? '#d6e0e6' : '#748b99';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(innerX, innerY);
    ctx.lineTo(outerX, outerY);
    ctx.stroke();
  }

  ctx.fillStyle = '#f3eee3';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BOW', 0, -48);
  ctx.fillStyle = '#8da4b4';
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('NO-GO', 0, -29);

  const apparentRad = (values.apparentAngle * Math.PI) / 180;
  const trueRad = (values.trueAngle * Math.PI) / 180;
  const [ax, ay] = polar(apparentRad, wr - 27);
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(ax, ay);
  ctx.stroke();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(ax, ay, 5, 0, TAU);
  ctx.fill();
  const [tx, ty] = polar(trueRad, wr - 39);
  ctx.strokeStyle = '#45d4c0';
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.setLineDash([]);
  const targetPort = polar(trueRad - (data.sailing.targetUpwindAngleDeg * Math.PI) / 180, wr - 13);
  const targetStarboard = polar(trueRad + (data.sailing.targetUpwindAngleDeg * Math.PI) / 180, wr - 13);
  ctx.fillStyle = '#a78bfa';
  for (const [targetX, targetY] of [targetPort, targetStarboard]) {
    ctx.beginPath();
    ctx.arc(targetX, targetY, 3.2, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(-7, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fbbf24';
  ctx.font = '600 11px ui-monospace, monospace';
  ctx.fillText(`APP ${Math.round(values.apparentAngle)}°  ${values.apparentWind.toFixed(1)} kt`, 25, 238);
  ctx.fillStyle = '#45d4c0';
  ctx.fillText(`TRUE ${Math.round(values.trueAngle)}°  ${values.trueWind.toFixed(1)} kt`, 160, 238);
  ctx.fillStyle = '#b5c4ce';
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText(`NO-GO ±${Math.round(data.sailing.noGoAngleDeg)}°   UPWIND TARGET ±${Math.round(values.targetUpwindAngle)}°`, 25, 253);
  ctx.textAlign = 'left';

  // Compass card, rotating beneath a fixed lubber line
  drawCard(ctx, 307, 44, 176, 214);
  const cx = 395;
  const cy = 133;
  const cr = 70;
  drawInstrumentFace(ctx, cx, cy, cr);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-values.heading * Math.PI) / 180);
  for (let d = 0; d < 360; d += 10) {
    const [ox, oy] = polar((d * Math.PI) / 180, cr - 5);
    const [ix, iy] = polar((d * Math.PI) / 180, cr - (d % 30 === 0 ? 16 : 10));
    ctx.strokeStyle = d % 30 === 0 ? '#e6e9e7' : '#91a2ac';
    ctx.lineWidth = d % 30 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.lineTo(ox, oy);
    ctx.stroke();
    if (d % 90 === 0) {
      const [lx, ly] = polar((d * Math.PI) / 180, cr - 29);
      ctx.fillStyle = d === 0 ? '#f87171' : '#e2e8f0';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(['N', 'E', 'S', 'W'][d / 90], lx, ly);
    }
  }
  const [bearingX, bearingY] = polar((values.bearing * Math.PI) / 180, cr - 2);
  ctx.fillStyle = '#45d4c0';
  ctx.beginPath();
  ctx.moveTo(bearingX, bearingY - 5);
  ctx.lineTo(bearingX + 5, bearingY);
  ctx.lineTo(bearingX, bearingY + 5);
  ctx.lineTo(bearingX - 5, bearingY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.moveTo(cx, cy - cr - 5);
  ctx.lineTo(cx - 7, cy - cr + 8);
  ctx.lineTo(cx + 7, cy - cr + 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 22px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${String(Math.round(values.heading) % 360).padStart(3, '0')}°`, cx, 226);
  ctx.fillStyle = '#8da4b4';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('HEADING  /  WAYPOINT BEARING', cx, 245);

  // Heel and pitch artificial horizon
  drawCard(ctx, 493, 44, 213, 214);
  ctx.fillStyle = '#b8c8d3';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('HEEL  /  PITCH', 508, 65);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(513, 76, 173, 105, 8);
  ctx.clip();
  ctx.translate(599.5, 128.5);
  ctx.rotate((-values.heel * Math.PI) / 180);
  const horizonShift = Math.max(-40, Math.min(40, values.pitch * 2.1));
  ctx.fillStyle = '#327291';
  ctx.fillRect(-150, -100 + horizonShift, 300, 100);
  ctx.fillStyle = '#765e43';
  ctx.fillRect(-150, horizonShift, 300, 100);
  ctx.strokeStyle = '#fff7dc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-120, horizonShift);
  ctx.lineTo(120, horizonShift);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.6)';
  ctx.lineWidth = 1;
  for (let mark = -30; mark <= 30; mark += 10) {
    ctx.beginPath();
    ctx.moveTo(mark === 0 ? -22 : -10, horizonShift - mark * 0.7);
    ctx.lineTo(mark === 0 ? 22 : 10, horizonShift - mark * 0.7);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#d6e0e6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(582, 128);
  ctx.lineTo(592, 128);
  ctx.moveTo(607, 128);
  ctx.lineTo(617, 128);
  ctx.stroke();
  ctx.fillStyle = values.heel > 0 ? '#fbbf24' : '#5eead4';
  ctx.font = 'bold 16px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.abs(Math.round(values.heel))}° ${values.heel >= 0 ? 'STBD' : 'PORT'}`, 599, 207);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(`PITCH ${Math.round(values.pitch)}°`, 599, 232);

  // Speed, depth and house bank instruments with rolling histories
  const cards = [
    { x: 14, w: 222 },
    { x: 249, w: 222 },
    { x: 484, w: 222 },
  ];
  cards.forEach(({ x, w }) => drawCard(ctx, x, 270, w, 126));

  ctx.textAlign = 'left';
  ctx.fillStyle = '#9cb0be';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('SPEED THROUGH WATER', 28, 291);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 28px ui-monospace, monospace';
  ctx.fillText(values.speed.toFixed(1), 28, 326);
  ctx.fillStyle = '#93a7b5';
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillText(`SOG  ${values.sog.toFixed(1)} kt`, 139, 324);
  ctx.fillStyle = '#45d4c0';
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText(`VMG ${values.vmg >= 0 ? '+' : ''}${values.vmg.toFixed(1)} kt  CTS ${String(Math.round(values.bearing) % 360).padStart(3, '0')}°`, 28, 343);
  drawSparkline(ctx, speedHistory, 28, 350, 193, 29, '#45d4c0');

  ctx.fillStyle = '#9cb0be';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('DEPTH BELOW TRANSDUCER', 263, 291);
  ctx.fillStyle = data.route.channelHazard ? '#fb7185' : '#f8fafc';
  ctx.font = 'bold 28px ui-monospace, monospace';
  ctx.fillText(`${values.depth.toFixed(1)} m`, 263, 326);
  ctx.fillStyle = data.route.channelHazard ? '#fb7185' : '#93a7b5';
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(data.route.channelHazard ? 'SHOAL / CHANNEL WARNING' : 'SOUNDINGS', 263, 341);
  drawSparkline(ctx, depthHistory, 263, 350, 193, 30, data.route.channelHazard ? '#fb7185' : '#fbbf24');

  const batteryPct = Math.max(0, Math.min(1, values.battery));
  ctx.fillStyle = '#9cb0be';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('HOUSE BANK  /  SOLAR', 498, 291);
  ctx.fillStyle = batteryPct < 0.2 ? '#fb7185' : '#f8fafc';
  ctx.font = 'bold 25px ui-monospace, monospace';
  ctx.fillText(`${values.voltage.toFixed(1)} V`, 498, 325);
  const dial = (x: number, y: number, progress: number, label: string, value: string, color: string) => {
    const start = Math.PI * 0.75;
    const end = start + Math.PI * 1.5;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#243a4b';
    ctx.beginPath();
    ctx.arc(x, y, 23, start, end);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 23, start, start + (end - start) * Math.max(0, Math.min(1, progress)));
    ctx.stroke();
    ctx.fillStyle = '#a8bac5';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - 31);
    ctx.fillStyle = color;
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText(value, x, y + 4);
  };
  dial(541, 362, batteryPct, 'BATTERY', `${Math.round(batteryPct * 100)}%`, batteryPct < 0.2 ? '#fb7185' : '#34d399');
  dial(649, 362, values.solar / 600, 'SOLAR', `+${Math.round(values.solar)}W`, '#fbbf24');
  ctx.fillStyle = '#91a4b2';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`LOAD −${Math.round(data.electrical.loadPower.value)} W`, 595, 391);
  ctx.textAlign = 'left';

  // Live page footer: route, true wind and sea state
  const windNorm = Math.min(1, values.trueWind / 35);
  ctx.fillStyle = 'rgba(0,0,0,.26)';
  ctx.fillRect(0, 401, WIDTH, 13);
  ctx.fillStyle = windNorm > 0.8 ? '#fda4af' : '#a6bac6';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${data.route.fromName} → ${data.route.toName}`, 20, 411);
  ctx.textAlign = 'right';
  ctx.fillText(`TWS ${values.trueWind.toFixed(1)} kt  ΔW ${windTrendKts >= 0 ? '+' : ''}${windTrendKts.toFixed(1)}/6s  SEA ${data.environment.water.waveHeight.value.toFixed(1)} m   AP ${data.sailing.autopilotMode.toUpperCase()}`, WIDTH - 20, 411);
  ctx.textAlign = 'left';

  if (!data.sailing.instrumentsPowered) {
    ctx.fillStyle = 'rgba(3, 8, 13, 0.82)';
    ctx.beginPath();
    ctx.roundRect(8, 38, WIDTH - 16, HEIGHT - 46, 12);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillText('INSTRUMENT BREAKER OPEN', WIDTH / 2, HEIGHT / 2 - 6);
    ctx.fillStyle = '#a8bac5';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('12V DC PANEL  /  DIGITAL READOUTS OFF', WIDTH / 2, HEIGHT / 2 + 18);
    ctx.textAlign = 'left';
  }

  // A slow amber sweep makes the repeater feel live without distracting from readings.
  const sweep = (now * 0.00018) % TAU;
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(687, 18, 3, sweep, sweep + Math.PI * 0.75);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function SailingInstrumentPanel({
  data,
  onSteerStep,
  onSetMainsheet,
  onSetJibsheet,
  onSetAutopilot,
}: SailingInstrumentPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataRef = useRef(data);
  const displayRef = useRef<DisplayValues>({
    heading: data.sailing.headingDeg,
    apparentAngle: data.sailing.apparentWindAngleDeg,
    trueAngle: (data.environment.wind.angleTrueWater.value * 180) / Math.PI,
    apparentWind: data.sailing.apparentWindSpeedKts,
    trueWind: data.sailing.trueWindSpeedKts,
    speed: data.navigation.speedThroughWater.value,
    sog: data.navigation.speedOverGround.value,
    vmg: data.navigation.velocityMadeGoodToWaypoint.value,
    bearing: data.route.bearingToWaypointDeg,
    targetUpwindAngle: data.sailing.targetUpwindAngleDeg,
    depth: data.environment.depth.belowTransducer.value,
    battery: data.electrical.batteries.house.capacity.stateOfCharge.value,
    voltage: data.electrical.batteries.house.voltage.value,
    solar: data.electrical.solar.panelPower.value,
    heel: (data.navigation.attitude.roll * 180) / Math.PI,
    pitch: (data.navigation.attitude.pitch * 180) / Math.PI,
  });
  const speedHistoryRef = useRef<number[]>([]);
  const depthHistoryRef = useRef<number[]>([]);
  const windHistoryRef = useRef<number[]>([]);
  const windTrendRef = useRef(0);
  const wheelDragRef = useRef<{ pointerId: number; lastX: number } | null>(null);
  dataRef.current = data;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    let lastTime = performance.now();
    let lastHistory = 0;
    const frameDraw = (now: number) => {
      const current = dataRef.current;
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      const alpha = 1 - Math.exp(-dt * 6.5);
      const displayed = displayRef.current;
      const target = {
        heading: current.sailing.headingDeg,
        apparentAngle: current.sailing.apparentWindAngleDeg,
        trueAngle: (current.environment.wind.angleTrueWater.value * 180) / Math.PI,
        apparentWind: current.sailing.apparentWindSpeedKts,
        trueWind: current.sailing.trueWindSpeedKts,
        speed: current.navigation.speedThroughWater.value,
        sog: current.navigation.speedOverGround.value,
        vmg: current.navigation.velocityMadeGoodToWaypoint.value,
        bearing: current.route.bearingToWaypointDeg,
        targetUpwindAngle: current.sailing.targetUpwindAngleDeg,
        depth: current.environment.depth.belowTransducer.value,
        battery: current.electrical.batteries.house.capacity.stateOfCharge.value,
        voltage: current.electrical.batteries.house.voltage.value,
        solar: current.electrical.solar.panelPower.value,
        heel: (current.navigation.attitude.roll * 180) / Math.PI,
        pitch: (current.navigation.attitude.pitch * 180) / Math.PI,
      };
      displayed.heading = lerpAngle(displayed.heading, target.heading, alpha);
      displayed.apparentAngle = lerpAngle(displayed.apparentAngle, target.apparentAngle, alpha);
      displayed.trueAngle = lerpAngle(displayed.trueAngle, target.trueAngle, alpha);
      displayed.bearing = lerpAngle(displayed.bearing, target.bearing, alpha);
      (Object.keys(target) as Array<keyof DisplayValues>).forEach((key) => {
        if (key !== 'heading' && key !== 'apparentAngle' && key !== 'trueAngle' && key !== 'bearing') {
          displayed[key] += (target[key] - displayed[key]) * alpha;
        }
      });
      if (now - lastHistory > 550) {
        lastHistory = now;
        speedHistoryRef.current.push(displayed.speed);
        depthHistoryRef.current.push(displayed.depth);
        windHistoryRef.current.push(displayed.trueWind);
        if (windHistoryRef.current.length > 12) windHistoryRef.current.shift();
        if (windHistoryRef.current.length > 1) {
          windTrendRef.current = windHistoryRef.current[windHistoryRef.current.length - 1] - windHistoryRef.current[0];
        }
        if (speedHistoryRef.current.length > 42) speedHistoryRef.current.shift();
        if (depthHistoryRef.current.length > 42) depthHistoryRef.current.shift();
      }

      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pixelWidth = Math.round(bounds.width * dpr);
      const pixelHeight = Math.round((bounds.width * HEIGHT) / WIDTH * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(pixelWidth / WIDTH, 0, 0, pixelHeight / HEIGHT, 0, 0);
      drawCanvas(
        ctx,
        displayed,
        current,
        speedHistoryRef.current,
        depthHistoryRef.current,
        windTrendRef.current,
        now,
      );
      frame = requestAnimationFrame(frameDraw);
    };
    frame = requestAnimationFrame(frameDraw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const adjustSheet = (which: 'main' | 'jib', delta: number) => {
    const value = which === 'main' ? data.sailing.mainsheetPct : data.sailing.jibsheetPct;
    const update = which === 'main' ? onSetMainsheet : onSetJibsheet;
    update(Math.max(5, Math.min(100, value + delta)));
  };

  const handleWheelPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    wheelDragRef.current = { pointerId: event.pointerId, lastX: event.clientX };
  };

  const handleWheelPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = wheelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.lastX;
    if (Math.abs(delta) >= 7) {
      onSteerStep(Math.max(-9, Math.min(9, delta * 0.28)));
      drag.lastX = event.clientX;
    }
  };

  const handleWheelPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (wheelDragRef.current?.pointerId === event.pointerId) wheelDragRef.current = null;
  };

  const batteryPct = Math.max(0, Math.min(100, data.electrical.batteries.house.capacity.stateOfCharge.value * 100));

  return (
    <section
      className="pointer-events-auto w-[min(94vw,420px)] max-h-[calc(100vh-82px)] overflow-y-auto rounded-2xl border border-slate-600/80 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-md"
      aria-label="Sailing instruments and tablet helm"
    >
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="block w-full rounded-xl"
        aria-label={`Apparent wind ${Math.round(data.sailing.apparentWindAngleDeg)} degrees, true wind ${Math.round(data.sailing.trueWindSpeedKts)} knots, heading ${Math.round(data.sailing.headingDeg)} degrees, speed ${data.navigation.speedThroughWater.value.toFixed(1)} knots, depth ${data.environment.depth.belowTransducer.value.toFixed(1)} metres.`}
        role="img"
      />

      <div className="mt-2 grid grid-cols-2 items-center gap-2">
        <div className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 p-1.5">
          <button
            type="button"
            onClick={() => onSteerStep(-3)}
            aria-label="Steer three degrees to port"
            className="min-h-11 min-w-10 rounded-lg bg-slate-800 text-sm font-semibold text-slate-100 active:bg-amber-500 active:text-slate-950"
          >
            ◀
          </button>
          <button
            type="button"
            onPointerDown={handleWheelPointerDown}
            onPointerMove={handleWheelPointerMove}
            onPointerUp={handleWheelPointerUp}
            onPointerCancel={handleWheelPointerUp}
            aria-label="Drag helm wheel to steer"
            className="relative h-[66px] w-[66px] touch-none rounded-full border-[7px] border-slate-300 bg-slate-950 shadow-[inset_0_0_0_2px_#64748b] active:border-amber-300"
          >
            <span
              className="absolute inset-0 transition-transform duration-100"
              style={{ transform: `rotate(${data.sailing.rudderAngleDeg * 4}deg)` }}
            >
              {[0, 45, 90, 135].map((angle) => (
                <span
                  key={angle}
                  className="absolute left-1/2 top-1/2 h-[5px] w-[50px] origin-center rounded-full bg-slate-300"
                  style={{ transform: `translate(-50%, -50%) rotate(${angle}deg)` }}
                />
              ))}
              <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSteerStep(3)}
            aria-label="Steer three degrees to starboard"
            className="min-h-11 min-w-10 rounded-lg bg-slate-800 text-sm font-semibold text-slate-100 active:bg-amber-500 active:text-slate-950"
          >
            ▶
          </button>
        </div>

        {([
          { key: 'main' as const, label: 'MAIN', value: data.sailing.mainsheetPct },
          { key: 'jib' as const, label: 'JIB', value: data.sailing.jibsheetPct },
        ]).map((sheet) => (
          <div key={sheet.key} className="rounded-xl border border-slate-700 bg-slate-900/80 p-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold tracking-wide text-slate-300">{sheet.label} WINCH</span>
              <span className="font-mono-tabular text-[10px] text-amber-200">{Math.round(sheet.value)}%</span>
            </div>
            <div className="mt-1 flex items-center justify-center gap-1">
              <button
                type="button"
                onClick={() => adjustSheet(sheet.key, -10)}
                aria-label={`Ease ${sheet.label.toLowerCase()} sheet`}
                className="min-h-9 min-w-9 rounded-lg bg-slate-800 text-lg text-slate-100 active:bg-sky-500 active:text-slate-950"
              >−</button>
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-amber-400/80 bg-slate-950">
                <span
                  className="absolute left-1/2 top-1/2 h-[3px] w-3 origin-left rounded bg-amber-300"
                  style={{ transform: `rotate(${-135 + sheet.value * 2.7}deg)` }}
                />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
              </div>
              <button
                type="button"
                onClick={() => adjustSheet(sheet.key, 10)}
                aria-label={`Trim ${sheet.key === 'main' ? 'mainsheet' : 'jibsheet'}`}
                className="min-h-9 min-w-9 rounded-lg bg-slate-800 text-lg text-slate-100 active:bg-amber-500 active:text-slate-950"
              >+</button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label="Autopilot controls">
        {([
          { mode: 'manual' as const, label: 'STANDBY' },
          { mode: 'windvane' as const, label: 'WIND' },
          { mode: 'compass' as const, label: 'HEADING' },
        ]).map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            aria-pressed={data.sailing.autopilotMode === mode}
            onClick={() => onSetAutopilot(mode)}
            className={`min-h-10 rounded-lg border px-2 text-[11px] font-semibold tracking-wide transition-colors ${
              data.sailing.autopilotMode === mode
                ? 'border-emerald-300 bg-emerald-400/20 text-emerald-200'
                : 'border-slate-700 bg-slate-900 text-slate-300 active:bg-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-slate-400">
        <span>{data.sailing.autopilotMode === 'windvane' ? 'WIND ANGLE LOCK' : data.sailing.autopilotMode === 'compass' ? 'HEADING LOCK' : 'MANUAL HELM'}</span>
        <span className={batteryPct < 20 ? 'text-rose-300' : 'text-slate-400'}>HOUSE {Math.round(batteryPct)}%</span>
      </div>
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { X, Compass, AlertTriangle, Anchor, Ship } from 'lucide-react';
import {
  computeGreatCircleNm,
  generateIntermediateAnchorages,
  HANDCRAFTED_HUBS,
  isCycloneRiskMonth,
  MONTH_NAMES,
} from '../sim/worldHubs';
import { BOAT_ORDER, BOAT_SPECS } from '../sim/boats';
import type { BoatId, WorldHub } from '../types/sailing';

interface WorldChartModalProps {
  open: boolean;
  currentFromId: string;
  currentToId: string;
  visitedHubIds: string[];
  monthOfYear: number;
  currentBoatId: BoatId;
  coins: number;
  onClose: () => void;
  onSelectMonth: (month: number) => void;
  onLaunchPassage: (from: WorldHub, to: WorldHub) => void;
  onSwitchBoat: (boat: BoatId) => void;
}

function projectLonLat(lon: number, lat: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * 900;
  const y = ((90 - lat) / 180) * 420;
  return { x, y };
}

export function WorldChartModal({
  open,
  currentFromId,
  currentToId,
  visitedHubIds,
  monthOfYear,
  currentBoatId,
  coins,
  onClose,
  onSelectMonth,
  onLaunchPassage,
  onSwitchBoat,
}: WorldChartModalProps) {
  const [fromHub, setFromHub] = useState<WorldHub>(
    () => HANDCRAFTED_HUBS.find((h) => h.id === currentFromId) ?? HANDCRAFTED_HUBS[0],
  );
  const [toHub, setToHub] = useState<WorldHub>(
    () => HANDCRAFTED_HUBS.find((h) => h.id === currentToId) ?? HANDCRAFTED_HUBS[1],
  );
  const [selectedStop, setSelectedStop] = useState<WorldHub>(toHub);

  useEffect(() => {
    if (open) {
      const nextFrom = HANDCRAFTED_HUBS.find((h) => h.id === currentFromId) ?? HANDCRAFTED_HUBS[0];
      const nextTo = HANDCRAFTED_HUBS.find((h) => h.id === currentToId) ?? HANDCRAFTED_HUBS[1];
      setFromHub(nextFrom);
      setToHub(nextTo);
      setSelectedStop(nextTo);
    }
  }, [open, currentFromId, currentToId]);

  const proceduralAtolls = useMemo(
    () => generateIntermediateAnchorages(fromHub, toHub, 4),
    [fromHub, toHub],
  );

  if (!open) return null;

  const legDistanceNm =
    fromHub.id === 'lanzarote' && selectedStop.id === 'la-gomera'
      ? 100
      : Math.max(25, computeGreatCircleNm(fromHub.lat, fromHub.lon, selectedStop.lat, selectedStop.lon));
  const cycloneAlert = isCycloneRiskMonth(selectedStop, monthOfYear);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Trade-Wind World Chart"
    >
      <div className="w-full max-w-6xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Compass className="w-5 h-5 text-amber-400" aria-hidden="true" />
            <div>
              <h2 className="font-display text-xl font-semibold text-slate-50">
                Global Trade-Wind Route & Great Capes
              </h2>
              <p className="text-xs text-slate-400">
                28 handcrafted Coconut Milk Run hubs · Deterministic procedural atolls · Seasonal cyclone windows
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <span>Departure Month</span>
              <select
                value={monthOfYear}
                onChange={(e) => onSelectMonth(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100"
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close World Chart"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-5 p-6">
          {/* World SVG Chart */}
          <div className="lg:col-span-8 flex flex-col gap-3">
            <div className="bg-[#091c2b] border border-slate-700/80 rounded-lg overflow-hidden relative">
              <svg viewBox="0 0 900 420" className="w-full h-auto block" role="img" aria-label="World Trade-Wind Sailing Map">
                {/* Lat/Lon Graticule */}
                {[-60, -30, 0, 30, 60].map((lat) => {
                  const { y } = projectLonLat(0, lat);
                  return (
                    <line
                      key={`lat-${lat}`}
                      x1={0}
                      y1={y}
                      x2={900}
                      y2={y}
                      stroke={lat === 0 ? 'rgba(245,158,11,0.3)' : 'rgba(148,163,184,0.12)'}
                      strokeDasharray={lat === 0 ? '4 4' : undefined}
                    />
                  );
                })}
                {[-120, -60, 0, 60, 120].map((lon) => {
                  const { x } = projectLonLat(lon, 0);
                  return (
                    <line
                      key={`lon-${lon}`}
                      x1={x}
                      y1={0}
                      x2={x}
                      y2={420}
                      stroke="rgba(148,163,184,0.12)"
                    />
                  );
                })}

                {/* Stylized Landmass Silhouettes */}
                <g fill="#233d35" stroke="#365c4e" strokeWidth="1">
                  {/* North & Central America */}
                  <path d="M90,45 L250,40 L295,85 L240,145 L210,185 L252,202 L235,212 L195,180 L165,135 L105,95 Z" />
                  {/* South America */}
                  <path d="M255,215 L318,225 L345,260 L325,315 L292,375 L276,372 L272,300 L252,250 Z" />
                  {/* Europe */}
                  <path d="M415,52 L505,42 L530,85 L495,118 L430,115 L412,92 Z" />
                  {/* Africa */}
                  <path d="M405,126 L495,128 L538,175 L525,250 L492,302 L470,295 L452,215 L408,185 Z" />
                  {/* Asia */}
                  <path d="M510,45 L755,48 L795,95 L745,165 L680,190 L615,185 L545,148 L515,112 Z" />
                  {/* Australia */}
                  <path d="M725,245 L808,248 L820,295 L785,318 L735,302 Z" />
                  {/* Madagascar & NZ */}
                  <path d="M548,245 L562,248 L558,282 L544,278 Z" />
                  <path d="M845,305 L865,295 L860,335 L842,340 Z" />
                </g>

                {/* Prevailing Trade-Wind Arrows */}
                <g stroke="rgba(56,189,248,0.35)" strokeWidth="1.2" fill="none">
                  {[210, 340, 580, 740].map((x) => (
                    <g key={`tw-${x}`}>
                      <path d={`M${x},155 L${x - 24},168`} />
                      <path d={`M${x},255 L${x - 24},242`} />
                    </g>
                  ))}
                </g>

                {/* Trade-Wind Route Segments */}
                {HANDCRAFTED_HUBS.slice(0, -1).map((hub, idx) => {
                  const next = HANDCRAFTED_HUBS[idx + 1];
                  if (Math.abs(hub.lon - next.lon) > 180) return null;
                  const p1 = projectLonLat(hub.lon, hub.lat);
                  const p2 = projectLonLat(next.lon, next.lat);
                  return (
                    <line
                      key={`seg-${hub.id}`}
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke="rgba(245,158,11,0.35)"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                  );
                })}

                {/* Active Planned Leg Line */}
                {(() => {
                  const p1 = projectLonLat(fromHub.lon, fromHub.lat);
                  const p2 = projectLonLat(selectedStop.lon, selectedStop.lat);
                  if (Math.abs(fromHub.lon - selectedStop.lon) > 180) return null;
                  return (
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke="#f59e0b"
                      strokeWidth="2.5"
                    />
                  );
                })()}

                {/* Procedural Intermediate Atolls */}
                {proceduralAtolls.map((atoll) => {
                  const { x, y } = projectLonLat(atoll.lon, atoll.lat);
                  const isSel = selectedStop.id === atoll.id;
                  return (
                    <g
                      key={atoll.id}
                      onClick={() => setSelectedStop(atoll)}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={x}
                        cy={y}
                        r={isSel ? 5.5 : 3.5}
                        fill="#38bdf8"
                        stroke="#0f172a"
                        strokeWidth="1"
                      />
                    </g>
                  );
                })}

                {/* 28 Handcrafted Hubs */}
                {HANDCRAFTED_HUBS.map((hub) => {
                  const { x, y } = projectLonLat(hub.lon, hub.lat);
                  const isFrom = hub.id === fromHub.id;
                  const isTo = hub.id === selectedStop.id;
                  const visited = visitedHubIds.includes(hub.id);
                  const risky = isCycloneRiskMonth(hub, monthOfYear);

                  return (
                    <g
                      key={hub.id}
                      onClick={() => {
                        setToHub(hub);
                        setSelectedStop(hub);
                      }}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={x}
                        cy={y}
                        r={isFrom || isTo ? 6.5 : hub.harborType === 'Great Cape' ? 5.5 : 4.2}
                        fill={
                          isFrom
                            ? '#10b981'
                            : isTo
                              ? '#f59e0b'
                              : risky
                                ? '#ef4444'
                                : visited
                                  ? '#34d399'
                                  : '#e2e8f0'
                        }
                        stroke="#091c2b"
                        strokeWidth="1.5"
                      />
                      {(isFrom || isTo || hub.harborType === 'Great Cape') && (
                        <text
                          x={hub.id === 'la-gomera' ? x - 62 : x + 8}
                          y={hub.id === 'la-gomera' ? y + 11 : y + 3}
                          fontSize="9"
                          fill="#f8fafc"
                          className="pointer-events-none select-none"
                        >
                          {hub.name.split(',')[0].split('(')[0].trim()}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Hub Quick-Picker Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto pr-1">
              {HANDCRAFTED_HUBS.map((hub) => {
                const active = selectedStop.id === hub.id;
                const risky = isCycloneRiskMonth(hub, monthOfYear);
                return (
                  <button
                    key={hub.id}
                    type="button"
                    onClick={() => {
                      setToHub(hub);
                      setSelectedStop(hub);
                    }}
                    className={`text-left px-2.5 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-500/15 border-amber-400 text-slate-50'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-medium truncate">{hub.name}</div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span className="truncate">{hub.region}</span>
                      {risky && <span className="text-red-400 font-medium">Cyclone</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Passage & Fleet */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">Planned Passage</div>
              <div className="text-base font-semibold text-slate-50 mb-1">
                {fromHub.name} → {selectedStop.name}
              </div>
              <div className="font-mono-tabular text-xs text-amber-400 mb-3">
                {legDistanceNm} NM · Prevailing {selectedStop.prevailingWindDirDeg}° @ {selectedStop.prevailingWindKts} kts
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                {selectedStop.description}
              </p>

              {cycloneAlert && (
                <div className="flex items-start gap-2 p-2.5 rounded-md bg-red-950/60 border border-red-700/60 text-xs text-red-200 mb-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>
                    {MONTH_NAMES[monthOfYear - 1]} falls inside {selectedStop.name} cyclone season. Consider another departure month.
                  </span>
                </div>
              )}

              {proceduralAtolls.length > 0 && (
                <div className="mb-3">
                  <div className="text-[11px] font-medium text-slate-400 mb-1.5">
                    Procedural Intermediate Anchorages ({proceduralAtolls.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {proceduralAtolls.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setSelectedStop(a)}
                        className={`px-2 py-1 rounded text-[11px] border cursor-pointer ${
                          selectedStop.id === a.id
                            ? 'bg-sky-500/20 border-sky-400 text-sky-100'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <Anchor className="w-3 h-3 inline mr-1" />
                        {a.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFromHub(selectedStop)}
                  className="min-h-[44px] px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 cursor-pointer"
                >
                  Set as Origin
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onLaunchPassage(fromHub, selectedStop);
                    onClose();
                  }}
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs cursor-pointer"
                >
                  Set Sail ({legDistanceNm} NM)
                </button>
              </div>
            </div>

            {/* Fleet Upgrade Card */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <Ship className="w-4 h-4 text-amber-400" />
                  <span>Cruising Fleet</span>
                </div>
                <span className="font-mono-tabular text-xs text-amber-400">{coins} Cr</span>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {BOAT_ORDER.map((id) => {
                  const b = BOAT_SPECS[id];
                  const isCurrent = currentBoatId === id;
                  const canAfford = coins >= b.priceCoins || isCurrent;
                  return (
                    <div
                      key={id}
                      className={`p-2.5 rounded-lg border ${
                        isCurrent ? 'bg-amber-500/10 border-amber-400/70' : 'bg-slate-900/70 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-100">{b.name}</span>
                        <button
                          type="button"
                          disabled={isCurrent || !canAfford}
                          onClick={() => onSwitchBoat(id)}
                          className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
                            isCurrent
                              ? 'bg-emerald-900/50 text-emerald-300 cursor-default'
                              : canAfford
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {isCurrent ? 'Active' : b.priceCoins === 0 ? 'Select' : `${b.priceCoins} Cr`}
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {b.lengthFt}ft · {b.hullSpeedKts} kts · {b.solarPeakWatts}W Solar · {b.batteryCapacityAh}Ah
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import type { BoatId } from '../types/sailing';
import { BOAT_SPECS } from '../sim/boats';

interface TitleScreenProps {
  selectedBoat: BoatId;
  onSelectBoat: (boat: BoatId) => void;
  onStart: () => void;
  onOpenWorldChart: () => void;
}

export function TitleScreen({
  selectedBoat,
  onSelectBoat,
  onStart,
  onOpenWorldChart,
}: TitleScreenProps) {
  const spec = BOAT_SPECS[selectedBoat];

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-8 md:p-12">
      {/* Subtle top-left scrim for contrast without blocking the live 3D yacht center-right */}
      <div className="max-w-lg pointer-events-auto bg-slate-950/85 border border-slate-700/50 rounded-xl p-7 shadow-2xl">
        <div className="flex items-center gap-4 mb-4">
          <svg
            viewBox="0 0 48 48"
            className="w-11 h-11 text-amber-400 shrink-0"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="1.75" opacity="0.85" />
            <circle cx="24" cy="24" r="15" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" opacity="0.55" />
            <path d="M24 5L27.5 21.5L24 24L20.5 21.5L24 5Z" fill="currentColor" />
            <path d="M24 43L27.5 26.5L24 24L20.5 26.5L24 43Z" fill="#94a3b8" />
            <path d="M5 24L21.5 20.5L24 24L21.5 27.5L5 24Z" fill="#94a3b8" />
            <path d="M43 24L26.5 20.5L24 24L26.5 27.5L43 24Z" fill="#94a3b8" />
            <circle cx="24" cy="24" r="2.5" fill="#0f172a" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <div>
            <p className="text-xs tracking-widest uppercase text-amber-400/90 font-medium">
              Solo Bluewater Sailing Simulator
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-semibold text-slate-50 tracking-tight leading-tight">
              Meridian Passage
            </h1>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-5">
          Sail the 100 NM Canary Islands passage or chart the 28-hub Trade-Wind route around the
          Three Great Capes. Trim canvas through squalls, manage cabin power and fridge stores,
          swing on tidal anchors, and refit at dockside chandleries.
        </p>

        {/* Starting Vessel Selector */}
        <div className="mb-5">
          <div className="text-xs font-medium text-slate-400 mb-2">Starting Vessel</div>
          <div className="grid grid-cols-2 gap-2">
            {(['elan-19', 'rustler-36'] as BoatId[]).map((id) => {
              const b = BOAT_SPECS[id];
              const active = selectedBoat === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectBoat(id)}
                  className={`text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? 'bg-amber-500/15 border-amber-400 text-slate-50'
                      : 'bg-slate-900/70 border-slate-700/70 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="text-sm font-semibold whitespace-nowrap">{b.name}</div>
                  <div className="text-xs text-slate-400 truncate">{b.lengthFt} ft · {b.hullSpeedKts} kts max</div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400 leading-snug">{spec.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={onStart}
            className="px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Start 100 NM Passage
          </button>
          <button
            type="button"
            onClick={onOpenWorldChart}
            className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600/80 font-medium text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Trade-Wind World Chart
          </button>
        </div>
      </div>

      {/* Single flat bottom control hint */}
      <div className="text-xs text-slate-300/90 bg-slate-950/75 border border-slate-800/80 rounded-lg px-4 py-2 w-fit">
        A / D Steer Helm · Q / E Trim Mainsheet · R Reef Sails · V Toggle 1st / 3rd Person · H Hide HUD · Esc Pause
      </div>
    </div>
  );
}

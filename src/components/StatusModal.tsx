import type { GameScreenState, SimulationState } from '../types/sailing';
import { BOAT_SPECS } from '../sim/boats';

interface StatusModalProps {
  screenState: GameScreenState;
  sim: SimulationState;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
  onOpenWorldChart: () => void;
}

export function StatusModal({
  screenState,
  sim,
  onResume,
  onRestart,
  onReturnTitle,
  onOpenWorldChart,
}: StatusModalProps) {
  if (screenState !== 'paused' && screenState !== 'gameover') return null;

  const isVictory = screenState === 'gameover';
  const spec = BOAT_SPECS[sim.boatId];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isVictory ? 'Passage Complete' : 'Simulation Paused'}
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl">
        <p className="text-xs uppercase tracking-widest text-amber-400 font-medium mb-1">
          {isVictory ? 'Landfall & Anchor Secured' : 'Watch Stood Down'}
        </p>
        <h2 className="font-display text-2xl font-semibold text-slate-50 mb-2">
          {isVictory ? `Arrived at ${sim.passage.toName}` : 'Voyage Paused'}
        </h2>
        <p className="text-sm text-slate-300 mb-5">
          {isVictory
            ? `Completed the ${sim.passage.totalDistanceNm} NM passage aboard ${spec.name}.`
            : `Currently ${Math.max(0, Math.round(sim.passage.totalDistanceNm - sim.passage.xNm))} NM from ${sim.passage.toName}.`}
        </p>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <div className="text-xs text-slate-400">Elapsed</div>
            <div className="font-mono-tabular text-lg font-semibold text-slate-100">
              {Math.round(sim.passage.elapsedHours)}h
            </div>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <div className="text-xs text-slate-400">Peak Speed</div>
            <div className="font-mono-tabular text-lg font-semibold text-slate-100">
              {sim.passage.peakSpeedKts.toFixed(1)} kts
            </div>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <div className="text-xs text-slate-400">Max Gust</div>
            <div className="font-mono-tabular text-lg font-semibold text-slate-100">
              {Math.round(sim.passage.maxGustKts)} kts
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {!isVictory && (
            <button
              type="button"
              onClick={onResume}
              className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              Resume Voyage
            </button>
          )}
          {isVictory && (
            <button
              type="button"
              onClick={onOpenWorldChart}
              className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              Next World Passage
            </button>
          )}
          <button
            type="button"
            data-start={isVictory ? 'true' : undefined}
            onClick={onRestart}
            className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 font-medium text-sm transition-colors whitespace-nowrap cursor-pointer"
          >
            Sail Again
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="px-4 py-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-700 font-medium text-sm transition-colors whitespace-nowrap cursor-pointer"
          >
            Title
          </button>
        </div>
      </div>
    </div>
  );
}

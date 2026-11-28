import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Compass } from 'lucide-react';
import { getSailingLessonSteps } from '../sim/lessonProgress';
import { BOAT_SPECS } from '../sim/boats';
import type { SimulationState } from '../types/sailing';

interface SailingLessonCardProps {
  sim: SimulationState;
}

export function SailingLessonCard({ sim }: SailingLessonCardProps) {
  const [collapsed, setCollapsed] = useState(true);
  const steps = getSailingLessonSteps(sim, BOAT_SPECS[sim.boatId].noGoAngleDeg);
  const completeCount = steps.filter((step) => step.complete).length;

  return (
    <section
      className={`pointer-events-auto fixed bottom-[6.5rem] left-3 z-20 overflow-hidden rounded-xl border border-slate-600/80 bg-slate-950/95 shadow-2xl backdrop-blur ${
        collapsed ? 'w-fit max-w-[210px]' : 'w-[min(92vw,320px)]'
      }`}
      aria-label="Sailing fundamentals guide"
    >
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-slate-100"
      >
        <span className="flex items-center gap-2 text-xs font-semibold tracking-wide">
          <Compass className="h-4 w-4 text-amber-300" />
          FIRST WATCH  ·  {completeCount}/{steps.length}
        </span>
        {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {!collapsed && (
        <ol className="space-y-1 border-t border-slate-800 px-3 py-2">
          {steps.map((step) => (
            <li key={step.id} className="flex gap-2 py-1">
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  step.complete
                    ? 'border-emerald-400 bg-emerald-400/15 text-emerald-300'
                    : 'border-slate-600 text-slate-500'
                }`}
                aria-hidden="true"
              >
                {step.complete && <Check className="h-3 w-3" />}
              </span>
              <span>
                <span className={`block text-xs font-medium ${step.complete ? 'text-emerald-200' : 'text-slate-200'}`}>
                  {step.title}
                </span>
                <span className="block text-[11px] leading-snug text-slate-400">{step.instruction}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

import type { SimulationState } from '../types/sailing';

export interface SailingLessonStep {
  id: 'wind' | 'trim' | 'autopilot' | 'channel' | 'reef' | 'landfall';
  title: string;
  instruction: string;
  complete: boolean;
}

/** A live checklist built from the same helm, sail, route, and anchoring state as gameplay. */
export function getSailingLessonSteps(
  state: SimulationState,
  noGoAngleDeg: number,
): SailingLessonStep[] {
  return [
    {
      id: 'wind',
      title: 'Read the wind',
      instruction: 'Keep apparent wind clear of the red no-go sector.',
      complete: Math.abs(state.apparentWindAngleDeg) >= noGoAngleDeg,
    },
    {
      id: 'trim',
      title: 'Trim the sails',
      instruction: 'Ease the sheets when a sail flutters; trim until it fills.',
      complete: !state.isLuffing,
    },
    {
      id: 'autopilot',
      title: 'Choose a steering mode',
      instruction: 'Windvane follows wind angle; compass holds the heading.',
      complete: state.autopilotMode !== 'manual',
    },
    {
      id: 'channel',
      title: 'Stay in the approach',
      instruction: 'Keep cross-track within the marked harbor channel.',
      complete: Math.abs(state.passage.zNm) <= 0.72,
    },
    {
      id: 'reef',
      title: 'Manage sail load',
      instruction: 'Reef when the sail plan overpowers the hull.',
      complete: !state.isOverpowered || state.reefLevel > 0,
    },
    {
      id: 'landfall',
      title: 'Make a safe landfall',
      instruction: 'Enter the cove, check the soundings, then drop anchor.',
      complete: state.passage.arrivedAtCove && state.anchor.deployed,
    },
  ];
}

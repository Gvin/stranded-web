import { type GameAction, getBlockedReason } from '../engine/actions';
import type { GameState } from '../engine/types';

export interface RequirementStatus {
  label: string;
  met: boolean;
}

/** An action together with everything the UI shows about it in the current state. */
export interface ActionView {
  action: GameAction;
  /** Why the action cannot be performed, if it cannot. */
  blocked?: string;
  requirements: readonly RequirementStatus[];
  /** Energy the action needs beyond what the player has; it is taken from health instead. */
  energyShortfall: number;
}

export type PerformAction = (actionId: string) => void;

export function toActionView(state: GameState, action: GameAction): ActionView {
  return {
    action,
    blocked: getBlockedReason(state, action),
    requirements: action.requirements.map((r) => ({ label: r.describe(), met: r.test(state) })),
    energyShortfall: Math.max(0, Math.ceil(action.energy - state.player.stats.energy)),
  };
}

import { hasBodyCondition } from '../../engine/conditions';
import { BODY_PART_IDS, type BuildingId, type GameState } from '../../engine/types';

// Small helpers shared by the location files.

/** What can be built wherever the player can stay outside the camp: a bed for the night and a roof over it. */
export const SHELTER_BUILDINGS: readonly BuildingId[] = ['sleepingMat', 'shelter'];

export function plentyText(amount: number, max: number): string {
  if (amount <= 0) {
    return 'none left';
  }
  if (amount >= max * 0.66) {
    return 'plenty';
  }
  return amount <= 2 ? 'only a few left' : 'some left';
}

export function hasBrokenLimb(state: GameState): boolean {
  return BODY_PART_IDS.some((part) => hasBodyCondition(state.player, part, 'fractured'));
}

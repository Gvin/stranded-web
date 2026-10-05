import { getItemDef } from '../data/items';
import { getCharacterSheet } from './character';
import type { GainDef } from './definitions';
import { checkChance, perceptionFactor } from './rules';
import type { AttributeId, GameState } from './types';

/** A possible result of an action, ready for display. */
export interface Gain {
  label: string;
  /** The item gained, so the UI can show its icon. */
  itemId?: string;
  /** Probability in [0, 1]; undefined when certain. */
  chance?: number;
}

function quantityLabel(quantity: number | readonly [number, number] | undefined): string {
  if (quantity === undefined || quantity === 1) {
    return '';
  }
  if (typeof quantity === 'number') {
    return ` ×${quantity}`;
  }
  return quantity[0] === quantity[1] ? ` ×${quantity[0]}` : ` ×${quantity[0]}–${quantity[1]}`;
}

/** Resolves gain definitions for the current state (perception-based chances use the current perception). */
export function resolveGains(state: GameState, defs: readonly GainDef[]): Gain[] {
  const perception = getCharacterSheet(state).attributes.perception.effective;
  return defs.map((def) => {
    if ('text' in def) {
      return { label: def.text, chance: def.chance };
    }
    const chance = def.chance === undefined || def.chance >= 1 ? undefined : def.chance;
    return {
      label: `${getItemDef(def.itemId).name}${quantityLabel(def.quantity)}`,
      itemId: def.itemId,
      chance: chance !== undefined && def.perception ? Math.min(0.95, chance * perceptionFactor(perception)) : chance,
    };
  });
}

/** Chance to pass an attribute check right now, for gains that depend on one. */
export function checkGainChance(state: GameState, attribute: AttributeId, difficulty: number): number {
  return checkChance(getCharacterSheet(state).attributes[attribute].effective, difficulty);
}

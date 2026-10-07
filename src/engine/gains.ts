import { getItemDef } from '../data/items';
import { getCharacterSheet } from './character';
import type { GainDef } from './definitions';
import { perceptionFactor, successChance } from './rules';
import { findChanceFactor, skillLevel } from './skills';
import type { AttributeId, GameState } from './types';

/** A possible result of an action, ready for display. */
export interface Gain {
  label: string;
  /** The item gained, so the UI can show its icon. */
  itemId?: string;
  /** Probability in [0, 1]; undefined when certain. */
  chance?: number;
  /** A find of an item the player has never had: its chance shows, but not what it is. */
  unknown?: boolean;
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

/** Resolves gain definitions for the current state: chances of finds use the current perception and Foraging skill. */
export function resolveGains(state: GameState, defs: readonly GainDef[]): Gain[] {
  const perception = getCharacterSheet(state).attributes.perception.effective;
  const foraging = findChanceFactor(skillLevel(state.player, 'foraging'));
  return defs.map((def) => {
    if ('text' in def) {
      return { label: def.text, chance: def.chance };
    }
    let chance = def.chance === undefined || def.chance >= 1 ? undefined : def.chance;
    if (chance !== undefined && def.perception) {
      chance = Math.min(0.95, chance * perceptionFactor(perception) * (def.find ? foraging : 1));
    } else if (chance !== undefined && def.find) {
      chance = chance * foraging >= 1 ? undefined : chance * foraging;
    }
    if (def.find && !state.player.knownItems.includes(def.itemId)) {
      return { label: 'Unknown find', chance, unknown: true };
    }
    return { label: `${getItemDef(def.itemId).name}${quantityLabel(def.quantity)}`, itemId: def.itemId, chance };
  });
}

/** Chance right now that an action depending on the attribute succeeds, for its gains. */
export function successGainChance(state: GameState, attribute: AttributeId): number {
  return successChance(getCharacterSheet(state).attributes[attribute].effective);
}

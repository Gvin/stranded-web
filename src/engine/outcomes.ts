import type { ActionContext } from './context';
import type { GainDef } from './definitions';
import type { GameState } from './types';
import { getLocationState } from './world';

// Reusable outcome helpers for content actions: finds and their limits.

export interface FindDef {
  itemId: string;
  chance: number;
  quantity?: number | readonly [number, number];
  /** How many times this can ever be found at this location. */
  limit?: number;
  /** The chance is not improved by perception: for what is always there, such as the stones of the scree. */
  fixedChance?: boolean;
  /** Health of a found item that wears out; full when not given. */
  health?: number;
}

function findKey(objectId: string, itemId: string): string {
  return `${objectId}:${itemId}`;
}

/** Whether any of the limited finds of an object can still be found at the location. */
export function hasLimitedFindsLeft(state: GameState, locationId: string, objectId: string, finds: readonly FindDef[]): boolean {
  const taken = getLocationState(state, locationId).finds;
  return finds.some((f) => f.limit !== undefined && (taken[findKey(objectId, f.itemId)] ?? 0) < f.limit);
}

/** Gains to show for a list of finds, leaving out limited finds that are used up. */
export function findGains(state: GameState, locationId: string, objectId: string, finds: readonly FindDef[]): GainDef[] {
  const taken = getLocationState(state, locationId).finds;
  return finds
    .filter((f) => f.limit === undefined || (taken[findKey(objectId, f.itemId)] ?? 0) < f.limit)
    .map((f) => ({ itemId: f.itemId, quantity: f.quantity, chance: f.chance, perception: !f.fixedChance, find: true }));
}

/**
 * Rolls every find independently and adds what was found to the bag; returns whether anything was found.
 * The Foraging skill raises the chances and the quantities, limited finds never beyond what is left.
 */
export function rollFinds(ctx: ActionContext, objectId: string, finds: readonly FindDef[]): boolean {
  const taken = ctx.location().finds;
  let foundAny = false;
  for (const find of finds) {
    const key = findKey(objectId, find.itemId);
    if (find.limit !== undefined && (taken[key] ?? 0) >= find.limit) {
      continue;
    }
    if (!ctx.chance(ctx.findChance(find.chance, { perception: !find.fixedChance }))) {
      continue;
    }
    const [min, max] = typeof find.quantity === 'number' ? [find.quantity, find.quantity] : (find.quantity ?? [1, 1]);
    let quantity = ctx.gathered(ctx.randomInt(min, max));
    if (find.limit !== undefined) {
      quantity = Math.min(quantity, find.limit - (taken[key] ?? 0));
      taken[key] = (taken[key] ?? 0) + quantity;
    }
    ctx.addItem(find.itemId, quantity, { health: find.health });
    foundAny = true;
  }
  return foundAny;
}

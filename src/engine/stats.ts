import { damagePart, partDamageMessage } from './body';
import { getCharacterSheet } from './character';
import { SURVIVAL_RULES } from './rules';
import type { GameState, NeedId } from './types';

const OVERFLOW_DEATH_CAUSES: Record<NeedId, string> = {
  thirst: 'You died of dehydration.',
  hunger: 'You starved to death.',
  energy: 'You pushed yourself past exhaustion and collapsed for good.',
};

export interface StatChange {
  /** How much the stat actually changed. */
  applied: number;
  /** Torso health lost because the change went past the end of the bar. */
  damage: number;
  deathCause?: string;
  /** What that damage did to the torso, as a log line (see `partDamageMessage`). */
  hurt?: string;
}

/** How far a change would push a stat past its bad end: above the maximum for thirst and hunger, below 0 for energy. */
export function statOverflow(id: NeedId, before: number, delta: number, max: number): number {
  if (id === 'thirst' || id === 'hunger') {
    return Math.max(0, before + delta - Math.max(max, before));
  }
  return Math.max(0, -(before + delta));
}

/**
 * Changes a stat within [0, max]. Whatever would push thirst or hunger past the maximum, or energy below 0,
 * is taken from the torso's health instead, scaled by the overflow damage rules.
 */
export function changeStat(state: GameState, id: NeedId, delta: number, max = getCharacterSheet(state).max[id]): StatChange {
  const { stats } = state.player;
  const before = stats[id];
  const overflow = statOverflow(id, before, delta, max);
  stats[id] = Math.min(max, Math.max(0, before + delta));
  const damage = overflow * SURVIVAL_RULES.overflowDamage[id];
  const hurt = damage > 0 ? partDamageMessage('torso', damagePart(state.player, 'torso', damage).conditions) : undefined;
  return { applied: stats[id] - before, damage, deathCause: damage > 0 ? OVERFLOW_DEATH_CAUSES[id] : undefined, hurt };
}

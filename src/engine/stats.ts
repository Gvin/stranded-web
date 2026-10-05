import { getCharacterSheet } from './character';
import { SURVIVAL_RULES } from './rules';
import type { GameState, StatId } from './types';

const OVERFLOW_DEATH_CAUSES: Partial<Record<StatId, string>> = {
  thirst: 'You died of dehydration.',
  hunger: 'You starved to death.',
  energy: 'You pushed yourself past exhaustion and collapsed for good.',
};

export interface StatChange {
  /** How much the stat actually changed. */
  applied: number;
  /** Health lost because the change went past the end of the bar. */
  damage: number;
  deathCause?: string;
}

/** How far a change would push a stat past its bad end: above the maximum for thirst and hunger, below 0 for energy. */
export function statOverflow(id: StatId, before: number, delta: number, max: number): number {
  if (id === 'thirst' || id === 'hunger') {
    return Math.max(0, before + delta - Math.max(max, before));
  }
  if (id === 'energy') {
    return Math.max(0, -(before + delta));
  }
  return 0;
}

/**
 * Changes a stat within [0, max]. Whatever would push thirst or hunger past the maximum, or energy below 0,
 * is taken from health instead, scaled by the overflow damage rules.
 */
export function changeStat(state: GameState, id: StatId, delta: number, max = getCharacterSheet(state).max[id]): StatChange {
  const { stats } = state.player;
  const before = stats[id];
  const overflow = statOverflow(id, before, delta, max);
  stats[id] = Math.min(max, Math.max(0, before + delta));
  const factor = id === 'thirst' || id === 'hunger' || id === 'energy' ? SURVIVAL_RULES.overflowDamage[id] : 0;
  const damage = overflow * factor;
  if (damage > 0) {
    stats.health = Math.max(0, stats.health - damage);
  }
  return { applied: stats[id] - before, damage, deathCause: damage > 0 ? OVERFLOW_DEATH_CAUSES[id] : undefined };
}

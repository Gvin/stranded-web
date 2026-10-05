import type { Severity } from './conditions';
import type { AttributeId, StatId } from './types';

// Balance constants and formulas in one place, so the game can be tuned without hunting through the engine.

export const BASE_ATTRIBUTE = 20;
export const MAX_ATTRIBUTE = 100;
export const MIN_EFFECTIVE_ATTRIBUTE = 1;
/** Penalties stack additively but never reduce an attribute by more than this percentage. */
export const MAX_TOTAL_PENALTY = -90;

export const ATTRIBUTE_NAMES: Record<AttributeId, string> = {
  strength: 'Strength',
  endurance: 'Endurance',
  perception: 'Perception',
  agility: 'Agility',
};

export const ATTRIBUTE_HINTS: Record<AttributeId, string> = {
  strength: 'Max health, carry weight and fighting.',
  endurance: 'Max energy, thirst and hunger.',
  perception: 'Finding things when searching or gathering.',
  agility: 'Travel speed, climbing and fighting.',
};

export const STAT_NAMES: Record<StatId, string> = {
  health: 'Health',
  thirst: 'Thirst',
  hunger: 'Hunger',
  energy: 'Energy',
};

export function maxStatsFor(attributes: Record<AttributeId, number>): Record<StatId, number> {
  return {
    health: Math.round(80 + attributes.strength),
    thirst: Math.round(80 + attributes.endurance),
    hunger: Math.round(80 + attributes.endurance),
    energy: Math.round(80 + attributes.endurance),
  };
}

/** Carry capacity in kg. */
export function carryCapacityFor(strength: number): number {
  return Math.round((10 + strength / 2) * 10) / 10;
}

/** Training points needed to raise a base attribute by one. */
export function xpToNextPoint(base: number): number {
  return 10 + base;
}

/** Duration multiplier for agility-based actions such as travel: 1 at 20, 0.5 at 80, slower when hurt. */
export function speedFactor(agility: number): number {
  return Math.min(3, Math.max(0.5, Math.sqrt(BASE_ATTRIBUTE / agility)));
}

/** Multiplier for the chance of finding things: 1 at 20 perception, 3 at 100. */
export function perceptionFactor(perception: number): number {
  return 0.5 + perception / 40;
}

/** Probability to pass a check of an attribute against a difficulty (50% when equal). */
export function checkChance(value: number, difficulty: number): number {
  return Math.min(0.95, Math.max(0.05, 0.5 + (value - difficulty) / 100));
}

/** Fighting power from strength, agility and the best held weapon. */
export function fightPower(strength: number, agility: number, weaponBonus: number): number {
  return (strength + agility) / 2 + weaponBonus;
}

export function fightWinChance(power: number, difficulty: number): number {
  return Math.min(0.95, Math.max(0.05, 0.5 + (power - difficulty) / 50));
}

export const SURVIVAL_RULES = {
  /** Thirst and hunger grow by these amounts per hour. */
  thirstPerHour: 4,
  hungerPerHour: 2,
  /** Hunger and thirst grow slower while sleeping. */
  sleepingDrainFactor: 0.6,
  /**
   * Health lost per point of thirst or hunger pushed past the maximum, or per point of energy missing for an action.
   * Keeps dehydration at 5 health/hour and starvation at 3 health/hour once the bars are full.
   */
  overflowDamage: { thirst: 1.25, hunger: 1.5, energy: 1 },
  /** Natural healing only happens while both hunger and thirst are at or below this fraction. */
  healingMaxFraction: 0.5,
  healthRegenPerHour: { awake: 0.5, resting: 1.5, sleeping: 2.5 },
  energyRegenPerHour: { awake: 0, resting: 8, sleeping: 11 },
  shelteredSleepEnergyBonusPerHour: 3,
  /** Below this energy fraction the player becomes dizzy from exhaustion. */
  exhaustionFraction: 0.1,
  exhaustionDizziness: 'medium' as Severity,
  /** Sleeping is only possible while energy is below this value. */
  sleepBelowEnergy: 50,
  /** Simulation step in game minutes. */
  tickMinutes: 10,
  maxLogEntries: 200,
} as const;

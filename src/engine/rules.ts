import type { Severity } from './conditions';
import type { AttributeId, NutrientId, SkillId, StatId } from './types';

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

export const NUTRIENT_NAMES: Record<NutrientId, string> = {
  vegetables: 'Vegetables',
  meat: 'Meat',
  fruits: 'Fruits',
};

export const NUTRITION_RULES = {
  /** The food groups together hold at most this much; a new game splits it evenly. */
  total: 99,
  /** Eating adds `gain` to the food's group and takes `loss` from every other group. */
  gain: 2,
  loss: 1,
  /** Penalty in percent to every attribute while any food group is empty. */
  malnutritionPenalty: 15,
} as const;

/** Energy every crafting recipe costs. */
export const CRAFT_ENERGY = 1;

/** Time and energy of every building step. */
export const BUILDING_STEP_MINUTES = 15;
export const BUILDING_STEP_ENERGY = 2;

export const SKILL_NAMES: Record<SkillId, string> = {
  fighting: 'Fighting',
  farming: 'Farming',
  building: 'Building',
  foraging: 'Foraging',
  crafting: 'Crafting',
};

export const SKILL_RULES = {
  maxLevel: 10,
  /** Practice points from one level to the next. */
  pointsPerLevel: 100,
  /** Points one action gives the skill it trains (a building step, a craft, a foraging action). */
  points: { fighting: 0, farming: 0, building: 10, foraging: 2, crafting: 10 } satisfies Record<SkillId, number>,
  /** Building steps and recipes take this much less of their time per Building or Crafting level (level 10: half). */
  timeReductionPerLevel: 0.05,
  /** Foraging: find chances grow by this fraction per level, gathered items by this fraction per level. */
  findChancePerLevel: 0.1,
  gatheredPerLevel: 0.05,
  /** Chance by Building or Crafting level (index) to get one used resource back, and a second one on top. */
  refundChance: [0, 0, 0, 0, 0, 0.1, 0.3, 0.5, 0.7, 1, 1],
  secondRefundChance: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5],
} as const;

/** Health a worn item loses per day of wearing. */
export const ITEM_WEAR_PER_DAY = 1;
/** Health a lit torch loses per hour, wherever it is. */
export const TORCH_BURN_PER_HOUR = 2;
/** Health a pair of flints loses each time it lights a fire. */
export const FLINTS_WEAR_PER_USE = 1;
/** The ways to light a fire: time, energy, and the sticks each needs and uses up (a lit torch is instant). */
export const FIRE_LIGHTING = {
  bowDrill: { minutes: 15, energy: 3, sticksNeeded: 1, sticksUsed: 1 },
  flints: { minutes: 10, energy: 1 },
  friction: { minutes: 30, energy: 5, sticksNeeded: 2, sticksUsed: 1 },
} as const;
/** Items at or below this fraction of their full health show a warning. */
export const ITEM_WORN_OUT_WARNING = 0.1;

/** Temperature steps from coldest to hottest; the value of a step is its index minus 2 (Normal = 0). */
export type TemperatureId = 'veryCold' | 'cold' | 'normal' | 'hot' | 'veryHot';
export const TEMPERATURE_IDS: readonly TemperatureId[] = ['veryCold', 'cold', 'normal', 'hot', 'veryHot'];

export const TEMPERATURE_NAMES: Record<TemperatureId, string> = {
  veryCold: 'Very Cold',
  cold: 'Cold',
  normal: 'Normal',
  hot: 'Hot',
  veryHot: 'Very Hot',
};

export const ENVIRONMENT_RULES = {
  /** Temperature of the time of day; hours are inclusive and the night wraps past midnight. */
  dayTemperatures: [
    { name: 'Morning', from: 7, to: 10, temperature: 0 },
    { name: 'Midday', from: 11, to: 16, temperature: 1 },
    { name: 'Evening', from: 17, to: 21, temperature: 0 },
    { name: 'Night', from: 22, to: 6, temperature: -1 },
  ],
  /** How fast thirst and hunger grow at each body temperature (1 = the normal speed). */
  rates: {
    veryCold: { thirst: 0.9, hunger: 1.5 },
    cold: { thirst: 0.9, hunger: 1.25 },
    normal: { thirst: 1, hunger: 1 },
    hot: { thirst: 1.25, hunger: 1 },
    veryHot: { thirst: 1.5, hunger: 1 },
  } satisfies Record<TemperatureId, { thirst: number; hunger: number }>,
  /** Very Hot or Very Cold body temperature for longer than this causes Overheated or Freezing. */
  exposureMinutes: 60,
  /** Overheated and Freezing last this long once the exposure ends. */
  exposureConditionMinutes: 30,
  /** Penalty in percent to every attribute while Overheated or Freezing. */
  exposurePenalty: 20,
  /** Minutes out in the rain, with neither a roof nor waterproof clothes, before the player gets wet. */
  wetAfterMinutes: 10,
  /** Being wet lasts this long after the rain, drying this many times faster while the environment is Hot or Very Hot. */
  wetMinutes: 120,
  wetHotDryingRate: 2,
  /** Washing your face at the spring or sitting by the fire takes this much off Overheated, Freezing and Wet. */
  recoveryMinutes: 15,
} as const;

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
  /** While sleeping, health and energy come back by where the player sleeps (see SLEEP_RULES). */
  healthRegenPerHour: { awake: 0.5, resting: 0.5 },
  energyRegenPerHour: { awake: 0, resting: 5 },
  /** Below this energy fraction the player becomes dizzy from exhaustion. */
  exhaustionFraction: 0.1,
  exhaustionDizziness: 'medium' as Severity,
  /** Sleeping is only possible while energy is below this value, or while the player is Sleepy. */
  sleepBelowEnergy: 50,
  /** "Sleep till morning" wakes the player at this hour and is offered only when that is at most this many hours away. */
  wakeUpHour: 6,
  sleepTillMorningMaxHours: 12,
  /** Simulation step in game minutes. */
  tickMinutes: 10,
  maxLogEntries: 200,
} as const;

/** Sleep; how well the player sleeps is set by the buildings' `sleep` and SLEEP_IN_THE_OPEN in src/data/buildings.ts. */
export const SLEEP_RULES = {
  /** How long the condition a sleep leaves lasts, from waking up, and how it changes every attribute, in percent. */
  conditionHours: 20,
  conditionPercent: { awfulSleep: -20, badSleep: -10, goodSleep: 10, perfectSleep: 20 },
  /** Hours awake after which the player is Sleepy, and Sleepy's penalty to every attribute in percent. */
  sleepyAfterHours: 20,
  sleepyPenalty: 20,
} as const;

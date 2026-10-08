import type { Severity } from './conditions';
import type { AttributeId, BodyConditionId, BodyPartId, NeedId, NutrientId, SkillId, StatId } from './types';

// Balance constants and formulas in one place, so the game can be tuned without hunting through the engine.

export const BASE_ATTRIBUTE = 20;
export const MAX_ATTRIBUTE = 100;
export const MIN_EFFECTIVE_ATTRIBUTE = 1;
/** Penalties stack additively but never reduce an attribute by more than this percentage. */
export const MAX_TOTAL_PENALTY = -90;

/**
 * How attributes work on actions. BASE_ATTRIBUTE is the basic value: above it an attribute helps, below it penalizes.
 * An action that depends on an attribute succeeds with `successAtBase` at the basic value and `successPerPoint` more for
 * every point above it (30% at 20, 70% at 100, 25% at 10).
 */
export const ATTRIBUTE_RULES = {
  successAtBase: 0.3,
  successPerPoint: 0.005,
  /** Perception multiplies find chances by 1 at the basic value, rising evenly to this at MAX_ATTRIBUTE. */
  perceptionAtMax: 2,
  /** A chance Perception improves never goes above this. */
  maxPerceptionChance: 0.95,
} as const;

export const ATTRIBUTE_NAMES: Record<AttributeId, string> = {
  strength: 'Strength',
  endurance: 'Endurance',
  perception: 'Perception',
  agility: 'Agility',
};

export const ATTRIBUTE_HINTS: Record<AttributeId, string> = {
  strength: 'Max health, carry weight and melee damage.',
  endurance: 'Max energy, thirst and hunger.',
  perception: 'Finding things when searching or gathering.',
  agility: 'Travel speed, climbing and accuracy.',
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
  /** Points one action gives the skill it trains (a building step, a craft, a foraging action, an attack, shot or Protect). */
  points: { fighting: 1, farming: 0, building: 10, foraging: 2, crafting: 10 } satisfies Record<SkillId, number>,
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

/** Max thirst, hunger and energy from the effective Endurance. */
export function maxNeedsFor(attributes: Record<AttributeId, number>): Record<NeedId, number> {
  return {
    thirst: Math.round(80 + attributes.endurance),
    hunger: Math.round(80 + attributes.endurance),
    energy: Math.round(80 + attributes.endurance),
  };
}

/** Full max health of the whole body, from the Strength before any modifiers: being weaker for a while does not make the body more vulnerable. */
export function maxHealthFor(baseStrength: number): number {
  return Math.round(80 + baseStrength);
}

/** Every body part has its own health; the player's health is their sum. */
export const BODY_HEALTH_RULES = {
  /** Each part's share of the full max health. */
  shares: { head: 0.1, torso: 0.3, leftArm: 0.15, rightArm: 0.15, leftLeg: 0.15, rightLeg: 0.15 } satisfies Record<BodyPartId, number>,
  /** Max health a condition takes off its part, as a share of the part's full max health; they add up on the same part. */
  conditionLoss: { injured: 0.25, burnt: 0.25, bandaged: 0.1, fractured: 0.5, splinted: 0.25 } satisfies Partial<
    Record<BodyConditionId, number>
  >,
  /** A part that drops below this share of its full max health becomes Injured; an arm or a leg below the second gets Fractured. */
  injuredBelow: 0.5,
  fracturedBelow: 0.25,
  /** A single hit leaves at least `hitFloor` health on a part that had at least `hitFloorFrom`. */
  hitFloorFrom: 5,
  hitFloor: 1,
} as const;

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

/**
 * Multiplier for the chance of finding things: 1 at 20 perception, rising evenly to `atMax` at 100 (2 unless an action
 * gives its own), and below 1 under 20.
 */
export function perceptionFactor(perception: number, atMax: number = ATTRIBUTE_RULES.perceptionAtMax): number {
  return factorFromBase(perception, atMax);
}

/** A chance improved by Perception (see `perceptionFactor`), at most 95%. */
export function perceptionChance(baseChance: number, perception: number, atMax?: number): number {
  return Math.min(ATTRIBUTE_RULES.maxPerceptionChance, baseChance * perceptionFactor(perception, atMax));
}

/** A multiplier of 1 at the basic attribute value, rising evenly to `atMax` at MAX_ATTRIBUTE and falling below the basic value. */
function factorFromBase(value: number, atMax: number): number {
  return 1 + ((atMax - 1) * (value - BASE_ATTRIBUTE)) / (MAX_ATTRIBUTE - BASE_ATTRIBUTE);
}

/** Chance that an action depending on an attribute succeeds: 30% at 20, half a percent more per point above, less below. */
export function successChance(value: number): number {
  return ATTRIBUTE_RULES.successAtBase + (value - BASE_ATTRIBUTE) * ATTRIBUTE_RULES.successPerPoint;
}

/**
 * Fighting stats. Melee accuracy is (base + bonuses) × the melee Agility factor, melee damage is base + bonuses + the
 * Strength bonus. Ranged stats start from the bow's base instead, use their own Agility factor and ignore Strength.
 * Accuracy bonuses are fractions (0.1 = +10%).
 */
export const FIGHTING_RULES = {
  melee: { accuracy: 0.5, damage: 5 },
  maxAccuracy: 0.95,
  /** Agility multiplies melee accuracy by 1 at the basic value, rising evenly to this at MAX_ATTRIBUTE (0.75 at 0). */
  meleeAgilityAtMax: 2,
  /** Agility multiplies ranged accuracy along a straight line, from the first value at 0 to the second at MAX_ATTRIBUTE. */
  rangedAgility: [0.5, 1.5],
  /** Strength below this takes `strengthDamage` off melee damage; above the basic value, every full step of points adds it. */
  strengthPenaltyBelow: 10,
  strengthPerDamage: 20,
  strengthDamage: 5,
  /** Fighting skill bonuses, for melee and ranged alike: accuracy per level, and damage by level (index). */
  skillAccuracyPerLevel: 0.02,
  skillDamage: [0, 0, 0, 0, 5, 5, 5, 10, 10, 10, 15],
} as const;

/** Melee accuracy multiplier from Agility: 0.75 at 0, 1 at 20, 2 at 100. */
export function meleeAccuracyFactor(agility: number): number {
  return factorFromBase(agility, FIGHTING_RULES.meleeAgilityAtMax);
}

/** Ranged accuracy multiplier from Agility: 0.5 at 0, 0.7 at 20, 1.5 at 100. */
export function rangedAccuracyFactor(agility: number): number {
  const [atZero, atMax] = FIGHTING_RULES.rangedAgility;
  return atZero + ((atMax - atZero) * agility) / MAX_ATTRIBUTE;
}

/** Melee damage Strength adds: −5 below 10, 0 up to 39, then 5 more for every full 20 points (+5 at 40, +20 at 100). */
export function strengthDamage(strength: number): number {
  if (strength < FIGHTING_RULES.strengthPenaltyBelow) {
    return -FIGHTING_RULES.strengthDamage;
  }
  const steps = Math.max(0, Math.floor((strength - BASE_ATTRIBUTE) / FIGHTING_RULES.strengthPerDamage));
  return steps * FIGHTING_RULES.strengthDamage;
}

/** Damage and accuracy the Fighting skill adds at a level (level 10: +15 damage, +20% accuracy). */
export function fightingSkillBonus(level: number): { damage: number; accuracy: number } {
  return { damage: FIGHTING_RULES.skillDamage[level] ?? 0, accuracy: FIGHTING_RULES.skillAccuracyPerLevel * level };
}

/** Fights: turn-based, on a battle field of `fieldSize` spaces (0 is the left edge). Every move is 1 space. */
export const FIGHT_RULES = {
  fieldSize: 12,
  /** The player and the enemy start this many spaces from their edges. */
  startFromEdge: 1,
  /** Chance per turn that a Flee or Fight enemy that has not seen the player moves a space, and that the move is toward the player. */
  wanderChance: 0.1,
  wanderForwardChance: 0.5,
  /** A Fight enemy runs away at or below this share of its health. */
  fleeAtHealth: 0.2,
  /** Armor that Protect adds for the turn, by Fighting level (index). */
  protectArmor: [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3],
  /** A hit does between this share of its max damage (rounded up) and all of it, before Armor and Protect. */
  minDamageShare: 0.7,
  /** How likely each body part is to be hit. */
  hitParts: { leftArm: 0.2, rightArm: 0.2, torso: 0.35, leftLeg: 0.1, rightLeg: 0.1, head: 0.05 } satisfies Record<BodyPartId, number>,
} as const;

/** Armor Protect adds for one turn at a Fighting level: +1, +2 from level 5, +3 at 10. */
export function protectArmor(level: number): number {
  return FIGHT_RULES.protectArmor[level] ?? FIGHT_RULES.protectArmor[0];
}

/** The least damage a hit of the given max damage does: 70% of it, rounded up (7 at 10, 18 at 25). */
export function minDamage(maxDamage: number): number {
  // why: 0.7 × 10 comes out as 7.000000000000001, which would round up to 8.
  return Math.ceil(Math.round(maxDamage * FIGHT_RULES.minDamageShare * 1e6) / 1e6);
}

export const SURVIVAL_RULES = {
  /** Thirst and hunger grow by these amounts per hour. */
  thirstPerHour: 4,
  hungerPerHour: 2,
  /** Hunger and thirst grow slower while sleeping. */
  sleepingDrainFactor: 0.6,
  /**
   * Torso health lost per point of thirst or hunger pushed past the maximum, or per point of energy missing for an action.
   * Keeps dehydration at 1.5 health/hour and starvation at 0.9 health/hour once the bars are full.
   */
  overflowDamage: { thirst: 0.375, hunger: 0.45, energy: 0.3 },
  /** Natural healing only happens while both hunger and thirst are at or below this fraction. */
  healingMaxFraction: 0.5,
  /** Health comes back shared evenly between the body parts; while sleeping, by where the player sleeps (see SLEEP_RULES). */
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

import { ENVIRONMENT_RULES, SLEEP_RULES } from './rules';
import { days, hours } from './time';
import type { AttributeId, BodyCondition, BodyConditionId, BodyPartId, PlayerState, TimedCondition, TimedConditionId } from './types';

export type BodyPartKind = 'head' | 'torso' | 'arm' | 'leg';
export type AttributeModifiers = Partial<Record<AttributeId, number>>;
export type Severity = 'light' | 'medium' | 'heavy';
export const SEVERITIES: readonly Severity[] = ['light', 'medium', 'heavy'];

export const BODY_PARTS: Record<BodyPartId, { name: string; kind: BodyPartKind }> = {
  head: { name: 'Head', kind: 'head' },
  torso: { name: 'Torso', kind: 'torso' },
  leftArm: { name: 'Left arm', kind: 'arm' },
  rightArm: { name: 'Right arm', kind: 'arm' },
  leftLeg: { name: 'Left leg', kind: 'leg' },
  rightLeg: { name: 'Right leg', kind: 'leg' },
};

/** Game minutes a condition spends in each severity before easing to the next lower one. */
export type SeverityStages = Record<Severity, number>;

/** Healing time to start with for a severity: the time it takes to ease all the way down from it. */
export function stagedDuration(stages: SeverityStages, severity: Severity): number {
  const index = SEVERITIES.indexOf(severity);
  return SEVERITIES.slice(0, index + 1).reduce((sum, s) => sum + stages[s], 0);
}

/** Current severity of a staged condition from the healing time it has left. */
export function severityFor(stages: SeverityStages, remaining: number): Severity {
  if (remaining > stages.light + stages.medium) {
    return 'heavy';
  }
  return remaining > stages.light ? 'medium' : 'light';
}

export interface BodyConditionDef {
  id: BodyConditionId;
  name: string;
  description: string;
  allowedOn: readonly BodyPartKind[];
  /** Attribute penalties in percent, per kind of body part. */
  modifiers?: Partial<Record<BodyPartKind, AttributeModifiers>>;
  /** Conditions removed from the body part when this one is applied. */
  replaces: readonly BodyConditionId[];
  /** Never on its own: applying it also applies this condition, unless the part has it already. */
  comesWith?: BodyConditionId;
  /** Healing time in game minutes when applied; undefined means the condition never heals by itself. */
  duration?: number;
  /** Severity stages for conditions that get better over time; replaces `duration`. */
  stages?: SeverityStages;
  /** Healing speed multiplier (2 heals twice as fast). */
  healRate?: number;
  /** Takes over the healing still left on the conditions it replaces, if that is longer than its own duration. */
  inheritsHealing?: boolean;
  /** Torso health lost per hour (negative), whatever part the condition is on. */
  healthPerHour?: Partial<Record<Severity, number>>;
  /** Nothing can be held in the hand of an arm with this condition. */
  blocksEquip?: boolean;
  /** A treatment rather than an ailment (shown in a calmer colour). */
  treated?: boolean;
  /** Logged when the condition heals; {part} is replaced with the body part name. */
  healedMessage?: string;
  /** Logged when the severity eases; {part} and {severity} are replaced. */
  easedMessage?: string;
}

const WOUND_MODIFIERS: Partial<Record<BodyPartKind, AttributeModifiers>> = {
  arm: { strength: -10 },
  leg: { agility: -10 },
  torso: { strength: -10, endurance: -10 },
  head: { endurance: -10, perception: -10 },
};

export const BODY_CONDITIONS: Record<BodyConditionId, BodyConditionDef> = {
  injured: {
    id: 'injured',
    name: 'Injured',
    description: 'An open wound. It heals with time; bandaged, it heals twice as fast and hurts less.',
    allowedOn: ['head', 'torso', 'arm', 'leg'],
    modifiers: WOUND_MODIFIERS,
    replaces: ['bandaged'],
    duration: days(3),
    healedMessage: 'The wound on your {part} has closed up.',
  },
  bleeding: {
    id: 'bleeding',
    comesWith: 'injured',
    name: 'Bleeding',
    description: 'You are losing blood. It slows down and stops with time; a bandage stops it at once.',
    allowedOn: ['head', 'torso', 'arm', 'leg'],
    replaces: ['bandaged'],
    stages: { light: hours(1), medium: hours(1.5), heavy: hours(2) },
    healthPerHour: { light: -0.45, medium: -1.2, heavy: -2.4 },
    healedMessage: 'The bleeding from your {part} has stopped.',
    easedMessage: 'The bleeding from your {part} is slowing down.',
  },
  fractured: {
    id: 'fractured',
    name: 'Fractured',
    description: 'A broken bone. It will not heal until it is splinted.',
    allowedOn: ['arm', 'leg'],
    modifiers: { arm: { strength: -20 }, leg: { agility: -25 } },
    replaces: ['splinted'],
    blocksEquip: true,
  },
  burnt: {
    id: 'burnt',
    name: 'Burnt',
    description: 'A painful burn. It heals with time; bandaged, it heals twice as fast and hurts less.',
    allowedOn: ['head', 'torso', 'arm', 'leg'],
    modifiers: WOUND_MODIFIERS,
    replaces: ['bandaged'],
    duration: days(4),
    healedMessage: 'The burn on your {part} has healed.',
  },
  missing: {
    id: 'missing',
    name: 'Missing',
    description: 'Gone for good.',
    allowedOn: ['arm', 'leg'],
    modifiers: { arm: { strength: -30 }, leg: { agility: -40 } },
    replaces: ['injured', 'bleeding', 'fractured', 'burnt', 'bandaged', 'splinted'],
    blocksEquip: true,
  },
  bandaged: {
    id: 'bandaged',
    name: 'Bandaged',
    description: 'A dressed wound. Still sore, but healing twice as fast.',
    allowedOn: ['head', 'torso', 'arm', 'leg'],
    modifiers: {
      arm: { strength: -4 },
      leg: { agility: -4 },
      torso: { strength: -4, endurance: -4 },
      head: { endurance: -4, perception: -4 },
    },
    replaces: ['injured', 'burnt', 'bleeding'],
    duration: hours(12),
    healRate: 2,
    inheritsHealing: true,
    treated: true,
    healedMessage: 'Your {part} has healed under the bandage.',
  },
  splinted: {
    id: 'splinted',
    name: 'Splinted',
    description: 'A set and immobilised fracture. It will knit in a few days.',
    allowedOn: ['arm', 'leg'],
    modifiers: { arm: { strength: -8 }, leg: { agility: -10 } },
    replaces: ['fractured'],
    duration: days(5),
    blocksEquip: true,
    treated: true,
    healedMessage: 'The bone in your {part} has knitted. You remove the splint.',
  },
};

/** Attribute penalty in percent applied to strength, perception and agility per severity. */
export const DEPRIVATION_PENALTY: Record<Severity, number> = { light: 10, medium: 20, heavy: 35 };

/** Severity by how full the hunger or thirst bar is (1 = at the maximum). */
export function getDeprivationSeverity(fraction: number): Severity | undefined {
  if (fraction > 0.9) {
    return 'heavy';
  }
  if (fraction > 0.75) {
    return 'medium';
  }
  if (fraction > 0.5) {
    return 'light';
  }
  return undefined;
}

export interface TimedConditionDef {
  id: TimedConditionId;
  name: string;
  description: string;
  /** Severity stages for conditions that ease over time; conditions without stages have no severity. */
  stages?: SeverityStages;
  modifiers?: Record<Severity, AttributeModifiers>;
  /** Attribute penalties in percent for conditions without stages. */
  fixedModifiers?: AttributeModifiers;
  /** Torso health lost per hour (negative) by severity. */
  healthPerHour?: Record<Severity, number>;
  easedMessage?: string;
  endMessage: string;
}

/** The same change in percent to every attribute. */
function allAttributes(percent: number): AttributeModifiers {
  return { strength: percent, endurance: percent, perception: percent, agility: percent };
}

const EXPOSURE_MODIFIERS = allAttributes(-ENVIRONMENT_RULES.exposurePenalty);

export const TIMED_CONDITIONS: Record<TimedConditionId, TimedConditionDef> = {
  poisoned: {
    id: 'poisoned',
    name: 'Poisoned',
    description: 'Poison is working through your body, draining your health. It weakens with time.',
    stages: { light: hours(2), medium: hours(2), heavy: hours(2) },
    healthPerHour: { light: -0.3, medium: -0.9, heavy: -1.8 },
    easedMessage: 'The nausea is easing a little.',
    endMessage: 'The nausea fades. The poison has passed through you.',
  },
  dizzy: {
    id: 'dizzy',
    name: 'Dizzy',
    description: 'The world spins. Your senses and reflexes are dulled until it passes.',
    stages: { light: hours(1), medium: hours(1), heavy: hours(1) },
    modifiers: {
      light: { perception: -10, agility: -10 },
      medium: { perception: -20, agility: -20 },
      heavy: { perception: -35, agility: -35 },
    },
    easedMessage: 'The spinning is getting better.',
    endMessage: 'Your head clears.',
  },
  wet: {
    id: 'wet',
    name: 'Wet',
    description: 'Soaked to the skin, so your body temperature is one step colder. You dry by yourself, faster in the heat.',
    endMessage: 'You are dry again.',
  },
  overheated: {
    id: 'overheated',
    name: 'Overheated',
    description: 'Too long in the burning heat. It wears off once you cool down.',
    fixedModifiers: EXPOSURE_MODIFIERS,
    endMessage: 'You have cooled down.',
  },
  freezing: {
    id: 'freezing',
    name: 'Freezing',
    description: 'Too long in the bitter cold. It wears off once you warm up.',
    fixedModifiers: EXPOSURE_MODIFIERS,
    endMessage: 'The warmth comes back into your limbs.',
  },
  awfulSleep: {
    id: 'awfulSleep',
    name: 'Awful Sleep',
    description: 'A night on the bare ground. Every part of you aches. A sleeping mat would help.',
    fixedModifiers: allAttributes(SLEEP_RULES.conditionPercent.awfulSleep),
    endMessage: 'The aches of that awful night have faded.',
  },
  badSleep: {
    id: 'badSleep',
    name: 'Bad Sleep',
    description: 'The sleeping mat beat the bare ground, but not by much. A roof over it would help.',
    fixedModifiers: allAttributes(SLEEP_RULES.conditionPercent.badSleep),
    endMessage: 'You have shaken off the bad night.',
  },
  goodSleep: {
    id: 'goodSleep',
    name: 'Good Sleep',
    description: 'A good night in the hut. You feel rested and strong.',
    fixedModifiers: allAttributes(SLEEP_RULES.conditionPercent.goodSleep),
    endMessage: 'The freshness of a good night has worn off.',
  },
  perfectSleep: {
    id: 'perfectSleep',
    name: 'Perfect Sleep',
    description: 'The best night since the wreck, in a house of your own. You feel ready for anything.',
    fixedModifiers: allAttributes(SLEEP_RULES.conditionPercent.perfectSleep),
    endMessage: 'The glow of a perfect night has worn off.',
  },
};

/** Severity of a stored timed condition, for conditions that have severities. */
export function timedConditionSeverity(condition: TimedCondition): Severity | undefined {
  const stages = TIMED_CONDITIONS[condition.id].stages;
  return stages ? severityFor(stages, condition.remaining) : undefined;
}

/** Makes a timed condition without severities last at least the given minutes from now. */
export function renewTimedCondition(player: PlayerState, id: TimedConditionId, minutes: number): void {
  const existing = player.conditions.find((c) => c.id === id);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, minutes);
  } else {
    player.conditions.push({ id, remaining: minutes });
  }
}

export function hasTimedCondition(player: PlayerState, id: TimedConditionId): boolean {
  return player.conditions.some((c) => c.id === id);
}

export function bodyPartName(part: BodyPartId): string {
  return BODY_PARTS[part].name.toLowerCase();
}

export function hasBodyCondition(player: PlayerState, part: BodyPartId, id: BodyConditionId): boolean {
  return player.body[part].some((c) => c.id === id);
}

export function canHaveCondition(part: BodyPartId, id: BodyConditionId): boolean {
  return BODY_CONDITIONS[id].allowedOn.includes(BODY_PARTS[part].kind);
}

/** Severity of a body condition, for conditions that have severities. */
export function bodyConditionSeverity(condition: BodyCondition): Severity | undefined {
  const stages = BODY_CONDITIONS[condition.id].stages;
  return stages && condition.remaining !== undefined ? severityFor(stages, condition.remaining) : undefined;
}

/** Real game minutes until a body condition heals, or undefined when it does not heal by itself. */
export function bodyConditionHealsIn(condition: BodyCondition): number | undefined {
  return condition.remaining === undefined ? undefined : condition.remaining / (BODY_CONDITIONS[condition.id].healRate ?? 1);
}

function initialRemaining(id: BodyConditionId, severity: Severity, replaced: BodyCondition[]): number | undefined {
  const def = BODY_CONDITIONS[id];
  if (def.stages) {
    return stagedDuration(def.stages, severity);
  }
  if (def.duration === undefined) {
    return undefined;
  }
  if (!def.inheritsHealing) {
    return def.duration;
  }
  return Math.max(def.duration, ...replaced.map((c) => c.remaining ?? 0));
}

/**
 * Applies a body condition following the replacement rules and returns whether it was applied.
 * A staged condition that is already present gets worse (its healing time adds up, capped at the heavy maximum);
 * other conditions restart their healing. A missing body part takes no conditions.
 */
export function applyBodyCondition(player: PlayerState, part: BodyPartId, id: BodyConditionId, severity: Severity = 'medium'): boolean {
  if (!canHaveCondition(part, id) || player.body[part].some((c) => c.id === 'missing')) {
    return false;
  }
  const def = BODY_CONDITIONS[id];
  if (def.comesWith && !player.body[part].some((c) => c.id === def.comesWith)) {
    applyBodyCondition(player, part, def.comesWith);
  }
  // why: read after the condition it comes with, which may have replaced the list.
  const conditions = player.body[part];
  const existing = conditions.find((c) => c.id === id);
  if (existing && def.stages) {
    const added = stagedDuration(def.stages, severity);
    existing.remaining = Math.min(stagedDuration(def.stages, 'heavy'), (existing.remaining ?? 0) + added);
    return true;
  }
  const replaced = conditions.filter((c) => def.replaces.includes(c.id));
  player.body[part] = conditions.filter((c) => c.id !== id && !def.replaces.includes(c.id));
  const remaining = initialRemaining(id, severity, replaced);
  player.body[part].push(remaining === undefined ? { id } : { id, remaining });
  return true;
}

/** Whether the hand of the given arm can hold an item. */
export function canHoldWith(player: PlayerState, arm: 'leftArm' | 'rightArm'): boolean {
  return !player.body[arm].some((c) => BODY_CONDITIONS[c.id].blocksEquip);
}

/** An arm that can still be used to treat wounds or craft (not missing or broken). */
export function hasWorkingArm(player: PlayerState): boolean {
  return (['leftArm', 'rightArm'] as const).some(
    (arm) => !hasBodyCondition(player, arm, 'missing') && !hasBodyCondition(player, arm, 'fractured'),
  );
}

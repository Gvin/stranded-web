import {
  type AttributeModifiers,
  BODY_CONDITIONS,
  BODY_PARTS,
  DEPRIVATION_PENALTY,
  getDeprivationSeverity,
  SEVERITIES,
  type Severity,
  severityFor,
  TIMED_CONDITIONS,
} from './conditions';
import { carriedWeight } from './inventory';
import {
  ATTRIBUTE_NAMES,
  carryCapacityFor,
  MAX_ATTRIBUTE,
  MAX_TOTAL_PENALTY,
  maxStatsFor,
  MIN_EFFECTIVE_ATTRIBUTE,
  SURVIVAL_RULES,
  xpToNextPoint,
} from './rules';
import { ATTRIBUTE_IDS, BODY_PART_IDS, type AttributeId, type GameState, type PlayerState, type StatId } from './types';

export type PlayerConditionId = 'poisoned' | 'dizzy' | 'starving' | 'thirsty';

export interface ActiveCondition {
  id: PlayerConditionId;
  name: string;
  description: string;
  severity?: Severity;
  /** Game minutes until a stored condition wears off completely. */
  endsIn?: number;
  modifiers: AttributeModifiers;
  healthPerHour: number;
  /** Death message used when this condition delivers the final blow. */
  deathCause?: string;
}

export interface AttributeModifierEntry {
  source: string;
  percent: number;
}

export interface AttributeView {
  id: AttributeId;
  name: string;
  base: number;
  xp: number;
  xpToNext: number;
  effective: number;
  /** Total applied modifier in percent. */
  percent: number;
  modifiers: AttributeModifierEntry[];
}

export interface CharacterSheet {
  attributes: Record<AttributeId, AttributeView>;
  max: Record<StatId, number>;
  conditions: ActiveCondition[];
  carryCapacity: number;
  carriedWeight: number;
}

interface SourcedModifiers {
  source: string;
  modifiers: AttributeModifiers;
}

function storedModifiers(player: PlayerState): SourcedModifiers[] {
  const result: SourcedModifiers[] = [];
  for (const part of BODY_PART_IDS) {
    const kind = BODY_PARTS[part].kind;
    for (const condition of player.body[part]) {
      const def = BODY_CONDITIONS[condition.id];
      const modifiers = def.modifiers?.[kind];
      if (modifiers) {
        result.push({ source: `${BODY_PARTS[part].name}: ${def.name}`, modifiers });
      }
    }
  }
  return result;
}

function buildAttributes(player: PlayerState, sources: SourcedModifiers[]): Record<AttributeId, AttributeView> {
  const views = {} as Record<AttributeId, AttributeView>;
  for (const id of ATTRIBUTE_IDS) {
    const modifiers: AttributeModifierEntry[] = [];
    for (const source of sources) {
      const percent = source.modifiers[id];
      if (percent) {
        modifiers.push({ source: source.source, percent });
      }
    }
    const percent = Math.max(
      MAX_TOTAL_PENALTY,
      modifiers.reduce((sum, m) => sum + m.percent, 0),
    );
    const { base, xp } = player.attributes[id];
    const scaled = Math.round(base * (100 + percent)) / 100;
    const effective = Math.min(MAX_ATTRIBUTE, Math.max(MIN_EFFECTIVE_ATTRIBUTE, scaled));
    views[id] = { id, name: ATTRIBUTE_NAMES[id], base, xp, xpToNext: xpToNextPoint(base), effective, percent, modifiers };
  }
  return views;
}

function effectiveValues(views: Record<AttributeId, AttributeView>): Record<AttributeId, number> {
  return {
    strength: views.strength.effective,
    endurance: views.endurance.effective,
    perception: views.perception.effective,
    agility: views.agility.effective,
  };
}

function deprivationCondition(id: 'starving' | 'thirsty', value: number, max: number): ActiveCondition | undefined {
  const severity = getDeprivationSeverity(value / max);
  if (!severity) {
    return undefined;
  }
  const penalty = -DEPRIVATION_PENALTY[severity];
  const atMaximum = value >= max;
  const starving = id === 'starving';
  return {
    id,
    name: `${starving ? 'Starving' : 'Thirsty'} (${severity})`,
    description: atMaximum
      ? `${starving ? 'Your body is consuming itself' : 'You are dying of dehydration'}. You are losing health.`
      : `${starving ? 'Hunger gnaws at you' : 'Your mouth is dry'}, weakening your body and mind.`,
    severity,
    modifiers: { strength: penalty, perception: penalty, agility: penalty },
    // why: the health loss of a full bar is dealt by the overflow rule in the simulation, not as a condition drain.
    healthPerHour: 0,
    deathCause: starving ? 'You starved to death.' : 'You died of dehydration.',
  };
}

/** Player-wide conditions: stored timed ones plus the ones derived from hunger, thirst and energy. */
function playerConditions(state: GameState, max: Record<StatId, number>): ActiveCondition[] {
  const { player } = state;
  const result: ActiveCondition[] = player.conditions.map((c) => {
    const def = TIMED_CONDITIONS[c.id];
    const severity = severityFor(def.stages, c.remaining);
    return {
      id: c.id,
      name: `${def.name} (${severity})`,
      description: def.description,
      severity,
      endsIn: c.remaining,
      modifiers: def.modifiers?.[severity] ?? {},
      healthPerHour: def.healthPerHour?.[severity] ?? 0,
      deathCause: c.id === 'poisoned' ? 'The poison overwhelmed you.' : undefined,
    };
  });
  const starving = deprivationCondition('starving', player.stats.hunger, max.hunger);
  const thirsty = deprivationCondition('thirsty', player.stats.thirst, max.thirst);
  result.push(...[starving, thirsty].filter((c): c is ActiveCondition => c !== undefined));
  const exhausted = player.stats.energy < max.energy * SURVIVAL_RULES.exhaustionFraction;
  const dizzy = result.find((c) => c.id === 'dizzy');
  const exhaustionSeverity = SURVIVAL_RULES.exhaustionDizziness;
  // why: exhaustion and a stored dizziness are one condition; the worse severity wins.
  if (exhausted && (!dizzy || SEVERITIES.indexOf(dizzy.severity ?? 'light') < SEVERITIES.indexOf(exhaustionSeverity))) {
    const exhaustion: ActiveCondition = {
      id: 'dizzy',
      name: `${TIMED_CONDITIONS.dizzy.name} (${exhaustionSeverity})`,
      description: 'You are so exhausted that the world is spinning. Rest or sleep.',
      severity: exhaustionSeverity,
      endsIn: dizzy?.endsIn,
      modifiers: TIMED_CONDITIONS.dizzy.modifiers?.[exhaustionSeverity] ?? {},
      healthPerHour: 0,
    };
    return [...result.filter((c) => c !== dizzy), exhaustion];
  }
  return result;
}

/**
 * Computes attributes, maximum stats and active conditions for the current state.
 * Runs in two passes: hunger, thirst and energy maxima come from stored conditions only, so the
 * conditions derived from them never feed back into their own thresholds.
 */
export function getCharacterSheet(state: GameState): CharacterSheet {
  const { player } = state;
  const stored = storedModifiers(player);
  const preliminary = buildAttributes(player, stored);
  const preliminaryMax = maxStatsFor(effectiveValues(preliminary));
  const conditions = playerConditions(state, preliminaryMax);
  const attributes = buildAttributes(player, [...stored, ...conditions.map((c) => ({ source: c.name, modifiers: c.modifiers }))]);
  const max = {
    ...maxStatsFor(effectiveValues(attributes)),
    thirst: preliminaryMax.thirst,
    hunger: preliminaryMax.hunger,
    energy: preliminaryMax.energy,
  };
  return {
    attributes,
    max,
    conditions,
    carryCapacity: carryCapacityFor(attributes.strength.effective),
    carriedWeight: carriedWeight(player),
  };
}

export function getEffectiveAttribute(state: GameState, id: AttributeId): number {
  return getCharacterSheet(state).attributes[id].effective;
}

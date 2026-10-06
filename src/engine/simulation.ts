import { getItemDef } from '../data/items';
import { type ActiveCondition, getCharacterSheet } from './character';
import { BODY_CONDITIONS, bodyConditionSeverity, bodyPartName, TIMED_CONDITIONS, timedConditionSeverity } from './conditions';
import { appendLog, formatAmount } from './context';
import type { TimeMode } from './definitions';
import { getBodyTemperature, temperatureId, updateEnvironment } from './environment';
import { ENVIRONMENT_RULES, ITEM_WEAR_PER_DAY, SURVIVAL_RULES } from './rules';
import { changeStat } from './stats';
import { MINUTES_PER_DAY } from './time';
import { BODY_PART_IDS, EQUIP_SLOTS, type GameState, STAT_IDS } from './types';
import { getLocationState, removeExpiredGroundItems } from './world';

interface HealthDrain {
  perHour: number;
  deathCause: string;
  /** Damage that was already taken from health when it was dealt. */
  alreadyApplied?: boolean;
}

// Keyed by "condition:severity"; a plain condition id is the fallback for every severity.
const CONDITION_ONSET: Record<string, string> = {
  'thirsty:light': 'Your mouth is getting dry. You are thirsty.',
  'thirsty:medium': 'Your throat burns. You are very thirsty.',
  'thirsty:heavy': 'You are desperately thirsty. Find water, now!',
  'starving:light': 'Your stomach growls. You are hungry.',
  'starving:medium': 'Hunger gnaws at you. You are starving.',
  'starving:heavy': 'You are weak with hunger. Eat something, now!',
  dizzy: 'Your head is spinning. You feel dizzy.',
  poisoned: 'A wave of nausea hits you. You have been poisoned.',
  wet: 'The rain soaks you to the skin. You are wet.',
  overheated: 'The heat is too much for you. You are overheated.',
  freezing: 'You cannot stop shivering. You are freezing.',
};

const SEVERITY_RANK = { light: 1, medium: 2, heavy: 3 } as const;

function conditionRank(condition: ActiveCondition): number {
  return condition.severity ? SEVERITY_RANK[condition.severity] : 1;
}

/** Severity rank per active player condition, used to detect conditions that appeared or worsened. */
export function snapshotConditions(state: GameState): Map<string, number> {
  return new Map(getCharacterSheet(state).conditions.map((c) => [c.id, conditionRank(c)]));
}

/** Logs a warning for every player condition that appeared or got worse since the snapshot. */
export function logWorsenedConditions(state: GameState, before: Map<string, number>): void {
  for (const condition of getCharacterSheet(state).conditions) {
    const message = CONDITION_ONSET[`${condition.id}:${condition.severity}`] ?? CONDITION_ONSET[condition.id];
    if (message && conditionRank(condition) > (before.get(condition.id) ?? 0)) {
      appendLog(state, message, 'bad');
    }
  }
}

export function killPlayer(state: GameState, deathCause: string): void {
  state.status = 'dead';
  state.deathCause = deathCause;
  state.player.stats.health = 0;
  appendLog(state, deathCause, 'bad');
}

/** Keeps every stat within [0, max]; maxima shift as attributes change. */
export function clampStats(state: GameState): void {
  const { max } = getCharacterSheet(state);
  for (const id of STAT_IDS) {
    state.player.stats[id] = Math.min(max[id], Math.max(0, state.player.stats[id]));
  }
}

function isSheltered(state: GameState): boolean {
  return getLocationState(state, state.player.locationId).buildings.hut !== undefined;
}

function collectHealthDrains(state: GameState, conditions: ActiveCondition[]): HealthDrain[] {
  const drains: HealthDrain[] = [];
  for (const part of BODY_PART_IDS) {
    for (const condition of state.player.body[part]) {
      const severity = bodyConditionSeverity(condition) ?? 'medium';
      const perHour = BODY_CONDITIONS[condition.id].healthPerHour?.[severity];
      if (perHour) {
        drains.push({ perHour, deathCause: 'You bled to death.' });
      }
    }
  }
  for (const condition of conditions) {
    if (condition.healthPerHour < 0) {
      drains.push({ perHour: condition.healthPerHour, deathCause: condition.deathCause ?? 'Your body gave out.' });
    }
  }
  return drains;
}

/**
 * Lets body and timed conditions heal for the given minutes; logs eased severities and healed conditions.
 * Being wet dries faster while the environment is hot.
 */
function healConditions(state: GameState, minutes: number, environmentTemperature: number): void {
  const { player } = state;
  for (const part of BODY_PART_IDS) {
    player.body[part] = player.body[part].filter((condition) => {
      if (condition.remaining === undefined) {
        return true;
      }
      const def = BODY_CONDITIONS[condition.id];
      const severityBefore = bodyConditionSeverity(condition);
      condition.remaining -= minutes * (def.healRate ?? 1);
      if (condition.remaining <= 0) {
        if (def.healedMessage) {
          appendLog(state, def.healedMessage.replace('{part}', bodyPartName(part)), 'good');
        }
        return false;
      }
      if (def.easedMessage && bodyConditionSeverity(condition) !== severityBefore) {
        appendLog(state, def.easedMessage.replace('{part}', bodyPartName(part)), 'good');
      }
      return true;
    });
  }
  player.conditions = player.conditions.filter((condition) => {
    const def = TIMED_CONDITIONS[condition.id];
    const severityBefore = timedConditionSeverity(condition);
    const rate = condition.id === 'wet' && environmentTemperature > 0 ? ENVIRONMENT_RULES.wetHotDryingRate : 1;
    condition.remaining -= minutes * rate;
    if (condition.remaining <= 0) {
      appendLog(state, def.endMessage, 'good');
      return false;
    }
    if (def.easedMessage && timedConditionSeverity(condition) !== severityBefore) {
      appendLog(state, def.easedMessage, 'good');
    }
    return true;
  });
}

/** Worn items lose health; one that reaches 0 falls apart and is gone. */
function wearOutEquipment(state: GameState, minutes: number): void {
  const { equipment } = state.player;
  for (const slot of EQUIP_SLOTS) {
    const item = equipment[slot];
    if (item?.health === undefined) {
      continue;
    }
    item.health -= (minutes / MINUTES_PER_DAY) * ITEM_WEAR_PER_DAY;
    if (item.health <= 0) {
      delete equipment[slot];
      appendLog(state, `Your ${getItemDef(item.itemId).name.toLowerCase()} fell apart. It is gone.`, 'bad', { alert: true });
    }
  }
}

function tick(state: GameState, minutes: number, mode: TimeMode): void {
  const sheet = getCharacterSheet(state);
  const temperature = getBodyTemperature(state);
  const rates = ENVIRONMENT_RULES.rates[temperatureId(temperature.value)];
  const { stats } = state.player;
  const elapsedHours = minutes / 60;
  const drainFactor = mode === 'sleeping' ? SURVIVAL_RULES.sleepingDrainFactor : 1;

  const drains = collectHealthDrains(state, sheet.conditions);
  for (const id of ['thirst', 'hunger'] as const) {
    const perHour = id === 'thirst' ? SURVIVAL_RULES.thirstPerHour * rates.thirst : SURVIVAL_RULES.hungerPerHour * rates.hunger;
    const change = changeStat(state, id, perHour * drainFactor * elapsedHours, sheet.max[id]);
    if (change.damage > 0) {
      drains.push({ perHour: -change.damage / elapsedHours, deathCause: change.deathCause ?? 'Your body gave out.', alreadyApplied: true });
    }
  }
  const wellFed =
    stats.hunger <= sheet.max.hunger * SURVIVAL_RULES.healingMaxFraction &&
    stats.thirst <= sheet.max.thirst * SURVIVAL_RULES.healingMaxFraction;
  const regen = drains.length === 0 && wellFed ? SURVIVAL_RULES.healthRegenPerHour[mode] : 0;
  const pending = drains.filter((d) => !d.alreadyApplied).reduce((sum, d) => sum + d.perHour, 0);
  stats.health += (regen + pending) * elapsedHours;

  let energyRegen = SURVIVAL_RULES.energyRegenPerHour[mode];
  if (mode === 'sleeping' && isSheltered(state)) {
    energyRegen += SURVIVAL_RULES.shelteredSleepEnergyBonusPerHour;
  }
  stats.energy += energyRegen * elapsedHours;

  state.time += minutes;
  clampStats(state);

  if (stats.health <= 0) {
    const worst = drains.reduce<HealthDrain | undefined>((a, d) => (!a || d.perHour < a.perHour ? d : a), undefined);
    killPlayer(state, worst?.deathCause ?? 'Your body gave out.');
    return;
  }
  healConditions(state, minutes, temperature.environment);
  wearOutEquipment(state, minutes);
  updateEnvironment(state, minutes, temperature.value);
}

/** Simulates the passing of time in small steps: survival drains, regeneration, healing, decay and death. */
export function advanceTime(state: GameState, minutes: number, mode: TimeMode): void {
  let remaining = minutes;
  while (remaining > 0 && state.status === 'alive') {
    const step = Math.min(SURVIVAL_RULES.tickMinutes, remaining);
    tick(state, step, mode);
    remaining -= step;
  }
  for (const item of removeExpiredGroundItems(state)) {
    appendLog(state, `The ${formatAmount(item.itemId, item.quantity).toLowerCase()} you left here ${verbForDecay(item.itemId)}.`, 'info');
  }
}

function verbForDecay(itemId: string): string {
  return getItemDef(itemId).category === 'food' ? 'has rotted away' : 'is gone';
}

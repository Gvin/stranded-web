import { getItemDef } from '../data/items';
import { getCharacterSheet } from './character';
import { applyBodyCondition, BODY_CONDITIONS, bodyPartName, type Severity, stagedDuration, TIMED_CONDITIONS } from './conditions';
import type { AttributeXp, ObjectDef } from './definitions';
import { addToInventory, countItem, learnItem, releaseBlockedHands, removeFromInventory } from './inventory';
import { nextRandom, pickRandom, randomInt, rollChance } from './random';
import {
  ATTRIBUTE_NAMES,
  MAX_ATTRIBUTE,
  perceptionChance,
  SKILL_NAMES,
  SKILL_RULES,
  successChance,
  SURVIVAL_RULES,
  xpToNextPoint,
} from './rules';
import { findChanceFactor, gatheredFactor, skillLevel } from './skills';
import { changeStat } from './stats';
import { dropOnGround, ensureLocationState, getStock, takeStock } from './world';
import {
  ATTRIBUTE_IDS,
  type AttributeId,
  type BodyConditionId,
  type BodyPartId,
  type GameState,
  type LocationState,
  type LogTone,
  type SkillId,
  type StatId,
  type TimedConditionId,
} from './types';

/** API available to content code while an action resolves. All changes go to the state being built. */
export interface ActionContext {
  readonly state: GameState;
  /** Adds a log line; an alert also shows in a popup. */
  log(text: string, tone?: LogTone, options?: { alert?: boolean }): void;
  random(): number;
  chance(probability: number): boolean;
  randomInt(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Current effective attribute value. */
  attribute(id: AttributeId): number;
  /** Rolls whether an action that depends on the attribute succeeds (see `successChance`). */
  succeeds(attribute: AttributeId): boolean;
  /**
   * Chance of a find: the base chance scaled by perception (capped at 95%) and by the Foraging skill.
   * Without perception, only the Foraging skill counts (capped at 100%).
   */
  findChance(baseChance: number, options?: { perception?: boolean }): number;
  /** Gathered items with the Foraging bonus; a fraction of an item becomes one more item with that chance. */
  gathered(quantity: number): number;
  stat(id: StatId): number;
  maxStat(id: StatId): number;
  /**
   * Changes a stat within [0, max] and returns the actual change. Thirst or hunger pushed past the maximum,
   * or energy below 0, cost health instead.
   */
  changeStat(id: StatId, delta: number): number;
  /** Removes health; the cause is shown if this kills the player. */
  damage(amount: number, deathCause: string): void;
  countItem(itemId: string): number;
  /** Adds items to the bag; whatever does not fit is left on the ground. Items that wear out come at full health unless given. */
  addItem(itemId: string, quantity?: number, options?: { silent?: boolean; health?: number; lit?: boolean }): void;
  /** Adds several items at once, like `addItem`, with a single line for everything left on the ground. */
  addItems(items: readonly { itemId: string; quantity: number }[]): void;
  removeItem(itemId: string, quantity?: number): boolean;
  /** Applies a body condition; the severity only matters for conditions that have severities. */
  addBodyCondition(part: BodyPartId, id: BodyConditionId, severity?: Severity): boolean;
  /** Adds a timed condition with severities, or makes an existing one worse. */
  addTimedCondition(id: TimedConditionId, severity: Severity): void;
  hasFlag(flag: string): boolean;
  setFlag(flag: string): void;
  /** State of the location the player is currently in. */
  location(): LocationState;
  /** Remaining stock of the object the action belongs to (or of one of its named stocks). */
  stock(stockName?: string): number;
  /** Takes stock from the object the action belongs to; returns how much was taken. */
  takeStock(amount: number, stockName?: string): number;
  train(xp: AttributeXp): void;
  /** Death message of the last damage dealt by the action, if any. */
  readonly lastDamageCause: string | undefined;
}

export function appendLog(state: GameState, text: string, tone: LogTone = 'neutral', options?: { alert?: boolean }): void {
  state.log.push({ id: state.nextId++, time: state.time, text, tone, ...(options?.alert ? { alert: true } : {}) });
  if (state.log.length > SURVIVAL_RULES.maxLogEntries) {
    state.log.splice(0, state.log.length - SURVIVAL_RULES.maxLogEntries);
  }
}

/** "Rope", "3× Rope", or with the health left of an item that wears out, "Clothes (59/100)". */
export function formatAmount(itemId: string, quantity: number, health?: number): string {
  const { name, maxHealth } = getItemDef(itemId);
  const withHealth = health !== undefined && maxHealth !== undefined ? `${name} (${formatHealth(health)}/${maxHealth})` : name;
  return quantity === 1 ? withHealth : `${quantity}× ${withHealth}`;
}

/** Puts what fits of the items into the bag, saying so unless silent, leaves the rest on the ground and returns how many were left. */
function putInBag(
  state: GameState,
  itemId: string,
  quantity: number,
  options?: { silent?: boolean; health?: number; lit?: boolean },
): number {
  const def = getItemDef(itemId);
  const sheet = getCharacterSheet(state);
  const free = Math.max(0, sheet.carryCapacity - sheet.carriedWeight);
  const fits = def.weight > 0 ? Math.min(quantity, Math.floor(free / def.weight + 1e-9)) : quantity;
  addToInventory(state.player, itemId, fits, options?.health, options?.lit);
  if (quantity > 0) {
    learnItem(state.player, itemId);
  }
  if (fits > 0 && !options?.silent) {
    appendLog(state, `+ ${formatAmount(itemId, fits)}`, 'good');
  }
  if (fits < quantity) {
    dropOnGround(state, state.player.locationId, itemId, quantity - fits, options?.health, options?.lit);
  }
  return Math.max(0, quantity - fits);
}

/** "a, b and c". */
export function listText(parts: readonly string[]): string {
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');
}

/** One log line for everything that did not fit into the bag, e.g. "You leave 4 logs, 10 sticks and a lump of resin on the ground." */
function logLeftOnGround(state: GameState, amounts: readonly string[]): void {
  appendLog(state, `You can't carry any more. You leave ${listText(amounts)} on the ground.`, 'bad');
}

/** An amount of an item in a sentence: "a stick", "3 sticks", "a torch (80/100)". */
export function itemAmount(itemId: string, quantity: number, health?: number): string {
  const { singular, plural, maxHealth } = getItemDef(itemId);
  const text = quantity === 1 ? singular : `${quantity} ${plural}`;
  return health !== undefined && maxHealth !== undefined ? `${text} (${formatHealth(health)}/${maxHealth})` : text;
}

/** A single item named as one the player knows: "the leaf", "the bunch of grass". */
export function theItem(itemId: string): string {
  return getItemDef(itemId).singular.replace(/^(a|an) /, 'the ');
}

/** Health for display; rounds up, so an item that is still there never reads 0. */
export function formatHealth(health: number): number {
  return Math.ceil(health - 1e-9);
}

/** Adds the practice of one action to a skill and raises its level when enough is collected; logs every new level. */
export function trainSkill(state: GameState, id: SkillId): void {
  const skill = state.player.skills[id];
  if (skill.level >= SKILL_RULES.maxLevel) {
    return;
  }
  skill.points += SKILL_RULES.points[id];
  while (skill.level < SKILL_RULES.maxLevel && skill.points >= SKILL_RULES.pointsPerLevel) {
    skill.points -= SKILL_RULES.pointsPerLevel;
    skill.level += 1;
    appendLog(state, `Your ${SKILL_NAMES[id]} skill has improved to ${skill.level}.`, 'good');
  }
  if (skill.level >= SKILL_RULES.maxLevel) {
    skill.points = 0;
  }
}

/** Adds training points and raises base attributes when enough are collected; logs every improvement. */
export function trainAttributes(state: GameState, xp: AttributeXp): void {
  for (const id of ATTRIBUTE_IDS) {
    const amount = xp[id];
    if (!amount) {
      continue;
    }
    const attribute = state.player.attributes[id];
    if (attribute.base >= MAX_ATTRIBUTE) {
      continue;
    }
    attribute.xp += amount;
    while (attribute.base < MAX_ATTRIBUTE && attribute.xp >= xpToNextPoint(attribute.base)) {
      attribute.xp -= xpToNextPoint(attribute.base);
      attribute.base += 1;
      appendLog(state, `Your ${ATTRIBUTE_NAMES[id]} has improved to ${attribute.base}.`, 'good');
    }
    if (attribute.base >= MAX_ATTRIBUTE) {
      attribute.xp = 0;
    }
  }
}

export function createActionContext(state: GameState, object?: ObjectDef): ActionContext {
  const objectLocationId = state.player.locationId;
  let lastDamageCause: string | undefined;

  const requireObject = (): ObjectDef => {
    if (!object) {
      throw new Error('This action does not belong to an object');
    }
    return object;
  };

  const ctx: ActionContext = {
    state,
    log: (text, tone, options) => appendLog(state, text, tone, options),
    random: () => nextRandom(state),
    chance: (probability) => rollChance(state, probability),
    randomInt: (min, max) => randomInt(state, min, max),
    pick: (items) => pickRandom(state, items),
    attribute: (id) => getCharacterSheet(state).attributes[id].effective,
    succeeds: (attribute) => rollChance(state, successChance(ctx.attribute(attribute))),
    findChance: (baseChance, options) => {
      const foraging = findChanceFactor(skillLevel(state.player, 'foraging'));
      if (options?.perception === false) {
        return Math.min(1, baseChance * foraging);
      }
      return perceptionChance(baseChance * foraging, ctx.attribute('perception'));
    },
    gathered: (quantity) => {
      const exact = quantity * gatheredFactor(skillLevel(state.player, 'foraging'));
      const whole = Math.floor(exact + 1e-9);
      // why: no roll without a fraction, so the random sequence only changes once the skill does something.
      return exact - whole > 1e-9 && rollChance(state, exact - whole) ? whole + 1 : whole;
    },
    stat: (id) => state.player.stats[id],
    maxStat: (id) => getCharacterSheet(state).max[id],
    changeStat: (id, delta) => {
      const change = changeStat(state, id, delta);
      if (change.deathCause) {
        lastDamageCause = change.deathCause;
      }
      return change.applied;
    },
    damage: (amount, deathCause) => {
      state.player.stats.health = Math.max(0, state.player.stats.health - amount);
      lastDamageCause = deathCause;
    },
    countItem: (itemId) => countItem(state.player, itemId),
    addItem: (itemId, quantity = 1, options) => {
      const left = putInBag(state, itemId, quantity, options);
      if (left > 0) {
        logLeftOnGround(state, [itemAmount(itemId, left)]);
      }
    },
    addItems: (items) => {
      const left = items.map(({ itemId, quantity }) => ({ itemId, left: putInBag(state, itemId, quantity) })).filter((i) => i.left > 0);
      if (left.length > 0) {
        logLeftOnGround(
          state,
          left.map((i) => itemAmount(i.itemId, i.left)),
        );
      }
    },
    removeItem: (itemId, quantity = 1) => removeFromInventory(state.player, itemId, quantity),
    addBodyCondition: (part, id, severity) => {
      const applied = applyBodyCondition(state.player, part, id, severity);
      if (applied && BODY_CONDITIONS[id].blocksEquip) {
        for (const itemId of releaseBlockedHands(state.player)) {
          appendLog(state, `You can no longer hold the ${getItemDef(itemId).name.toLowerCase()} with your ${bodyPartName(part)}.`, 'bad');
        }
      }
      return applied;
    },
    addTimedCondition: (id, severity) => {
      const { stages } = TIMED_CONDITIONS[id];
      if (!stages) {
        throw new Error(`${id} has no severities`);
      }
      const added = stagedDuration(stages, severity);
      const existing = state.player.conditions.find((c) => c.id === id);
      if (existing) {
        existing.remaining = Math.min(stagedDuration(stages, 'heavy'), existing.remaining + added);
      } else {
        state.player.conditions.push({ id, remaining: added });
      }
    },
    hasFlag: (flag) => state.flags[flag] === true,
    setFlag: (flag) => {
      state.flags[flag] = true;
    },
    location: () => ensureLocationState(state, state.player.locationId),
    stock: (stockName) => getStock(state, objectLocationId, requireObject(), stockName),
    takeStock: (amount, stockName) => takeStock(state, objectLocationId, requireObject(), amount, stockName),
    train: (xp) => trainAttributes(state, xp),
    get lastDamageCause() {
      return lastDamageCause;
    },
  };
  return ctx;
}

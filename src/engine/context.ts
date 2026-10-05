import { getItemDef } from '../data/items';
import { getCharacterSheet } from './character';
import { applyBodyCondition, BODY_CONDITIONS, bodyPartName, type Severity, stagedDuration, TIMED_CONDITIONS } from './conditions';
import type { AttributeXp, ObjectDef } from './definitions';
import { addToInventory, countItem, releaseBlockedHands, removeFromInventory } from './inventory';
import { nextRandom, pickRandom, randomInt, rollChance } from './random';
import { ATTRIBUTE_NAMES, checkChance, MAX_ATTRIBUTE, perceptionFactor, SURVIVAL_RULES, xpToNextPoint } from './rules';
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
  type StatId,
  type TimedConditionId,
} from './types';

/** API available to content code while an action resolves. All changes go to the state being built. */
export interface ActionContext {
  readonly state: GameState;
  log(text: string, tone?: LogTone): void;
  random(): number;
  chance(probability: number): boolean;
  randomInt(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Current effective attribute value. */
  attribute(id: AttributeId): number;
  /** Rolls an attribute check against a difficulty. */
  check(attribute: AttributeId, difficulty: number): boolean;
  /** Scales a base find chance by perception (capped at 95%). */
  findChance(baseChance: number): number;
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
  /** Adds items to the bag; whatever does not fit is left on the ground. */
  addItem(itemId: string, quantity?: number, options?: { silent?: boolean }): void;
  removeItem(itemId: string, quantity?: number): boolean;
  /** Applies a body condition; the severity only matters for conditions that have severities. */
  addBodyCondition(part: BodyPartId, id: BodyConditionId, severity?: Severity): boolean;
  /** Adds a timed condition, or makes an existing one worse. */
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

export function appendLog(state: GameState, text: string, tone: LogTone = 'neutral'): void {
  state.log.push({ id: state.nextId++, time: state.time, text, tone });
  if (state.log.length > SURVIVAL_RULES.maxLogEntries) {
    state.log.splice(0, state.log.length - SURVIVAL_RULES.maxLogEntries);
  }
}

export function formatAmount(itemId: string, quantity: number): string {
  const name = getItemDef(itemId).name;
  return quantity === 1 ? name : `${quantity}× ${name}`;
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
    log: (text, tone) => appendLog(state, text, tone),
    random: () => nextRandom(state),
    chance: (probability) => rollChance(state, probability),
    randomInt: (min, max) => randomInt(state, min, max),
    pick: (items) => pickRandom(state, items),
    attribute: (id) => getCharacterSheet(state).attributes[id].effective,
    check: (attribute, difficulty) => rollChance(state, checkChance(ctx.attribute(attribute), difficulty)),
    findChance: (baseChance) => Math.min(0.95, baseChance * perceptionFactor(ctx.attribute('perception'))),
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
      const def = getItemDef(itemId);
      const sheet = getCharacterSheet(state);
      const free = Math.max(0, sheet.carryCapacity - sheet.carriedWeight);
      const fits = def.weight > 0 ? Math.min(quantity, Math.floor(free / def.weight + 1e-9)) : quantity;
      addToInventory(state.player, itemId, fits);
      if (fits > 0 && !options?.silent) {
        appendLog(state, `+ ${formatAmount(itemId, fits)}`, 'good');
      }
      if (fits < quantity) {
        dropOnGround(state, state.player.locationId, itemId, quantity - fits);
        appendLog(state, `You can't carry any more. You leave ${formatAmount(itemId, quantity - fits)} on the ground.`, 'bad');
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

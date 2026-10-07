import { BODY_CONDITIONS, bodyConditionSeverity, bodyPartName, canHaveCondition, hasBodyCondition, type Severity } from './conditions';
import type { ActionContext } from './context';
import type { GainDef } from './definitions';
import { armorPoints, bestArrow, bestWeapon } from './inventory';
import { fightPower, fightWinChance } from './rules';
import type { BodyPartId, GameState } from './types';
import { getLocationState } from './world';

// Reusable outcome helpers for content actions: loot rolls, injuries and fights.

const SEVERITY_ADVERBS: Record<Severity, string> = { light: 'lightly', medium: 'badly', heavy: 'heavily' };

export const ARMS: readonly BodyPartId[] = ['leftArm', 'rightArm'];
export const LEGS: readonly BodyPartId[] = ['leftLeg', 'rightLeg'];

export interface FindDef {
  itemId: string;
  chance: number;
  quantity?: number | readonly [number, number];
  /** How many times this can ever be found at this location. */
  limit?: number;
  /** The chance is not improved by perception: for what is always there, such as the stones of the scree. */
  fixedChance?: boolean;
  /** Health of a found item that wears out; full when not given. */
  health?: number;
}

function findKey(objectId: string, itemId: string): string {
  return `${objectId}:${itemId}`;
}

/** Whether any of the limited finds of an object can still be found at the location. */
export function hasLimitedFindsLeft(state: GameState, locationId: string, objectId: string, finds: readonly FindDef[]): boolean {
  const taken = getLocationState(state, locationId).finds;
  return finds.some((f) => f.limit !== undefined && (taken[findKey(objectId, f.itemId)] ?? 0) < f.limit);
}

/** Gains to show for a list of finds, leaving out limited finds that are used up. */
export function findGains(state: GameState, locationId: string, objectId: string, finds: readonly FindDef[]): GainDef[] {
  const taken = getLocationState(state, locationId).finds;
  return finds
    .filter((f) => f.limit === undefined || (taken[findKey(objectId, f.itemId)] ?? 0) < f.limit)
    .map((f) => ({ itemId: f.itemId, quantity: f.quantity, chance: f.chance, perception: !f.fixedChance, find: true }));
}

/**
 * Rolls every find independently and adds what was found to the bag; returns whether anything was found.
 * The Foraging skill raises the chances and the quantities, limited finds never beyond what is left.
 */
export function rollFinds(ctx: ActionContext, objectId: string, finds: readonly FindDef[]): boolean {
  const taken = ctx.location().finds;
  let foundAny = false;
  for (const find of finds) {
    const key = findKey(objectId, find.itemId);
    if (find.limit !== undefined && (taken[key] ?? 0) >= find.limit) {
      continue;
    }
    if (!ctx.chance(ctx.findChance(find.chance, { perception: !find.fixedChance }))) {
      continue;
    }
    const [min, max] = typeof find.quantity === 'number' ? [find.quantity, find.quantity] : (find.quantity ?? [1, 1]);
    let quantity = ctx.gathered(ctx.randomInt(min, max));
    if (find.limit !== undefined) {
      quantity = Math.min(quantity, find.limit - (taken[key] ?? 0));
      taken[key] = (taken[key] ?? 0) + quantity;
    }
    ctx.addItem(find.itemId, quantity, { health: find.health });
    foundAny = true;
  }
  return foundAny;
}

export interface InjuryOptions {
  /** Body parts that can be hit; missing ones are skipped. */
  parts: readonly BodyPartId[];
  bleedingChance?: number;
  /** Severity of the bleeding; random (mostly light) when not given. */
  bleedingSeverity?: Severity;
  fractureChance?: number;
  /** Chance that a limb is lost entirely. */
  lossChance?: number;
}

/** Injures one random body part and logs the result; returns the part that was hit. */
export function injure(ctx: ActionContext, options: InjuryOptions): BodyPartId | undefined {
  const candidates = options.parts.filter((p) => !hasBodyCondition(ctx.state.player, p, 'missing'));
  if (candidates.length === 0) {
    return undefined;
  }
  const part = ctx.pick(candidates);
  const applied: string[] = [];
  const apply = (id: Parameters<typeof canHaveCondition>[1], severity?: Severity): void => {
    if (canHaveCondition(part, id) && ctx.addBodyCondition(part, id, severity)) {
      const condition = ctx.state.player.body[part].find((c) => c.id === id);
      const level = condition && bodyConditionSeverity(condition);
      applied.push(`${level ? `${SEVERITY_ADVERBS[level]} ` : ''}${BODY_CONDITIONS[id].name.toLowerCase()}`);
    }
  };
  if (options.lossChance && canHaveCondition(part, 'missing') && ctx.chance(options.lossChance)) {
    apply('missing');
    ctx.log(`Your ${bodyPartName(part)} is gone.`, 'bad');
    return part;
  }
  apply('injured');
  if (options.bleedingChance && ctx.chance(options.bleedingChance)) {
    apply('bleeding', options.bleedingSeverity ?? randomBleeding(ctx));
  }
  if (options.fractureChance && ctx.chance(options.fractureChance)) {
    apply('fractured');
  }
  if (applied.length > 0) {
    ctx.log(`Your ${bodyPartName(part)} is ${joinWords(applied)}.`, 'bad');
  }
  return part;
}

export interface EnemyDef {
  name: string;
  /** Fighting power needed for an even fight. */
  difficulty: number;
  damage: readonly [number, number];
  deathCause: string;
}

/** Damage from a hit; every armor point worn stops one point of it. */
export function hit(ctx: ActionContext, damage: number, deathCause: string): void {
  ctx.damage(Math.max(0, damage - armorPoints(ctx.state.player)), deathCause);
}

/** Resolves a fight using strength, agility and the best held weapon; returns whether the player won. */
export function fight(ctx: ActionContext, enemy: EnemyDef): boolean {
  const weapon = bestWeapon(ctx.state.player);
  const power = fightPower(ctx.attribute('strength'), ctx.attribute('agility'), weapon?.bonus ?? 0);
  if (weapon?.def.needsArrows) {
    fireArrow(ctx);
  }
  const won = ctx.chance(fightWinChance(power, enemy.difficulty));
  if (won) {
    if (ctx.chance(0.25)) {
      hit(ctx, ctx.randomInt(1, Math.ceil(enemy.damage[0] / 2)), enemy.deathCause);
      ctx.log(`The ${enemy.name} catches you with a glancing blow before it goes down.`, 'bad');
    }
    return true;
  }
  hit(ctx, ctx.randomInt(enemy.damage[0], enemy.damage[1]), enemy.deathCause);
  ctx.log(`The ${enemy.name} overpowers you.`, 'bad');
  injure(ctx, { parts: [...LEGS, 'torso', ...ARMS], bleedingChance: 0.5, fractureChance: 0.1 });
  return false;
}

/**
 * Shoots the most accurate arrow in the bag and returns its accuracy bonus.
 * The arrow may be lost; call only when an arrow is available.
 */
export function fireArrow(ctx: ActionContext): number {
  const arrow = bestArrow(ctx.state.player);
  if (!arrow?.arrow) {
    return 0;
  }
  if (ctx.chance(arrow.arrow.lossChance)) {
    ctx.removeItem(arrow.id);
    ctx.log(`Your ${arrow.name.toLowerCase()} is lost.`, 'info');
  }
  return arrow.arrow.accuracy;
}

function randomBleeding(ctx: ActionContext): Severity {
  const roll = ctx.random();
  return roll < 0.5 ? 'light' : roll < 0.85 ? 'medium' : 'heavy';
}

function joinWords(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

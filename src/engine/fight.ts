import { ENEMIES, ENEMY_ORDER } from '../data/enemies';
import { getItemDef } from '../data/items';
import type { GameAction } from './actions';
import { isFatallyHurt } from './body';
import { bodyPartName, hasBodyCondition } from './conditions';
import type { ActionContext } from './context';
import type { EnemyDef, WeaponStats } from './definitions';
import { type FightingStat, getFightingStats, weaponHand } from './fighting';
import { armorPoints } from './inventory';
import { FIGHT_RULES, minDamage, protectArmor } from './rules';
import type { BodyConditionId, BodyPartId, EnemyId, FightState, GameState, LogTone } from './types';

// Fights: each of the player's actions is a turn, after which the enemy acts. Time, thirst, hunger and energy stand still.

const LAST_SPACE = FIGHT_RULES.fieldSize - 1;

/** What happened in one side's part of a turn; `after` runs once the turn is logged, so its own messages follow. */
interface TurnPart {
  said: string[];
  tone?: LogTone;
  /** Armor the player's Protect adds against the enemy's part of this turn. */
  protect?: number;
  after?: () => void;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The damage of one hit, from 70% of the max damage (rounded up) to all of it. */
function rollDamage(ctx: ActionContext, maxDamage: number): number {
  return maxDamage <= 0 ? 0 : ctx.randomInt(minDamage(maxDamage), maxDamage);
}

/** The damage a hit can do, e.g. "7–10". */
export function damageRange(maxDamage: number): string {
  const least = minDamage(maxDamage);
  return least === maxDamage ? String(maxDamage) : `${least}–${maxDamage}`;
}

/** "the rabbit". */
export function theEnemy(enemy: EnemyDef): string {
  return `the ${enemy.name.toLowerCase()}`;
}

/** Spaces between the player and the enemy; 1 means they stand next to each other. */
export function fightDistance(fight: FightState): number {
  return fight.enemyAt - fight.playerAt;
}

/** A Flee enemy always runs once it has seen the player; a Fight enemy only at low health. */
function isFleeing(fight: FightState, enemy: EnemyDef): boolean {
  return enemy.pattern === 'flee' || (enemy.pattern === 'fight' && fight.enemyHealth <= enemy.health * FIGHT_RULES.fleeAtHealth);
}

/** Starts a fight with the player and the enemy one space from their edges. */
export function startFight(state: GameState, enemyId: EnemyId): void {
  state.fight = {
    enemyId,
    enemyHealth: ENEMIES[enemyId].health,
    playerAt: FIGHT_RULES.startFromEdge,
    enemyAt: LAST_SPACE - FIGHT_RULES.startFromEdge,
    seen: false,
  };
}

/** Follows a found trail to an enemy picked by the trail chances and starts the fight; when hunting, the player acts first. */
export function startHunt(ctx: ActionContext): void {
  let roll = ctx.random();
  let enemyId = ENEMY_ORDER[ENEMY_ORDER.length - 1] as EnemyId;
  for (const id of ENEMY_ORDER) {
    roll -= ENEMIES[id].trailChance;
    if (roll < 0) {
      enemyId = id;
      break;
    }
  }
  startFight(ctx.state, enemyId);
  ctx.log(`You find a fresh trail and follow it to ${ENEMIES[enemyId].singular}.`, 'good');
}

/** The body part a hit lands on, by the hit chances; a missing limb is never picked, so its chance goes to the other parts. */
function pickHitPart(ctx: ActionContext): BodyPartId {
  const parts = (Object.entries(FIGHT_RULES.hitParts) as [BodyPartId, number][]).filter(
    ([part]) => !hasBodyCondition(ctx.state.player, part, 'missing'),
  );
  let roll = ctx.random() * parts.reduce((sum, [, chance]) => sum + chance, 0);
  for (const [part, chance] of parts) {
    roll -= chance;
    if (roll < 0) {
      return part;
    }
  }
  return 'torso';
}

const CONDITION_WORDS: Partial<Record<BodyConditionId, string>> = { injured: 'Injured', fractured: 'Fractured' };

/** The enemy's hit: Armor and Protect take a point of damage each, then the rest goes to the body part it lands on. */
function attackPlayer(ctx: ActionContext, enemy: EnemyDef, attack: WeaponStats, protect: number): TurnPart {
  const name = capitalize(theEnemy(enemy));
  if (!ctx.chance(attack.accuracy)) {
    return { said: [`${name} attacks and misses.`] };
  }
  const player = ctx.state.player;
  const damage = Math.max(0, rollDamage(ctx, attack.damage) - armorPoints(player) - protect);
  const worn = wearWornOnHit(ctx);
  if (damage === 0) {
    return { said: [`${name} hits you, but your armor takes it all.`], after: worn };
  }
  const part = pickHitPart(ctx);
  const result = ctx.damage(part, damage, `${capitalize(enemy.singular)} killed you.`, { singleHit: true });
  if (isFatallyHurt(player)) {
    delete ctx.state.fight;
  }
  const words = result.conditions.map((id) => CONDITION_WORDS[id]).filter((word) => word !== undefined);
  const hit = `${name} hits your ${bodyPartName(part)} for ${damage}${words.length > 0 ? `: ${words.join(', ')}` : ''}.`;
  const lost = result.conditions.includes('missing') ? [`Your ${bodyPartName(part)} is gone.`] : [];
  return {
    said: [hit, ...lost],
    tone: 'bad',
    after: () => {
      for (const itemId of result.released) {
        ctx.log(`You can no longer hold the ${getItemDef(itemId).name.toLowerCase()} with your ${bodyPartName(part)}.`, 'bad');
      }
      worn();
    },
  };
}

/**
 * A hit that lands wears down what the player wears on the head and the body; what reaches 0 falls apart. Returns what
 * logs that, to run once the turn is logged.
 */
function wearWornOnHit(ctx: ActionContext): () => void {
  const { equipment } = ctx.state.player;
  const fallen: string[] = [];
  for (const slot of ['head', 'body'] as const) {
    const item = equipment[slot];
    if (item?.health === undefined) {
      continue;
    }
    item.health -= FIGHT_RULES.wornWearPerHit;
    if (item.health <= 0) {
      delete equipment[slot];
      fallen.push(getItemDef(item.itemId).name.toLowerCase());
    }
  }
  return () => {
    for (const name of fallen) {
      ctx.log(`Your ${name} fell apart. It is gone.`, 'bad', { alert: true });
    }
  };
}

/** Before it has seen the player, a Flee or Fight enemy now and then moves a space, either way, but never off the field. */
function wander(ctx: ActionContext, fight: FightState, enemy: EnemyDef): void {
  if ((enemy.pattern !== 'flee' && enemy.pattern !== 'fight') || !ctx.chance(FIGHT_RULES.wanderChance)) {
    return;
  }
  const to = fight.enemyAt + (ctx.chance(FIGHT_RULES.wanderForwardChance) ? -1 : 1);
  if (to > fight.playerAt && to <= LAST_SPACE) {
    fight.enemyAt = to;
  }
}

function enemyTurn(ctx: ActionContext, fight: FightState, enemy: EnemyDef, protect: number): TurnPart {
  if (fightDistance(fight) <= enemy.vision) {
    fight.seen = true;
  }
  if (!fight.seen) {
    wander(ctx, fight, enemy);
    return { said: [] };
  }
  const name = capitalize(theEnemy(enemy));
  if (isFleeing(fight, enemy)) {
    if (fight.enemyAt >= LAST_SPACE) {
      delete ctx.state.fight;
      return { said: [`${name} gets away.`] };
    }
    fight.enemyAt += 1;
    return { said: [`${name} runs away from you.`] };
  }
  if (enemy.pattern === 'passive' || !enemy.attack) {
    return { said: [] };
  }
  if (fightDistance(fight) === 1) {
    return attackPlayer(ctx, enemy, enemy.attack, protect);
  }
  if (enemy.pattern === 'fight') {
    fight.enemyAt -= 1;
    return { said: [`${name} comes at you.`] };
  }
  return { said: [] };
}

/** Killing the enemy ends the fight and gives its rewards. */
function win(ctx: ActionContext, enemy: EnemyDef): TurnPart {
  delete ctx.state.fight;
  const rewards = enemy.rewards.map(({ itemId, quantity }) => ({
    itemId,
    quantity: typeof quantity === 'number' ? quantity : ctx.randomInt(quantity[0], quantity[1]),
  }));
  return { said: [`You kill ${theEnemy(enemy)}.`], tone: 'good', after: () => ctx.addItems(rewards) };
}

/** Plays a turn: the player's part, then the enemy's unless the fight is over; the whole turn is logged in one line. */
function playTurn(ctx: ActionContext, playerPart: (fight: FightState, enemy: EnemyDef) => TurnPart): void {
  const fight = ctx.state.fight;
  if (!fight) {
    return;
  }
  const enemy = ENEMIES[fight.enemyId];
  const mine = playerPart(fight, enemy);
  const theirs =
    fight.enemyHealth <= 0 ? win(ctx, enemy) : ctx.state.fight ? enemyTurn(ctx, fight, enemy, mine.protect ?? 0) : { said: [] };
  const said = [...mine.said, ...theirs.said];
  if (said.length > 0) {
    ctx.log(said.join(' '), theirs.tone ?? mine.tone ?? 'neutral');
  }
  mine.after?.();
  theirs.after?.();
}

/** The enemy's part of a turn, after the player spent theirs on something else, such as changing weapons; `said` is what that was. */
export function passTurn(ctx: ActionContext, said: string[] = []): void {
  playTurn(ctx, () => ({ said }));
}

function strike(ctx: ActionContext, fight: FightState, enemy: EnemyDef, stat: FightingStat, verb: 'hit' | 'shoot'): TurnPart {
  const name = theEnemy(enemy);
  if (!ctx.chance(stat.accuracy)) {
    return { said: [verb === 'shoot' ? `You shoot at ${name} and miss.` : `You swing at ${name} and miss.`] };
  }
  const worn = wearWeapon(ctx, verb === 'shoot' ? 'ranged' : 'melee');
  if (stat.damage <= 0) {
    return { said: [`You hit ${name}, but too weakly to hurt it.`], after: worn };
  }
  const damage = rollDamage(ctx, stat.damage);
  fight.enemyHealth = Math.max(0, fight.enemyHealth - damage);
  return { said: [`You ${verb} ${name} for ${damage}.`], after: worn };
}

/**
 * A hit wears down the weapon it is made with: the melee weapon or the bow in the weapon hand (bare hands wear nothing).
 * A weapon at 0 falls apart. Returns what logs that, to run once the turn is logged.
 */
function wearWeapon(ctx: ActionContext, kind: 'melee' | 'ranged'): () => void {
  const { player } = ctx.state;
  const hand = weaponHand(player);
  const item = hand ? player.equipment[hand] : undefined;
  const def = item ? getItemDef(item.itemId) : undefined;
  if (!hand || !item || item.health === undefined || def?.category !== 'equipment' || !def[kind]) {
    return () => {};
  }
  item.health -= FIGHT_RULES.weaponWearPerHit;
  if (item.health > 0) {
    return () => {};
  }
  delete player.equipment[hand];
  return () => ctx.log(`Your ${def.name.toLowerCase()} fell apart. It is gone.`, 'bad', { alert: true });
}

/** Every shot uses up an arrow from the arrow slot; the arrow is always lost. */
function useArrow(ctx: ActionContext): void {
  const arrows = ctx.state.player.arrows;
  if (!arrows) {
    return;
  }
  arrows.quantity -= 1;
  if (arrows.quantity <= 0) {
    delete ctx.state.player.arrows;
  }
}

/** The player's actions in a fight; each one is a turn, after which the enemy acts. */
export function fightActions(state: GameState): GameAction[] {
  const fight = state.fight;
  if (!fight) {
    return [];
  }
  const enemy = ENEMIES[fight.enemyId];
  const name = theEnemy(enemy);
  const stats = getFightingStats(state);
  const nextToIt = fightDistance(fight) === 1;
  const armor = protectArmor(state.player.skills.fighting.level);
  const base = {
    category: 'fight' as const,
    minutes: 0,
    energy: 0,
    timeMode: 'awake' as const,
    requirements: [],
    targetId: fight.enemyId,
  };
  const actions: GameAction[] = [
    {
      ...base,
      id: 'fight:wait',
      label: 'Wait',
      description: `Let ${name} act.`,
      run: (ctx) => playTurn(ctx, () => ({ said: ['You wait.'] })),
    },
    {
      ...base,
      id: 'fight:chase',
      label: 'Chase',
      description: `Move a space toward ${name}.`,
      block: () => (nextToIt ? `You are right next to ${name}` : undefined),
      run: (ctx) =>
        playTurn(ctx, (f) => {
          f.playerAt += 1;
          return { said: [`You move toward ${name}.`] };
        }),
    },
    {
      ...base,
      id: 'fight:flee',
      label: 'Flee',
      description:
        fight.playerAt === 0
          ? 'Get away and end the fight.'
          : 'Move a space back. From the left edge of the field, the next Flee gets you away.',
      run: (ctx) =>
        playTurn(ctx, (f) => {
          if (f.playerAt === 0) {
            delete ctx.state.fight;
            return { said: ['You get away.'] };
          }
          f.playerAt -= 1;
          return { said: ['You back away.'] };
        }),
    },
    {
      ...base,
      id: 'fight:attack',
      label: 'Attack',
      description: `Strike ${name} with what you hold in your weapon hand.`,
      gains: [{ label: `Hit for ${damageRange(stats.melee.damage)}`, chance: stats.melee.accuracy }],
      skill: 'fighting',
      block: () => {
        if (!nextToIt) {
          return `${capitalize(name)} is not next to you`;
        }
        return enemy.flying ? `${capitalize(name)} is flying: only a shot can reach it` : undefined;
      },
      run: (ctx) => playTurn(ctx, (f) => strike(ctx, f, enemy, getFightingStats(ctx.state).melee, 'hit')),
    },
    {
      ...base,
      id: 'fight:protect',
      label: 'Protect',
      description: `+${armor} Armor until your next turn.`,
      skill: 'fighting',
      run: (ctx) => playTurn(ctx, () => ({ said: ['You cover yourself.'], protect: armor })),
    },
  ];
  const ranged = stats.ranged;
  if (ranged) {
    actions.push({
      ...base,
      id: 'fight:shoot',
      label: 'Shoot',
      description: `Shoot an arrow at ${name}, at any distance. The arrow is lost.`,
      gains: 'blocked' in ranged ? undefined : [{ label: `Hit for ${damageRange(ranged.damage)}`, chance: ranged.accuracy }],
      skill: 'fighting',
      block: () => ('blocked' in ranged ? ranged.blocked : undefined),
      run: (ctx) =>
        playTurn(ctx, (f) => {
          const shot = getFightingStats(ctx.state).ranged as FightingStat;
          useArrow(ctx);
          f.seen = true;
          return strike(ctx, f, enemy, shot, 'shoot');
        }),
    });
  }
  return actions;
}

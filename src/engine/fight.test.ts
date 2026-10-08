import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../data/enemies';
import { getActions, getBlockedReason } from './actions';
import { damagePart, fullPartHealth, isLimb } from './body';
import { applyBodyCondition } from './conditions';
import { createActionContext } from './context';
import { startFight, startHunt } from './fight';
import { findAction, performAction } from './game';
import { minDamage, protectArmor } from './rules';
import { createTestGame, giveItem } from './testUtils';
import { BODY_PART_IDS, type BodyPartId, type EnemyId, type FightState, type GameState } from './types';

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

interface Setup {
  player?: number;
  enemy?: number;
  seen?: boolean;
  health?: number;
}

function fightWith(enemyId: EnemyId, setup: Setup = {}, seed = 1): GameState {
  const state = createTestGame('forest', seed);
  startFight(state, enemyId);
  const fight = state.fight as FightState;
  fight.playerAt = setup.player ?? fight.playerAt;
  fight.enemyAt = setup.enemy ?? fight.enemyAt;
  fight.seen = setup.seen ?? false;
  fight.enemyHealth = setup.health ?? fight.enemyHealth;
  return state;
}

const blockedReason = (state: GameState, actionId: string) => {
  const action = findAction(state, actionId);
  return action ? getBlockedReason(state, action) : 'missing action';
};
const lastText = (state: GameState) => state.log.at(-1)?.text ?? '';
const count = (state: GameState, itemId: string) => state.player.inventory.find((s) => s.itemId === itemId)?.quantity ?? 0;

/** The monkey's hits over many seeds, while the player waits next to it: the turn's log line and the state after it. */
function monkeyHits(
  prepare: (state: GameState) => void = () => {},
  seeds: readonly number[] = SEEDS,
): { text: string; state: GameState }[] {
  return seeds
    .map((seed) => {
      const state = fightWith('monkey', { player: 5, enemy: 6, seen: true }, seed);
      prepare(state);
      const next = performAction(state, 'fight:wait');
      return { text: next.log.filter((e) => e.text.includes('The monkey hits your')).at(-1)?.text ?? '', state: next };
    })
    .filter((hit) => hit.text !== '');
}

const PART_NAMES: Record<string, BodyPartId> = {
  head: 'head',
  torso: 'torso',
  'left arm': 'leftArm',
  'right arm': 'rightArm',
  'left leg': 'leftLeg',
  'right leg': 'rightLeg',
};
const hitPart = (text: string) => PART_NAMES[/hits your ([a-z ]+?) for/.exec(text)?.[1] ?? ''] as BodyPartId;

describe('starting a fight', () => {
  it('follows a found trail to an enemy one space from the right edge, with the player one space from the left', () => {
    // Arrange
    const state = createTestGame('forest');

    // Act
    startHunt(createActionContext(state));

    // Assert
    expect(state.fight).toMatchObject({ playerAt: 1, enemyAt: 10, seen: false });
    expect(state.fight?.enemyHealth).toBeGreaterThan(0);
  });

  it('leads to seagulls most often and to the monkey least often', () => {
    // Act
    const found = Array.from({ length: 2000 }, (_, i) => {
      const state = createTestGame('forest', i + 1);
      startHunt(createActionContext(state));
      return state.fight?.enemyId;
    });
    const share = (id: EnemyId) => found.filter((enemyId) => enemyId === id).length / found.length;

    // Assert
    expect(share('seagull')).toBeGreaterThan(0.25);
    expect(share('seagull')).toBeLessThan(0.35);
    expect(share('monkey')).toBeGreaterThan(0.05);
    expect(share('monkey')).toBeLessThan(0.11);
  });
});

describe('fight turns', () => {
  it('offer only the fight actions and changing weapons, and stand time, thirst, hunger and energy still', () => {
    // Arrange
    const state = fightWith('rabbit');
    giveItem(state, 'knife');
    giveItem(state, 'coconut');

    // Act
    const next = performAction(state, 'fight:wait');

    // Assert
    expect(getActions(state).map((a) => a.id)).toEqual([
      'fight:wait',
      'fight:chase',
      'fight:flee',
      'fight:attack',
      'fight:protect',
      'equip:knife#0:leftHand',
      'equip:knife#0:rightHand',
    ]);
    expect(next.time).toBe(state.time);
    expect(next.player.stats).toEqual(state.player.stats);
  });

  it('move you a space toward the enemy, but never through it', () => {
    // Arrange
    const far = fightWith('turtle');
    const close = fightWith('turtle', { player: 4, enemy: 5 });

    // Act
    const chased = performAction(far, 'fight:chase');

    // Assert
    expect(chased.fight?.playerAt).toBe(2);
    expect(blockedReason(close, 'fight:chase')).toBe('You are right next to the turtle');
  });

  it('get you away when you flee from the left edge', () => {
    // Arrange
    const state = fightWith('turtle');

    // Act
    const backed = performAction(state, 'fight:flee');
    const away = performAction(backed, 'fight:flee');

    // Assert
    expect(backed.fight?.playerAt).toBe(0);
    expect(away.fight).toBeUndefined();
    expect(lastText(away)).toBe('You get away.');
  });

  it('let you attack only an enemy next to you, and a flying one not at all', () => {
    // Arrange
    const far = fightWith('turtle', { player: 4, enemy: 6 });
    const flying = fightWith('seagull', { player: 4, enemy: 5 });

    // Act
    const reasons = [far, flying].map((state) => blockedReason(state, 'fight:attack'));

    // Assert
    expect(reasons).toEqual(['The turtle is not next to you', 'The seagull is flying: only a shot can reach it']);
  });

  it('hit with the melee damage of the weapon hand', () => {
    // Act
    const healths = SEEDS.slice(0, 40).map((seed) => {
      const state = fightWith('turtle', { player: 4, enemy: 5 }, seed);
      state.player.equipment.rightHand = { itemId: 'knife' };
      state.player.attributes.agility.base = 100;
      return performAction(state, 'fight:attack').fight?.enemyHealth;
    });

    // Assert
    const hits = healths.filter((h) => h !== 25);
    expect(hits.length).toBeGreaterThan(30);
    expect(new Set(hits)).toEqual(new Set([15, 16, 17, 18]));
  });

  it('shoot at any distance, using up an arrow that is always lost, and the enemy sees you', () => {
    // Arrange
    const state = fightWith('rabbit');
    state.player.equipment.rightHand = { itemId: 'bow' };
    state.player.arrows = { itemId: 'wooden-arrow', quantity: 3 };

    // Act
    const next = performAction(state, 'fight:shoot');

    // Assert
    expect(next.player.arrows).toEqual({ itemId: 'wooden-arrow', quantity: 2 });
    expect(count(next, 'wooden-arrow')).toBe(0);
    expect(next.fight?.seen).toBe(true);
    expect(blockedReason(fightWith('rabbit', {}), 'fight:shoot')).toBe('missing action');
  });

  it('cannot shoot without arrows in the arrow slot', () => {
    // Arrange
    const state = fightWith('rabbit');
    state.player.equipment.rightHand = { itemId: 'bow' };

    // Act
    const reason = blockedReason(state, 'fight:shoot');

    // Assert
    expect(reason).toBe('No arrows in the arrow slot.');
  });

  it('win at 0 enemy health, ending the fight with its rewards', () => {
    // Act
    const won = SEEDS.map((seed) => {
      const state = fightWith('monkey', { player: 4, enemy: 5, seen: true, health: 1 }, seed);
      state.player.equipment.rightHand = { itemId: 'knife' };
      return performAction(state, 'fight:attack');
    }).find((state) => state.fight === undefined);

    // Assert
    expect(won?.log.some((e) => e.text.endsWith('You kill the monkey.'))).toBe(true);
    expect(won && [count(won, 'raw-meat'), count(won, 'leather')]).toEqual([4, 3]);
  });

  it('train the Fighting skill by 1 for each attack, shot and Protect, but not for Wait, Chase or Flee', () => {
    // Arrange
    const turtle = fightWith('turtle', { player: 4, enemy: 5 });
    const rabbit = fightWith('rabbit');
    rabbit.player.equipment.rightHand = { itemId: 'bow' };
    rabbit.player.arrows = { itemId: 'bad-arrow', quantity: 5 };

    // Act
    const points = [
      performAction(turtle, 'fight:attack'),
      performAction(turtle, 'fight:protect'),
      performAction(rabbit, 'fight:shoot'),
      performAction(rabbit, 'fight:wait'),
      performAction(rabbit, 'fight:chase'),
      performAction(rabbit, 'fight:flee'),
    ].map((state) => state.player.skills.fighting.points);

    // Assert
    expect(points).toEqual([1, 1, 1, 0, 0, 0]);
  });

  it('let you change weapons for a turn, without any time passing', () => {
    // Arrange
    const state = fightWith('snake', { player: 4, enemy: 5, seen: true });
    giveItem(state, 'knife');

    // Act
    const next = performAction(state, 'equip:knife#0:rightHand');

    // Assert
    expect(next.player.equipment.rightHand).toEqual({ itemId: 'knife', health: 50 });
    expect(next.time).toBe(state.time);
    expect(lastText(next)).toMatch(/^You take the knife in your right hand\. The snake (attacks and misses|hits your)/);
  });

  it('offer no clothes and no lighting, but changing arrows, which also costs a turn', () => {
    // Arrange
    const state = fightWith('snake', { player: 4, enemy: 5, seen: true });
    giveItem(state, 'makeshift-hat');
    giveItem(state, 'torch');
    giveItem(state, 'wooden-arrow', 4);

    // Act
    const ids = getActions(state).map((a) => a.id);
    const next = performAction(state, 'equip-arrows:wooden-arrow');

    // Assert
    expect(ids.filter((id) => !id.startsWith('fight:'))).toEqual([
      'equip:torch#0:leftHand',
      'equip:torch#0:rightHand',
      'equip-arrows:wooden-arrow',
    ]);
    expect(next.player.arrows).toEqual({ itemId: 'wooden-arrow', quantity: 4 });
    expect(lastText(next)).toMatch(/^You put 4 wooden arrows in the arrow slot\. The snake /);
  });
});

describe('enemies', () => {
  it('that flee run once they see you, and get away off the right edge', () => {
    // Arrange
    const state = fightWith('rabbit', { player: 5, enemy: 10 });

    // Act
    const ran = performAction(state, 'fight:wait');
    const gone = performAction(ran, 'fight:wait');

    // Assert
    expect(ran.fight).toMatchObject({ enemyAt: 11, seen: true });
    expect(lastText(ran)).toBe('You wait. The rabbit runs away from you.');
    expect(gone.fight).toBeUndefined();
    expect(lastText(gone)).toBe('You wait. The rabbit gets away.');
  });

  it('that flee or fight move now and then before they see you, but never off the field, while the others stay put', () => {
    // Act
    const rabbits = SEEDS.map((seed) => performAction(fightWith('rabbit', { enemy: 11 }, seed), 'fight:wait').fight?.enemyAt);
    const turtles = SEEDS.map((seed) => performAction(fightWith('turtle', { enemy: 11 }, seed), 'fight:wait').fight?.enemyAt);
    const moved = rabbits.filter((at) => at === 10).length / SEEDS.length;

    // Assert
    expect(new Set(rabbits)).toEqual(new Set([10, 11]));
    expect(moved).toBeGreaterThan(0.02);
    expect(moved).toBeLessThan(0.1);
    expect(new Set(turtles)).toEqual(new Set([11]));
  });

  it('that stand attack only when you are next to them', () => {
    // Act
    const near = SEEDS.slice(0, 20).map((seed) => lastText(performAction(fightWith('snake', { player: 4, enemy: 5 }, seed), 'fight:wait')));
    const apart = lastText(performAction(fightWith('snake', { player: 3, enemy: 5 }), 'fight:wait'));

    // Assert
    expect(near.every((text) => /The snake (attacks and misses|hits your)/.test(text))).toBe(true);
    expect(apart).toBe('You wait.');
  });

  it('that fight come at you once they see you, and run away at 20% health', () => {
    // Arrange
    const fresh = fightWith('monkey', { player: 1, enemy: 8 });
    const hurt = fightWith('monkey', { player: 4, enemy: 5, seen: true, health: 4 });

    // Act
    const closer = performAction(fresh, 'fight:wait');
    const running = performAction(hurt, 'fight:wait');

    // Assert
    expect(closer.fight?.enemyAt).toBe(7);
    expect(lastText(closer)).toBe('You wait. The monkey comes at you.');
    expect(running.fight?.enemyAt).toBe(6);
  });
});

describe('getting hit', () => {
  it('loses a point of damage for every Armor point, and Protect adds +1, +2 from Fighting 5, +3 at 10', () => {
    // Arrange
    const hits = (action: string) =>
      SEEDS.slice(0, 30).map((seed) => {
        const state = fightWith('snake', { player: 4, enemy: 5 }, seed);
        state.player.equipment.body = { itemId: 'rope-armor', health: 100 };
        return lastText(performAction(state, action));
      });

    // Act
    const waiting = hits('fight:wait');
    const protecting = hits('fight:protect');

    // Assert
    // why: the snake hits for 5 or 6; the rope armor's 2 points leave 3 or 4, and Protect's 1 more leaves 2 or 3.
    expect(waiting.some((text) => text.includes(' hits your '))).toBe(true);
    expect(waiting.every((text) => /The snake (attacks and misses|hits your [a-z ]+ for [34]\.)/.test(text))).toBe(true);
    expect(protecting.some((text) => text.includes(' hits your '))).toBe(true);
    expect(protecting.every((text) => /The snake (attacks and misses|hits your [a-z ]+ for [23]\.)/.test(text))).toBe(true);
    expect([0, 4, 5, 9, 10].map(protectArmor)).toEqual([1, 1, 2, 2, 3]);
  });

  it('land on the arms most often and on the head least often, taking the health of the part they hit', () => {
    // Act
    const hits = monkeyHits();
    const share = (parts: readonly BodyPartId[]) => hits.filter((hit) => parts.includes(hitPart(hit.text))).length / hits.length;

    // Assert
    expect(share(['leftArm', 'rightArm'])).toBeGreaterThan(0.3);
    expect(share(['leftArm', 'rightArm'])).toBeLessThan(0.5);
    expect(share(['head'])).toBeLessThan(0.1);
    expect(hits.every((hit) => hit.state.player.health[hitPart(hit.text)] < fullPartHealth(hit.state.player, hitPart(hit.text)))).toBe(
      true,
    );
  });

  it('take at least three monkey hits to take off an arm', () => {
    // Arrange
    const state = createTestGame();
    const strongest = ENEMIES.monkey.attack?.damage ?? 0;

    // Act
    const gone = [1, 2, 3].map(() => {
      damagePart(state.player, 'leftArm', strongest, { singleHit: true });
      return state.player.body.leftArm.some((c) => c.id === 'missing');
    });
    const limbHits = monkeyHits().filter((hit) => isLimb(hitPart(hit.text)));

    // Assert
    expect(gone).toEqual([false, false, true]);
    expect(limbHits.length).toBeGreaterThan(20);
    expect(limbHits.every((hit) => hit.state.player.health[hitPart(hit.text)] >= 5)).toBe(true);
  });

  it('never pick a missing limb', () => {
    // Act
    const hits = monkeyHits((state) => {
      state.player.body.leftArm = [{ id: 'missing' }];
      state.player.health.leftArm = 0;
    });

    // Assert
    expect(hits.some((hit) => hitPart(hit.text) === 'leftArm')).toBe(false);
  });

  it('take off an arm or a leg that is below 5 health', () => {
    // Act
    const lost = monkeyHits((state) => {
      state.player.health.leftArm = 4;
    }).find((hit) => hitPart(hit.text) === 'leftArm');

    // Assert
    expect(lost?.text).toMatch(/^You wait\. The monkey hits your left arm for \d+\. Your left arm is gone\.$/);
    expect(lost?.state.player.body.leftArm).toEqual([{ id: 'missing' }]);
  });

  it('does between 70% of the max damage, rounded up, and all of it, before Armor', () => {
    // Act
    const least = [0, 5, 10, 15, 25].map(minDamage);
    const rolled = new Set(monkeyHits().map((hit) => Number(/ for (\d+)/.exec(hit.text)?.[1])));

    // Assert
    expect(least).toEqual([0, 4, 7, 11, 18]);
    expect(rolled).toEqual(new Set([7, 8, 9, 10]));
  });

  it('kill you when the torso or the head drops to 0, and the game is lost', () => {
    // Act
    const dead = SEEDS.map((seed) => {
      const state = fightWith('monkey', { player: 4, enemy: 5, seen: true }, seed);
      state.player.health.torso = 4;
      state.player.health.head = 4;
      return performAction(state, 'fight:wait');
    }).find((state) => state.status === 'dead');

    // Assert
    expect(dead?.deathCause).toBe('A monkey killed you.');
    expect(dead?.fight).toBeUndefined();
  });
});

describe('more enemy rules', () => {
  it('keep reacting to you once they have seen you, even beyond their vision', () => {
    // Arrange
    const state = fightWith('monkey', { player: 1, enemy: 10, seen: true });

    // Act
    const next = performAction(state, 'fight:wait');

    // Assert
    expect(next.fight?.enemyAt).toBe(9);
  });

  it('let a fighting enemy move now and then before it sees you', () => {
    // Act
    const monkeys = SEEDS.map((seed) => performAction(fightWith('monkey', { enemy: 11 }, seed), 'fight:wait').fight?.enemyAt);

    // Assert
    expect(new Set(monkeys)).toEqual(new Set([10, 11]));
  });

  it('take the bandage off a bandaged part they wound', () => {
    // Act
    const wounded = SEEDS.map((seed) => {
      const state = fightWith('monkey', { player: 5, enemy: 6, seen: true }, seed);
      for (const part of BODY_PART_IDS) {
        applyBodyCondition(state.player, part, 'bandaged');
      }
      return performAction(state, 'fight:wait');
    }).find((state) => lastText(state).includes('Injured'));
    const parts = BODY_PART_IDS.map((part) => wounded?.player.body[part].map((c) => c.id) ?? []);

    // Assert
    expect(parts.filter((ids) => ids.includes('injured') && !ids.includes('bandaged'))).toHaveLength(1);
    expect(parts.filter((ids) => ids.includes('bandaged'))).toHaveLength(5);
  });

  it('give feathers: 2 to 4 from a seagull, 1 or 2 from a kiwi', () => {
    // Act
    const feathers = (enemyId: EnemyId, weapon: string, action: string) =>
      new Set(
        SEEDS.map((seed) => {
          const state = fightWith(enemyId, { player: 4, enemy: 5, seen: true, health: 1 }, seed);
          state.player.equipment.rightHand = { itemId: weapon };
          state.player.arrows = { itemId: 'stone-arrow', quantity: 1 };
          state.player.attributes.agility.base = 100;
          return performAction(state, action);
        })
          .filter((state) => state.fight === undefined)
          .map((state) => count(state, 'feather')),
      );

    // Assert
    expect(feathers('seagull', 'bow', 'fight:shoot')).toEqual(new Set([2, 3, 4]));
    expect(feathers('kiwi', 'knife', 'fight:attack')).toEqual(new Set([1, 2]));
  });
});

describe('wear in a fight', () => {
  it('takes 1 health off what is worn on the head and the body for every hit that lands, but not for a miss', () => {
    // Arrange
    const turns = SEEDS.slice(0, 40).map((seed) => {
      const state = fightWith('snake', { player: 4, enemy: 5, seen: true }, seed);
      state.player.equipment.head = { itemId: 'leather-hat', health: 100 };
      state.player.equipment.body = { itemId: 'leather-jacket', health: 200 };
      return performAction(state, 'fight:wait');
    });

    // Act
    const worn = turns.map((state) => [state.player.equipment.head?.health, state.player.equipment.body?.health]);
    const missed = turns.map((state) => lastText(state).includes('attacks and misses'));

    // Assert
    expect(missed.some(Boolean)).toBe(true);
    expect(worn.every(([head, body], index) => (missed[index] ? head === 100 && body === 200 : head === 99 && body === 199))).toBe(true);
  });

  it('wears clothes down even when the armor takes all the damage, and lets them fall apart at 0', () => {
    // Arrange
    const hit = SEEDS.map((seed) => {
      const state = fightWith('turtle', { player: 4, enemy: 5, seen: true }, seed);
      state.player.equipment.head = { itemId: 'baseball-hat', health: 1 };
      state.player.equipment.body = { itemId: 'leather-jacket', health: 200 };
      return performAction(state, 'fight:wait');
    }).find((state) => lastText(state).includes('fell apart'));

    // Assert
    expect(hit?.player.equipment.head).toBeUndefined();
    expect(hit?.player.equipment.body?.health).toBe(199);
    expect(hit?.log.map((e) => e.text)).toContain('You wait. The turtle hits you, but your armor takes it all.');
    expect(hit?.log.at(-1)).toMatchObject({ text: 'Your baseball hat fell apart. It is gone.', alert: true });
  });
});

describe('weapons wearing out in a fight', () => {
  it('take 1 durability off the weapon for every hit, but none for a miss or with bare hands', () => {
    // Arrange
    const attacks = SEEDS.slice(0, 40).map((seed) => {
      const state = fightWith('monkey', { player: 4, enemy: 5, seen: true }, seed);
      state.player.equipment.rightHand = { itemId: 'knife', health: 50 };
      return performAction(state, 'fight:attack');
    });
    const bare = performAction(fightWith('monkey', { player: 4, enemy: 5, seen: true }), 'fight:attack');

    // Act
    const knives = attacks.map((state) => [
      state.log.some((e) => e.text.startsWith('You hit the monkey')),
      state.player.equipment.rightHand?.health,
    ]);

    // Assert
    expect(knives.some(([hit]) => hit)).toBe(true);
    expect(knives.some(([hit]) => !hit)).toBe(true);
    expect(knives.every(([hit, health]) => health === (hit ? 49 : 50))).toBe(true);
    expect(bare.player.equipment.rightHand).toBeUndefined();
  });

  it('take 1 durability off the bow for every shot that hits', () => {
    // Arrange
    const shots = SEEDS.slice(0, 40).map((seed) => {
      const state = fightWith('rabbit', {}, seed);
      state.player.equipment.rightHand = { itemId: 'bow', health: 100 };
      state.player.arrows = { itemId: 'stone-arrow', quantity: 3 };
      return performAction(state, 'fight:shoot');
    });

    // Act
    const bows = shots.map((state) => [
      state.log.some((e) => e.text.startsWith('You shoot the rabbit')),
      state.player.equipment.rightHand?.health,
    ]);

    // Assert
    expect(bows.some(([hit]) => hit)).toBe(true);
    expect(bows.every(([hit, health]) => health === (hit ? 99 : 100))).toBe(true);
  });

  it('let a weapon fall apart when a hit takes its last durability', () => {
    // Act
    const broken = SEEDS.map((seed) => {
      const state = fightWith('monkey', { player: 4, enemy: 5, seen: true }, seed);
      state.player.equipment.rightHand = { itemId: 'axe', health: 1 };
      return performAction(state, 'fight:attack');
    }).find((state) => state.log.some((e) => e.text === 'Your axe fell apart. It is gone.'));

    // Assert
    expect(broken?.player.equipment.rightHand).toBeUndefined();
    expect(broken?.log.find((e) => e.text === 'Your axe fell apart. It is gone.')?.alert).toBe(true);
  });
});

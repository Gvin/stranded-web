import { describe, expect, it } from 'vitest';
import { getActions, getBlockedReason } from './actions';
import { applyBodyCondition } from './conditions';
import { createActionContext } from './context';
import { startFight, startHunt } from './fight';
import { findAction, performAction } from './game';
import { minDamage, protectArmor, woundChance } from './rules';
import { createTestGame, giveItem } from './testUtils';
import { BODY_PART_IDS, type EnemyId, type FightState, type GameState } from './types';

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

/** The monkey's hits over many seeds, while the player waits next to it. */
function monkeyHits(prepare: (state: GameState) => void = () => {}, seeds: readonly number[] = SEEDS): string[] {
  return seeds
    .map((seed) => {
      const state = fightWith('monkey', { player: 5, enemy: 6, seen: true }, seed);
      prepare(state);
      return lastText(performAction(state, 'fight:wait'));
    })
    .filter((text) => text.includes('The monkey hits your'));
}

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
      'equip:knife:leftHand',
      'equip:knife:rightHand',
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
    const next = performAction(state, 'equip:knife:rightHand');

    // Assert
    expect(next.player.equipment.rightHand).toEqual({ itemId: 'knife' });
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
  it('loses a point of damage for every Armor point, and Protect adds +5, +10 from Fighting 5, +15 at 10', () => {
    // Arrange
    const hits = (action: string) =>
      SEEDS.slice(0, 30).map((seed) => {
        const state = fightWith('snake', { player: 4, enemy: 5 }, seed);
        state.player.equipment.body = { itemId: 'leather-jacket', health: 200 };
        return lastText(performAction(state, action));
      });

    // Act
    const waiting = hits('fight:wait');
    const protecting = hits('fight:protect');

    // Assert
    expect(waiting.some((text) => text.includes(' hits your '))).toBe(true);
    expect(waiting.every((text) => /The snake (attacks and misses|hits your [a-z ]+ for [1-5]\b)/.test(text))).toBe(true);
    expect(protecting.every((text) => /The snake (attacks and misses|hits you, but your armor takes it all)/.test(text))).toBe(true);
    expect([0, 4, 5, 9, 10].map(protectArmor)).toEqual([5, 5, 10, 10, 15]);
  });

  it('wounds 2% of the time per damage point', () => {
    // Act
    const wounds = [5, 15, 25, 60].map(woundChance);

    // Assert
    expect(wounds.map((c) => Math.round(c * 100))).toEqual([10, 30, 50, 100]);
  });

  it('lands on the arms most often, wounds a fresh body part about 40% of the time, and never fractures it', () => {
    // Act
    const hits = monkeyHits();
    const arms = hits.filter((text) => /your (left|right) arm/.test(text)).length / hits.length;
    const wounded = hits.filter((text) => text.includes('Injured')).length / hits.length;

    // Assert
    expect(arms).toBeGreaterThan(0.3);
    expect(arms).toBeLessThan(0.5);
    expect(wounded).toBeGreaterThan(0.35);
    expect(wounded).toBeLessThan(0.65);
    expect(hits.some((text) => text.includes('Fractured'))).toBe(false);
  });

  it('wounds every body part only once; wounding an injured arm or leg again fractures it a quarter of the time', () => {
    // Arrange
    const injured = (state: GameState) => {
      for (const part of BODY_PART_IDS) {
        applyBodyCondition(state.player, part, 'injured');
      }
    };

    // Act
    const hits = monkeyHits(
      injured,
      Array.from({ length: 2000 }, (_, i) => i + 1),
    );
    const onLimbs = hits.filter((text) => /your (left|right) (arm|leg)/.test(text));
    const fractured = onLimbs.filter((text) => text.endsWith(': Fractured.')).length / onLimbs.length;

    // Assert
    expect(hits.some((text) => text.includes('Injured'))).toBe(false);
    expect(hits.some((text) => /your (head|torso) .*Fractured/.test(text))).toBe(false);
    // why: a limb hit is wounded again about 43% of the time at the monkey's 18–25 damage, and a quarter of those fracture.
    expect(fractured).toBeGreaterThan(0.07);
    expect(fractured).toBeLessThan(0.15);
  });

  it('only take the bandage off a bandaged limb they wound, without fracturing it', () => {
    // Act
    const hits = monkeyHits((state) => {
      for (const part of BODY_PART_IDS) {
        applyBodyCondition(state.player, part, 'bandaged');
      }
    });

    // Assert
    expect(hits.some((text) => text.includes('Injured'))).toBe(true);
    expect(hits.some((text) => text.includes('Fractured'))).toBe(false);
  });

  it('does between 70% of the max damage, rounded up, and all of it, before Armor', () => {
    // Act
    const least = [0, 5, 10, 15, 25].map(minDamage);
    const rolled = new Set(monkeyHits().map((text) => Number(/ for (\d+)/.exec(text)?.[1])));

    // Assert
    expect(least).toEqual([0, 4, 7, 11, 18]);
    expect(rolled).toEqual(new Set([18, 19, 20, 21, 22, 23, 24, 25]));
  });

  it('kills you at 0 health, and the game is lost', () => {
    // Act
    const dead = SEEDS.map((seed) => {
      const state = fightWith('monkey', { player: 4, enemy: 5, seen: true }, seed);
      state.player.stats.health = 3;
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

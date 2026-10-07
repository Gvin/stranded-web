import { describe, expect, it } from 'vitest';
import { getActions, getBlockedReason } from './actions';
import { createActionContext } from './context';
import { type FightingStat, getFightingStats } from './fighting';
import { findAction, performAction } from './game';
import { carriedWeight } from './inventory';
import { meleeAccuracyFactor, rangedAccuracyFactor, strengthDamage } from './rules';
import { describeSkill } from './skills';
import { createTestGame, giveItem } from './testUtils';
import type { GameState } from './types';

const blockedReason = (state: GameState, actionId: string) => {
  const action = findAction(state, actionId);
  return action ? getBlockedReason(state, action) : 'missing action';
};
const melee = (state: GameState) => getFightingStats(state).melee;
const ranged = (state: GameState) => getFightingStats(state).ranged as FightingStat;
const rounded = (stat: { accuracy: number; damage: number }) => ({
  accuracy: Math.round(stat.accuracy * 1000) / 1000,
  damage: stat.damage,
});

function holding(itemId: string, hand: 'leftHand' | 'rightHand' = 'rightHand'): GameState {
  const state = createTestGame('beach');
  state.player.equipment[hand] = { itemId };
  return state;
}

function withArrows(state: GameState, itemId: string): GameState {
  giveItem(state, itemId, 5);
  return performAction(state, `equip-arrows:${itemId}`);
}

describe('melee stats', () => {
  it('start at 50% accuracy and 1 damage with bare hands', () => {
    // Arrange
    const state = createTestGame('beach');

    // Act
    const stats = getFightingStats(state);

    // Assert
    expect(stats.weaponHand).toBe('rightHand');
    expect(rounded(stats.melee)).toEqual({ accuracy: 0.5, damage: 1 });
    expect(stats.ranged).toBeUndefined();
  });

  it('add the bonuses of the item in the weapon hand', () => {
    // Act
    const stats = ['knife', 'hammer', 'axe', 'spear', 'torch', 'bow'].map((itemId) => rounded(melee(holding(itemId))));

    // Assert
    expect(stats).toEqual([
      { accuracy: 0.6, damage: 2 },
      { accuracy: 0.4, damage: 3 },
      { accuracy: 0.45, damage: 4 },
      { accuracy: 0.55, damage: 4 },
      { accuracy: 0.6, damage: 2 },
      { accuracy: 0.5, damage: 1 },
    ]);
  });

  it('ignore the item in the left hand while the right arm can hold, and use it once the right arm cannot', () => {
    // Arrange
    const healthy = holding('knife', 'leftHand');
    const fractured = holding('knife', 'leftHand');
    fractured.player.body.rightArm = [{ id: 'fractured' }];

    // Act
    const stats = [healthy, fractured].map((state) => getFightingStats(state));

    // Assert
    expect(stats.map((s) => s.weaponHand)).toEqual(['rightHand', 'leftHand']);
    expect(stats.map((s) => rounded(s.melee))).toEqual([
      { accuracy: 0.5, damage: 1 },
      { accuracy: 0.6, damage: 2 },
    ]);
  });

  it('take a point of damage below 10 Strength and add one for every full 20 points above 20', () => {
    // Act
    const bonuses = [1, 9, 9.9, 10, 20, 39, 40, 59, 60, 80, 100].map(strengthDamage);

    // Assert
    expect(bonuses).toEqual([-1, -1, -1, 0, 0, 0, 1, 1, 2, 3, 4]);
  });

  it('use an Agility factor of 0.75 at 0, 1 at 20 and 2 at 100, while ranged runs straight from 0.5 to 1.5', () => {
    // Act
    const meleeFactors = [0, 20, 100].map(meleeAccuracyFactor);
    const rangedFactors = [0, 20, 100].map(rangedAccuracyFactor);

    // Assert
    expect(meleeFactors).toEqual([0.75, 1, 2]);
    expect(rangedFactors.map((f) => Math.round(f * 100) / 100)).toEqual([0.5, 0.7, 1.5]);
  });

  it('multiply accuracy by Agility, 1.5 at 60 and 2 at 100, but never above 95%', () => {
    // Arrange
    const states = [60, 100].map((agility) => {
      const state = createTestGame('beach');
      state.player.attributes.agility.base = agility;
      return state;
    });

    // Act
    const accuracies = states.map((state) => melee(state).accuracy);

    // Assert
    expect(accuracies[0]).toBeCloseTo(0.75);
    expect(accuracies[1]).toBe(0.95);
  });

  it('add the Fighting skill: +1 damage at level 4, +2 at 7, +3 and +20% accuracy at 10', () => {
    // Arrange
    const states = [4, 7, 10].map((level) => {
      const state = createTestGame('beach');
      state.player.skills.fighting.level = level;
      return state;
    });

    // Act
    const stats = states.map((state) => rounded(melee(state)));

    // Assert
    expect(stats).toEqual([
      { accuracy: 0.58, damage: 2 },
      { accuracy: 0.64, damage: 3 },
      { accuracy: 0.7, damage: 4 },
    ]);
    expect(describeSkill('fighting', 10)).toBe('Damage +3 · accuracy +20%, in melee and with the bow');
  });
});

describe('ranged stats', () => {
  it('need arrows in the arrow slot', () => {
    // Act
    const ranged = getFightingStats(holding('bow')).ranged;

    // Assert
    expect(ranged).toEqual({ blocked: 'No arrows in the arrow slot.' });
  });

  it('start from the bow, add the arrow, and need more Agility to aim', () => {
    // Arrange
    const bad = withArrows(holding('bow'), 'bad-arrow');
    const wooden = withArrows(holding('bow'), 'wooden-arrow');
    const stone = withArrows(holding('bow'), 'stone-arrow');
    const agile = withArrows(holding('bow'), 'stone-arrow');
    agile.player.attributes.agility.base = 100;

    // Act
    const stats = [bad, wooden, stone, agile].map((state) => rounded(ranged(state)));

    // Assert
    expect(stats).toEqual([
      { accuracy: 0.21, damage: 1 },
      { accuracy: 0.315, damage: 1 },
      { accuracy: 0.315, damage: 3 },
      { accuracy: 0.675, damage: 3 },
    ]);
    expect([bad, wooden, stone, agile].map((state) => Math.round(ranged(state).accuracy * 100))).toEqual([21, 32, 32, 68]);
  });

  it('do not grow with Strength, but do with the Fighting skill', () => {
    // Arrange
    const strong = withArrows(holding('bow'), 'bad-arrow');
    strong.player.attributes.strength.base = 100;
    const skilled = withArrows(holding('bow'), 'bad-arrow');
    skilled.player.skills.fighting.level = 10;

    // Act
    const stats = [strong, skilled].map((state) => rounded(ranged(state)));

    // Assert
    expect(stats).toEqual([
      { accuracy: 0.21, damage: 1 },
      { accuracy: 0.35, damage: 4 },
    ]);
  });
});

describe('arrow slot', () => {
  it('takes all arrows of one kind and swaps them for another kind', () => {
    // Arrange
    const state = createTestGame('beach');
    giveItem(state, 'wooden-arrow', 5);
    giveItem(state, 'bad-arrow', 3);

    // Act
    const wooden = performAction(state, 'equip-arrows:wooden-arrow');
    const bad = performAction(wooden, 'equip-arrows:bad-arrow');

    // Assert
    expect(wooden.player.arrows).toEqual({ itemId: 'wooden-arrow', quantity: 5 });
    expect(wooden.player.inventory).toEqual([{ itemId: 'bad-arrow', quantity: 3 }]);
    expect(bad.player.arrows).toEqual({ itemId: 'bad-arrow', quantity: 3 });
    expect(bad.player.inventory).toEqual([{ itemId: 'wooden-arrow', quantity: 5 }]);
    expect(bad.log.at(-1)?.text).toBe('You put 3 bad wooden arrows in the arrow slot and put 5 wooden arrows back in your bag.');
  });

  it('adds new arrows of the same kind to the slot, and puts them all away again', () => {
    // Arrange
    const state = withArrows(createTestGame('beach'), 'wooden-arrow');
    giveItem(state, 'wooden-arrow', 2);

    // Act
    const more = performAction(state, 'equip-arrows:wooden-arrow');
    const away = performAction(more, 'unequip:arrows');

    // Assert
    expect(more.player.arrows).toEqual({ itemId: 'wooden-arrow', quantity: 7 });
    expect(away.player.arrows).toBeUndefined();
    expect(away.player.inventory).toEqual([{ itemId: 'wooden-arrow', quantity: 7 }]);
  });

  it('counts the arrows in the slot as carried weight', () => {
    // Arrange
    const state = createTestGame('beach');
    giveItem(state, 'stone-arrow', 10);

    // Act
    const equipped = performAction(state, 'equip-arrows:stone-arrow');

    // Assert
    expect(carriedWeight(equipped.player)).toBeCloseTo(carriedWeight(state.player));
  });
});

describe('the bow', () => {
  it('takes both hands, putting away what they held', () => {
    // Arrange
    const state = createTestGame('beach');
    state.player.equipment.leftHand = { itemId: 'knife' };
    state.player.equipment.rightHand = { itemId: 'hammer' };
    giveItem(state, 'bow');

    // Act
    const next = performAction(state, 'equip:bow:rightHand');

    // Assert
    expect(
      getActions(state)
        .filter((a) => a.id.startsWith('equip:bow:'))
        .map((a) => [a.id, a.label]),
    ).toEqual([['equip:bow:rightHand', 'Hold in both hands']]);
    expect(next.player.equipment.rightHand).toEqual({ itemId: 'bow' });
    expect(next.player.equipment.leftHand).toBeUndefined();
    expect(next.player.inventory.map((s) => s.itemId).sort()).toEqual(['hammer', 'knife']);
    expect(next.log.at(-1)?.text).toBe('You take the bow in both hands and put away the hammer and the knife.');
  });

  it('keeps the other hand from holding anything, but can be swapped for an item in the right hand', () => {
    // Arrange
    const state = holding('bow');
    giveItem(state, 'knife');

    // Act
    const swapped = performAction(state, 'equip:knife:rightHand');

    // Assert
    expect(blockedReason(state, 'equip:knife:leftHand')).toBe('The bow takes both hands');
    expect(swapped.player.equipment.rightHand).toEqual({ itemId: 'knife' });
    expect(swapped.player.inventory).toEqual([{ itemId: 'bow', quantity: 1 }]);
  });

  it('cannot be held with a fractured, splinted or missing arm', () => {
    // Arrange
    const states = (['fractured', 'splinted', 'missing'] as const).map((id) => {
      const state = createTestGame('beach');
      state.player.body.leftArm = [id === 'splinted' ? { id, remaining: 100 } : { id }];
      giveItem(state, 'bow');
      return state;
    });

    // Act
    const reasons = states.map((state) => blockedReason(state, 'equip:bow:rightHand'));

    // Assert
    expect(reasons).toEqual(Array(3).fill('It needs both arms, and one of them cannot hold anything'));
  });

  it('goes into the bag when either arm breaks', () => {
    // Arrange
    const state = holding('bow');

    // Act
    createActionContext(state).addBodyCondition('leftArm', 'fractured');

    // Assert
    expect(state.player.equipment.rightHand).toBeUndefined();
    expect(state.player.inventory).toEqual([{ itemId: 'bow', quantity: 1 }]);
    expect(getFightingStats(state).ranged).toBeUndefined();
  });
});

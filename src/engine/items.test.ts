import { describe, expect, it } from 'vitest';
import { getBlockedReason } from './actions';
import { createActionContext } from './context';
import { findAction, performAction } from './game';
import { bestWeapon } from './inventory';
import { fireArrow } from './outcomes';
import { createTestGame, giveItem } from './testUtils';
import type { GameState } from './types';

const blockedReason = (state: GameState, actionId: string) => {
  const action = findAction(state, actionId);
  return action ? getBlockedReason(state, action) : 'missing action';
};
const count = (state: GameState, itemId: string) => state.player.inventory.find((s) => s.itemId === itemId)?.quantity ?? 0;

describe('coconuts', () => {
  it('cannot be eaten whole', () => {
    // Arrange
    const state = createTestGame('beach');
    state.player.stats.hunger = 50;
    giveItem(state, 'coconut');

    // Act
    const eat = findAction(state, 'eat:coconut');

    // Assert
    expect(eat).toBeUndefined();
  });

  it('are opened on something heavy, which is kept', () => {
    // Arrange
    const state = createTestGame('beach');
    giveItem(state, 'coconut');
    giveItem(state, 'stone');

    // Act
    const next = performAction(state, 'craft:opened-coconut');

    // Assert
    expect(blockedReason(createTestGame('beach'), 'craft:opened-coconut')).toBe('Requires: Coconut, Something heavy');
    expect(next.player.inventory).toEqual([
      { itemId: 'stone', quantity: 1 },
      { itemId: 'opened-coconut', quantity: 1 },
    ]);
  });

  it('sometimes leave a shell behind when eaten', () => {
    // Arrange
    const results = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((seed) => {
      const state = createTestGame('beach', seed);
      state.player.stats.thirst = 50;
      giveItem(state, 'opened-coconut');
      return state;
    });

    // Act
    const shells = results.map((state) => count(performAction(state, 'eat:opened-coconut'), 'coconut-shell'));

    // Assert
    expect(shells.some((n) => n === 1)).toBe(true);
    expect(shells.some((n) => n === 0)).toBe(true);
    expect(findAction(results[0] as GameState, 'eat:opened-coconut')?.gains?.at(-1)).toEqual({
      label: 'Coconut shell',
      itemId: 'coconut-shell',
      chance: 0.3,
    });
  });
});

describe('arrows', () => {
  it('whittles five bad arrows from a stick, keeping the knife-type tool', () => {
    // Arrange
    const state = createTestGame('beach');
    giveItem(state, 'stick');
    giveItem(state, 'flint');

    // Act
    const next = performAction(state, 'craft:bad-arrow');

    // Assert
    expect(next.player.inventory).toEqual([
      { itemId: 'flint', quantity: 1 },
      { itemId: 'bad-arrow', quantity: 5 },
    ]);
  });

  it('improves arrows with a feather and then a pebble', () => {
    // Arrange
    let state = createTestGame('beach');
    giveItem(state, 'bad-arrow');
    giveItem(state, 'feather');
    giveItem(state, 'pebble');

    // Act
    state = performAction(state, 'craft:wooden-arrow');
    state = performAction(state, 'craft:stone-arrow');

    // Assert
    expect(state.player.inventory).toEqual([{ itemId: 'stone-arrow', quantity: 1 }]);
  });

  it('shoot the best arrow first and lose it now and then', () => {
    // Arrange
    const states = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
      const state = createTestGame('beach', seed);
      giveItem(state, 'bad-arrow', 3);
      giveItem(state, 'stone-arrow', 3);
      return state;
    });

    // Act
    const accuracies = states.map((state) => fireArrow(createActionContext(state)));

    // Assert
    expect(accuracies.every((a) => a === 10)).toBe(true);
    expect(states.every((s) => count(s, 'bad-arrow') === 3)).toBe(true);
    expect(states.some((s) => count(s, 'stone-arrow') === 2)).toBe(true);
    expect(states.some((s) => count(s, 'stone-arrow') === 3)).toBe(true);
  });

  it('make the bow a weapon, the better the arrow the stronger', () => {
    // Arrange
    const state = createTestGame('forest');
    state.player.equipment.leftHand = 'bow';
    const withoutArrows = bestWeapon(state.player);
    giveItem(state, 'bad-arrow');
    const withBadArrow = bestWeapon(state.player)?.bonus;
    giveItem(state, 'stone-arrow');

    // Act
    const withStoneArrow = bestWeapon(state.player)?.bonus;

    // Assert
    expect(withoutArrows).toBeUndefined();
    expect(withBadArrow).toBe(12);
    expect(withStoneArrow).toBe(22);
  });
});

describe('spear', () => {
  it('is crafted from a stick, something sharp and a rope', () => {
    // Arrange
    const state = createTestGame('beach');
    giveItem(state, 'stick');
    giveItem(state, 'flint');
    giveItem(state, 'vine');

    // Act
    const next = performAction(state, 'craft:spear');

    // Assert
    expect(next.player.inventory).toEqual([{ itemId: 'spear', quantity: 1 }]);
  });
});

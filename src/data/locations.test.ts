import { describe, expect, it } from 'vitest';
import { getActions, getBlockedReason } from '../engine/actions';
import { findAction, performAction } from '../engine/game';
import { createTestGame, giveItem } from '../engine/testUtils';
import { days } from '../engine/time';
import type { GameState } from '../engine/types';
import { getLocationView } from '../engine/views';

const blockedReason = (state: GameState, actionId: string) => {
  const action = findAction(state, actionId);
  return action ? getBlockedReason(state, action) : 'missing action';
};
const count = (state: GameState, itemId: string) => state.player.inventory.find((s) => s.itemId === itemId)?.quantity ?? 0;
const actionIds = (state: GameState) => getActions(state).map((a) => a.id);
const withStock = (state: GameState, locationId: string, stock: Record<string, { amount: number; updatedAt: number }>) => {
  state.locations[locationId] = { visited: true, constructions: {}, groundItems: [], stock, finds: {}, buildings: {} };
  return state;
};

describe('beach', () => {
  it('lets the wreckage disappear for good once everything is found', () => {
    // Arrange
    const state = createTestGame('beach');
    state.locations.beach = {
      visited: true,
      constructions: {},
      groundItems: [],
      stock: {},
      finds: {
        'wreckage:cloth': 8,
        'wreckage:log': 4,
        'wreckage:rope': 3,
        'wreckage:ship-biscuit': 6,
        'wreckage:water-bottle': 2,
        'wreckage:knife': 1,
        'wreckage:baseball-hat': 1,
      },
      buildings: {},
    };
    const later = { ...structuredClone(state), time: days(30) };

    // Act
    const objects = getLocationView(later).objects.map((o) => o.id);

    // Assert
    expect(objects).toEqual(['palms']);
    expect(actionIds(later)).not.toContain('obj:wreckage:search');
  });

  it('grows a coconut on the palms every 3 days and drops one every 6 days', () => {
    // Arrange
    const state = withStock(createTestGame('beach'), 'beach', {
      palms: { amount: 0, updatedAt: 0 },
      'palms:fallen': { amount: 0, updatedAt: 0 },
    });
    const almost = { ...structuredClone(state), time: days(3) - 1 };
    const threeDays = { ...structuredClone(state), time: days(3) };
    const sixDays = { ...structuredClone(state), time: days(6) };

    // Act
    const reasons = [
      blockedReason(almost, 'obj:palms:climb'),
      blockedReason(threeDays, 'obj:palms:climb'),
      blockedReason(threeDays, 'obj:palms:fallen'),
      blockedReason(sixDays, 'obj:palms:fallen'),
    ];

    // Assert
    expect(reasons[0]).toMatch(/^Nothing left/);
    expect(reasons[1]).toBeUndefined();
    expect(reasons[2]).toMatch(/^Nothing left/);
    expect(reasons[3]).toBeUndefined();
  });

  it('combs the tideline from the sea until its finds run out', () => {
    // Arrange
    let state = createTestGame('beach');

    // Act
    for (let i = 0; i < 6; i++) {
      state = performAction(state, 'obj:sea:comb');
    }

    // Assert
    expect(blockedReason(state, 'obj:sea:comb')).toMatch(/^Nothing left \(more in /);
    expect(findAction(state, 'obj:sea:comb')?.gains?.map((g) => g.itemId)).toContain('empty-bottle');
    expect(findAction(state, 'obj:sea:comb')?.gains?.map((g) => g.itemId)).toContain('seaweed');
  });

  it('leaves an empty bottle after drinking a bottle of water', () => {
    // Arrange
    const state = createTestGame('beach');
    state.player.stats.thirst = 50;
    giveItem(state, 'water-bottle');

    // Act
    const next = performAction(state, 'eat:water-bottle');

    // Assert
    expect(next.player.inventory).toEqual([{ itemId: 'empty-bottle', quantity: 1 }]);
  });

  it('serves seaweed as salty food', () => {
    // Arrange
    const state = createTestGame('beach');
    state.player.stats.hunger = 50;
    giveItem(state, 'seaweed');

    // Act
    const next = performAction(state, 'eat:seaweed');

    // Assert
    expect(next.player.stats.hunger).toBeLessThan(50);
    expect(next.player.stats.thirst).toBeGreaterThan(3);
  });
});

describe('forest', () => {
  it('offers berries, vines and mushrooms plus grass, sticks and wood', () => {
    // Arrange
    const state = createTestGame('forest');

    // Act
    const objects = getLocationView(state).objects.map((o) => o.id);
    const own = actionIds(state).filter((id) => id.startsWith('obj:location:'));

    // Assert
    expect(objects).toEqual(['berry-bushes', 'vines', 'mushrooms']);
    expect(own).toEqual(['obj:location:grass', 'obj:location:sticks', 'obj:location:chop']);
  });

  it('never runs out of grass', () => {
    // Arrange
    let state = createTestGame('forest');

    // Act
    for (let i = 0; i < 12; i++) {
      state = performAction(state, 'obj:location:grass');
    }

    // Assert
    expect(count(state, 'grass')).toBeGreaterThanOrEqual(24);
    expect(blockedReason(state, 'obj:location:grass')).toBeUndefined();
  });

  it('has only ten sticks lying around, with one more every 6 hours', () => {
    // Arrange
    let state = createTestGame('forest');

    // Act
    for (let i = 0; i < 6; i++) {
      state = performAction(state, 'obj:location:sticks');
    }

    // Assert
    expect(count(state, 'stick')).toBe(10);
    expect(blockedReason(state, 'obj:location:sticks')).toMatch(/^Nothing left \(more in /);
  });

  it('chops two logs with an axe, slowly and at a high energy cost', () => {
    // Arrange
    const state = createTestGame('forest');
    state.player.attributes.strength.base = 60;
    giveItem(state, 'axe');

    // Act
    const next = performAction(state, 'obj:location:chop');

    // Assert
    expect(blockedReason(createTestGame('forest'), 'obj:location:chop')).toBe('Requires: Axe');
    expect(next.time).toBe(120);
    expect(next.player.stats.energy).toBe(75);
    expect(count(next, 'log')).toBe(2);
  });

  it('regrows one mushroom every 3 days', () => {
    // Arrange
    const state = withStock(createTestGame('forest'), 'forest', { mushrooms: { amount: 0, updatedAt: 0 } });
    const later = { ...structuredClone(state), time: days(3) };

    // Act
    const before = blockedReason(state, 'obj:mushrooms:pick');
    const after = blockedReason(later, 'obj:mushrooms:pick');

    // Assert
    expect(before).toMatch(/^Nothing left/);
    expect(after).toBeUndefined();
  });
});

describe('rocks, camp and spring', () => {
  it('lets the player gather stones and pebbles in the rocky interior without limit', () => {
    // Arrange
    let state = createTestGame('rocks');

    // Act
    for (let i = 0; i < 8; i++) {
      state = performAction(state, 'obj:location:pebbles');
    }

    // Assert
    expect(getLocationView(state).objects).toEqual([]);
    expect(actionIds(state).filter((id) => id.startsWith('obj:'))).toEqual(['obj:location:stones', 'obj:location:pebbles']);
    expect(count(state, 'pebble')).toBeGreaterThanOrEqual(16);
    expect(findAction(state, 'obj:location:stones')?.gains?.map((g) => g.itemId)).toEqual(['stone', 'flint']);
  });

  it('keeps the camp empty apart from what the player builds', () => {
    // Act
    const state = createTestGame('camp');

    // Assert
    expect(getLocationView(state).objects).toEqual([]);
    expect(actionIds(state).filter((id) => id.startsWith('obj:'))).toEqual([]);
  });

  it('keeps only the pool at the spring', () => {
    // Act
    const state = createTestGame('spring');

    // Assert
    expect(getLocationView(state).objects.map((o) => o.id)).toEqual(['pool']);
  });
});

import { describe, expect, it } from 'vitest';
import { getActions, getBlockedReason } from './actions';
import { getCharacterSheet } from './character';
import { applyBodyCondition } from './conditions';
import { findAction, performAction } from './game';
import { checkChance } from './rules';
import { createTestGame, giveItem } from './testUtils';
import { getLocationView } from './views';

const blockedReason = (state: ReturnType<typeof createTestGame>, actionId: string) => {
  const action = findAction(state, actionId);
  return action ? getBlockedReason(state, action) : 'missing action';
};

describe('overflow damage', () => {
  it('takes missing energy from health instead of blocking the action', () => {
    // Arrange
    const state = createTestGame('beach');
    state.player.stats.energy = 3;

    // Act
    const next = performAction(state, 'obj:wreckage:search');

    // Assert
    expect(blockedReason(state, 'obj:wreckage:search')).toBeUndefined();
    expect(next.player.stats.energy).toBe(0);
    expect(next.player.stats.health).toBeCloseTo(100 - 2 + 0.5 * 0.5);
    expect(next.log.some((e) => e.text === 'You push yourself past exhaustion. (−2 health)')).toBe(true);
  });

  it('kills the player who pushes past exhaustion with too little health', () => {
    // Arrange
    const state = createTestGame('forest');
    state.player.stats.energy = 0;
    state.player.stats.health = 5;

    // Act
    const next = performAction(state, 'obj:boars:hunt');

    // Assert
    expect(next.status).toBe('dead');
    expect(next.deathCause).toBe('You pushed yourself past exhaustion and collapsed for good.');
  });

  it('turns thirst pushed past the maximum into health damage', () => {
    // Arrange
    const state = createTestGame('beach');
    state.player.stats.thirst = 96;

    // Act
    const next = performAction(state, 'obj:sea:drink');

    // Assert
    const thirstAfterTime = 96 + 4 * (2 / 60);
    expect(next.player.stats.thirst).toBe(100);
    const maxHealth = getCharacterSheet(state).max.health;
    expect(next.player.stats.health).toBeCloseTo(maxHealth - (thirstAfterTime + 8 - 100) * 1.25);
  });
});

describe('sleep', () => {
  it('is only possible with less than 50 energy', () => {
    // Arrange
    const rested = createTestGame('beach');
    rested.player.stats.energy = 50;
    const tired = createTestGame('beach');
    tired.player.stats.energy = 49;

    // Act
    const restedReason = blockedReason(rested, 'sleep');
    const tiredReason = blockedReason(tired, 'sleep');

    // Assert
    expect(restedReason).toBe('You are not tired enough to sleep (energy must be below 50)');
    expect(tiredReason).toBeUndefined();
  });
});

describe('items', () => {
  it('drops items without spending any time', () => {
    // Arrange
    const state = createTestGame('beach');
    giveItem(state, 'stone');

    // Act
    const next = performAction(state, 'drop:stone:one');

    // Assert
    expect(findAction(state, 'drop:stone:one')?.minutes).toBe(0);
    expect(next.time).toBe(state.time);
    expect(next.locations.beach?.groundItems).toHaveLength(1);
  });

  it('starts the game wearing clothes that can be taken off and worn again', () => {
    // Arrange
    const state = createTestGame('beach');

    // Act
    const undressed = performAction(state, 'unequip:body');
    const dressed = performAction(undressed, 'equip:clothes:body');

    // Assert
    expect(state.player.equipment.body).toBe('clothes');
    expect(undressed.player.equipment.body).toBeUndefined();
    expect(undressed.player.inventory).toEqual([{ itemId: 'clothes', quantity: 1 }]);
    expect(dressed.player.equipment.body).toBe('clothes');
  });

  it('keeps clothes on when an arm is fractured', () => {
    // Arrange
    const state = createTestGame('beach');

    // Act
    applyBodyCondition(state.player, 'leftArm', 'fractured');
    applyBodyCondition(state.player, 'rightArm', 'fractured');

    // Assert
    expect(state.player.equipment.body).toBe('clothes');
  });
});

describe('crafting memory', () => {
  it('remembers every recipe the player has made', () => {
    // Arrange
    const state = createTestGame('beach');
    giveItem(state, 'stick');
    giveItem(state, 'flint');

    // Act
    const next = performAction(state, 'craft:knife');

    // Assert
    expect(state.player.craftedRecipes).toEqual([]);
    expect(next.player.craftedRecipes).toEqual(['knife']);
  });
});

describe('action details', () => {
  it('lists the remaining finds of the wreckage with perception-based chances', () => {
    // Arrange
    const state = createTestGame('beach');
    state.locations.beach = { visited: true, groundItems: [], stock: {}, finds: { 'wreckage:knife': 1 }, buildings: {} };

    // Act
    const gains = findAction(state, 'obj:wreckage:search')?.gains ?? [];

    // Assert
    expect(gains.map((g) => g.label)).toEqual(['Cloth ×1–2', 'Log', 'Rope', 'Ship biscuit ×1–2', 'Bottle of water']);
    expect(gains[0]?.chance).toBeCloseTo(0.45);
  });

  it('shows the success chance of an agility check as the chance of the gain', () => {
    // Arrange
    const state = createTestGame('beach');

    // Act
    const gains = findAction(state, 'obj:palms:climb')?.gains;

    // Assert
    expect(gains).toEqual([{ label: 'Coconut ×1–3', chance: checkChance(20, 15) }]);
  });

  it('describes what food does to hunger and thirst', () => {
    // Arrange
    const state = createTestGame('beach');
    state.player.stats.hunger = 50;
    giveItem(state, 'ship-biscuit');

    // Act
    const eat = findAction(state, 'eat:ship-biscuit');

    // Assert
    expect(eat?.gains?.map((g) => g.label)).toEqual(['−18 hunger', '+3 thirst']);
  });
});

describe('coconut palms', () => {
  it('offer fallen coconuts from their own small stock', () => {
    // Arrange
    let state = createTestGame('beach', 3);
    state.player.attributes.perception.base = 100;

    // Act
    for (let i = 0; i < 6; i++) {
      state = performAction(state, 'obj:palms:fallen');
    }

    // Assert
    expect(getLocationView(state).objects.map((o) => o.id)).toEqual(['wreckage', 'palms']);
    expect(state.player.inventory).toEqual([{ itemId: 'coconut', quantity: 2 }]);
    expect(state.locations.beach?.stock['palms:fallen']?.amount).toBe(0);
    expect(blockedReason(state, 'obj:palms:fallen')).toMatch(/^Nothing left \(more in /);
    expect(blockedReason(state, 'obj:palms:climb')).toBeUndefined();
    expect(getActions(state).some((a) => a.id.startsWith('obj:fallen-coconuts'))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { getActions, getBlockedReason } from './actions';
import { getCharacterSheet } from './character';
import { applyBodyCondition } from './conditions';
import { findAction, performAction } from './game';
import { checkChance } from './rules';
import { createTestGame, giveItem } from './testUtils';
import { hours } from './time';
import type { GameState } from './types';
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
    giveItem(state, 'axe');

    // Act
    const next = performAction(state, 'obj:location:chop');

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
  it('is only offered with less than 50 energy', () => {
    // Arrange
    const rested = createTestGame('beach');
    rested.player.stats.energy = 50;
    rested.time = hours(14);
    const tired = structuredClone(rested);
    tired.player.stats.energy = 49;

    // Act
    const sleepActions = (state: GameState) => getActions(state).filter((a) => a.id.startsWith('sleep'));

    // Assert
    expect(sleepActions(rested)).toEqual([]);
    expect(sleepActions(tired).map((a) => a.id)).toEqual(['sleep', 'sleep-till-morning']);
    expect(blockedReason(tired, 'sleep')).toBeUndefined();
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
    const dressed = performAction(undressed, 'equip:clothes#0:body');

    // Assert
    expect(state.player.equipment.body).toEqual({ itemId: 'clothes', health: 60 });
    expect(undressed.player.equipment.body).toBeUndefined();
    expect(undressed.player.inventory).toEqual([{ itemId: 'clothes', quantity: 1, health: expect.closeTo(60, 2) }]);
    expect(dressed.player.equipment.body).toEqual({ itemId: 'clothes', health: expect.closeTo(60, 2) });
  });

  it('keeps clothes on when an arm is fractured', () => {
    // Arrange
    const state = createTestGame('beach');

    // Act
    applyBodyCondition(state.player, 'leftArm', 'fractured');
    applyBodyCondition(state.player, 'rightArm', 'fractured');

    // Assert
    expect(state.player.equipment.body).toEqual({ itemId: 'clothes', health: 60 });
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
    state.locations.beach = { visited: true, constructions: {}, groundItems: [], stock: {}, finds: { 'wreckage:knife': 1 }, buildings: {} };

    // Act
    const gains = findAction(state, 'obj:wreckage:search')?.gains ?? [];

    // Assert
    expect(gains.map((g) => g.label)).toEqual(['Cloth ×1–2', 'Log', 'Rope', 'Ship biscuit ×1–2', 'Bottle of water', 'Baseball hat']);
    expect(gains[0]?.chance).toBeCloseTo(0.45);
  });

  it('shows the success chance of an agility check as the chance of the gain', () => {
    // Arrange
    const state = createTestGame('beach');

    // Act
    const gains = findAction(state, 'obj:palms:climb')?.gains;

    // Assert
    expect(gains).toEqual([{ label: 'Coconut ×1–3', itemId: 'coconut', chance: checkChance(20, 15) }]);
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

describe('round of refinements', () => {
  it('needs both arms and legs unbroken to climb a palm', () => {
    // Arrange
    const splinted = createTestGame('beach');
    splinted.player.body.leftLeg = [{ id: 'splinted', remaining: 100 }];
    const fractured = createTestGame('beach');
    fractured.player.body.rightArm = [{ id: 'fractured' }];
    const healthy = createTestGame('beach');

    // Act
    const reasons = [splinted, fractured, healthy].map((s) => blockedReason(s, 'obj:palms:climb'));

    // Assert
    expect(reasons).toEqual(['Requires: Both arms and legs unbroken', 'Requires: Both arms and legs unbroken', undefined]);
  });

  it('quenches thirst completely at the spring', () => {
    // Arrange
    const state = createTestGame('spring');
    state.player.stats.thirst = 90;

    // Act
    const next = performAction(state, 'obj:pool:drink');

    // Assert
    expect(next.player.stats.thirst).toBe(0);
  });

  it('offers sleeping till 06:00 only in the evening and at night', () => {
    // Arrange
    const evening = createTestGame('beach');
    evening.time = 13 * 60;
    evening.player.stats.energy = 20;
    const morning = createTestGame('beach');
    morning.time = 60;
    morning.player.stats.energy = 20;

    // Act
    const sleep = findAction(evening, 'sleep-till-morning');
    const woke = performAction(evening, 'sleep-till-morning');

    // Assert
    expect(sleep?.minutes).toBe(10 * 60);
    expect(findAction(morning, 'sleep-till-morning')).toBeUndefined();
    expect(woke.time).toBe(23 * 60);
  });

  it('describes type requirements by what is needed, not by listing items', () => {
    // Arrange
    const state = createTestGame('camp');

    // Act
    const workbench = findAction(state, 'build:workbench');

    // Assert
    expect(workbench?.requirements.map((r) => r.describe())).toEqual(['A working arm', '2× Log', '4× Stick', '2× Rope', 'Something sharp']);
  });

  it('crafts an axe from a stick, a rope and something sharp', () => {
    // Arrange
    const state = createTestGame('beach');
    giveItem(state, 'stick');
    giveItem(state, 'vine');
    giveItem(state, 'flint');

    // Act
    const next = performAction(state, 'craft:axe');

    // Assert
    expect(next.player.inventory).toEqual([{ itemId: 'axe', quantity: 1 }]);
  });

  it('relights a cold campfire without a bow', () => {
    // Arrange
    const state = createTestGame('camp');
    state.locations.camp = {
      visited: true,
      constructions: {},
      groundItems: [],
      stock: {},
      finds: {},
      buildings: { campfire: { builtAt: 0, litUntil: 0 } },
    };
    giveItem(state, 'stick', 2);
    giveItem(state, 'grass');

    // Act
    const next = performAction(state, 'campfire:relight');

    // Assert
    expect(next.locations.camp?.buildings.campfire?.litUntil).toBe(15 + 180);
  });
});

import { describe, expect, it } from 'vitest';
import { getActions } from '../engine/actions';
import { performAction } from '../engine/game';
import { createTestGame, giveItem } from '../engine/testUtils';
import { BODY_PART_IDS } from '../engine/types';
import { ITEMS } from './items';
import { getRoutesFrom, LOCATIONS, ROUTES } from './locations';
import { RECIPES } from './recipes';

describe('island content', () => {
  it('connects every location to the map', () => {
    // Arrange
    const state = createTestGame();
    const reached = new Set(['beach']);
    const queue = ['beach'];

    // Act
    while (queue.length > 0) {
      for (const route of getRoutesFrom(queue.shift() as string, state)) {
        if (!reached.has(route.to)) {
          reached.add(route.to);
          queue.push(route.to);
        }
      }
    }

    // Assert
    expect([...reached].sort()).toEqual(LOCATIONS.map((l) => l.id).sort());
  });

  it('references only existing locations and items', () => {
    // Arrange
    const locationIds = new Set(LOCATIONS.map((l) => l.id));

    // Act
    const badRoutes = ROUTES.filter((r) => !r.between.every((id) => locationIds.has(id)));
    const badRecipeItems = RECIPES.flatMap((r) => [...r.ingredients, ...(r.result ? [r.result] : [])]).filter((i) =>
      'itemId' in i ? !ITEMS[i.itemId] : !Object.values(ITEMS).some((d) => d.types?.includes(i.type)),
    );
    const badCooking = Object.values(ITEMS).filter((i) => i.category === 'food' && i.cooksInto && !ITEMS[i.cooksInto]);
    const fuelWithoutBurnTime = Object.values(ITEMS).filter((i) => i.types?.includes('fuel') && !i.fuelMinutes);

    // Assert
    expect(badRoutes).toEqual([]);
    expect(badRecipeItems).toEqual([]);
    expect(badCooking).toEqual([]);
    expect(fuelWithoutBurnTime).toEqual([]);
  });

  it('matches the resource types of the design', () => {
    // Act
    const types = Object.fromEntries(
      Object.values(ITEMS)
        .filter((i) => i.types)
        .map((i) => [i.name, i.types]),
    );

    // Assert
    expect(types).toEqual({
      Stick: ['stick', 'fuel'],
      Stone: ['heavy', 'stone'],
      Log: ['fuel', 'heavy'],
      Grass: ['fuel', 'threads'],
      Vine: ['fuel', 'rope'],
      Rope: ['fuel', 'rope'],
      Flint: ['stone', 'sharp', 'knife'],
      Hammer: ['heavy'],
      Knife: ['knife'],
      Threads: ['threads', 'fuel'],
      Bow: ['fuel'],
      Cloth: ['fuel', 'cloth'],
      Bandage: ['fuel'],
    });
  });

  it('has unique object ids within every location', () => {
    // Act
    const duplicates = LOCATIONS.filter((l) => new Set(l.objects.map((o) => o.id)).size !== l.objects.length);

    // Assert
    expect(duplicates).toEqual([]);
  });

  it.each(LOCATIONS.map((l) => l.id))('performs every action at %s without errors', (locationId) => {
    // Arrange
    const state = createTestGame(locationId);
    state.player.attributes.strength.base = 100;
    for (const id of Object.keys(ITEMS)) {
      giveItem(state, id, 3);
    }
    state.player.equipment = { leftHand: 'knife', rightHand: 'bow' };
    state.player.body.leftLeg = [{ id: 'fractured' }];
    state.player.body.torso = [{ id: 'injured', remaining: 100 }];
    state.locations[locationId] = {
      visited: true,
      groundItems: [{ id: 999, itemId: 'stone', quantity: 2, droppedAt: 0 }],
      stock: {},
      finds: {},
      buildings: {
        campfire: { builtAt: 0, litUntil: 600 },
        storage: { builtAt: 0, items: [{ itemId: 'rope', quantity: 2 }] },
        workbench: { builtAt: 0 },
      },
    };
    state.player.stats.energy = 50;

    // Act
    const actionIds = getActions(state).map((a) => a.id);
    const results = actionIds.flatMap((id) => [1, 2, 3, 4, 5].map((seed) => performAction({ ...state, rng: seed }, id)));

    // Assert
    expect(actionIds.length).toBeGreaterThan(10);
    expect(results.every((r) => r.log.length > 0)).toBe(true);
  });

  it('covers every body part with at least one treatable condition', () => {
    // Act
    const parts = BODY_PART_IDS.filter((part) => {
      const state = createTestGame();
      state.player.body[part] = [{ id: 'injured', remaining: 100 }];
      return getActions(state).some((a) => a.id === `bandage:${part}`);
    });

    // Assert
    expect(parts).toEqual([...BODY_PART_IDS]);
  });
});

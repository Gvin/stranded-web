import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../data/buildings';
import { RECIPES } from '../data/recipes';
import { getActions } from './actions';
import type { ResourceType } from './definitions';
import { performAction } from './game';
import { createTestGame, giveItem } from './testUtils';
import type { BuildingId, GameState, LocationBuildings } from './types';
import { getLocationView } from './views';
import { roofAt } from './world';

/** A test game at the location with the given buildings standing there. */
function at(locationId: string, buildings: LocationBuildings = {}): GameState {
  const state = createTestGame(locationId);
  state.locations[locationId] = { visited: true, constructions: {}, groundItems: [], stock: {}, finds: {}, buildings };
  return state;
}

const ITEM_OF_TYPE: Partial<Record<ResourceType, string>> = {
  stick: 'stick',
  threads: 'threads',
  rope: 'rope',
  cloth: 'cloth',
  stone: 'stone',
  glue: 'resin',
};

/** Gives the player a building's materials and every tool, then builds it step by step. */
function build(state: GameState, id: BuildingId): GameState {
  for (const ingredient of BUILDINGS[id].ingredients) {
    giveItem(state, 'itemId' in ingredient ? ingredient.itemId : (ITEM_OF_TYPE[ingredient.type] ?? ''), ingredient.quantity);
  }
  for (const tool of ['hammer', 'axe', 'knife']) {
    giveItem(state, tool);
  }
  state.player.attributes.strength.base = 100;
  let next = state;
  for (let step = 0; step < BUILDINGS[id].steps; step++) {
    next = performAction(next, `build:${id}`);
  }
  return next;
}

const buildIds = (state: GameState) =>
  getActions(state)
    .filter((a) => a.category === 'build')
    .map((a) => a.id);

describe('building upgrades', () => {
  it('builds a sleeping mat and a shelter wherever the player can stay, but a hut only at the clearing', () => {
    // Arrange
    const beach = at('beach');
    const camp = at('camp', { house: { id: 'shelter', builtAt: 0 } });

    // Act
    const withMat = build(beach, 'sleepingMat');
    const withShelter = build(withMat, 'shelter');

    // Assert
    expect(withMat.locations.beach?.buildings.house?.id).toBe('sleepingMat');
    expect(buildIds(withMat)).toEqual(['build:shelter']);
    expect(withShelter.locations.beach?.buildings.house?.id).toBe('shelter');
    expect(buildIds(withShelter)).toEqual([]);
    expect(buildIds(camp)).toContain('build:hut');
    expect(buildIds(at('path'))).toEqual([]);
  });

  it('gives a roof from the shelter up', () => {
    // Act
    const roofs = (['sleepingMat', 'shelter', 'hut', 'house'] as const).map((id) =>
      roofAt(at('camp', { house: { id, builtAt: 0 } }), 'camp'),
    );

    // Assert
    expect(roofs).toEqual([undefined, 'Shelter', 'Hut', 'House']);
  });

  it('keeps the level below until the upgrade is finished, then replaces it', () => {
    // Arrange
    const state = at('camp', { house: { id: 'sleepingMat', builtAt: 0 } });
    giveItem(state, 'stick', 7);
    giveItem(state, 'threads', 4);
    giveItem(state, 'leaves', 6);
    giveItem(state, 'rope', 2);
    giveItem(state, 'moss', 5);

    // Act
    const started = performAction(state, 'build:shelter');
    let finished = started;
    for (let step = 1; step < 6; step++) {
      finished = performAction(finished, 'build:shelter');
    }

    // Assert
    expect(started.locations.camp?.buildings.house?.id).toBe('sleepingMat');
    expect(getLocationView(started).objects.map((o) => o.name)).toEqual(['Sleeping mat', 'Shelter (unfinished)']);
    expect(finished.locations.camp?.buildings.house).toEqual({ id: 'shelter', builtAt: 6 * 15 });
    expect(getLocationView(finished).objects.map((o) => o.name)).toEqual(['Shelter']);
  });

  it('keeps the stored items when the storage grows, and holds more', () => {
    // Arrange
    const state = at('camp', { storage: { id: 'smallStorage', builtAt: 0, items: [{ itemId: 'stone', quantity: 20 }] } });

    // Act
    const medium = build(state, 'mediumStorage');
    const big = build(medium, 'bigStorage');

    // Assert
    expect(big.locations.camp?.buildings.storage?.items).toEqual([{ itemId: 'stone', quantity: 20 }]);
    expect(getLocationView(medium).objects.find((o) => o.id === 'storage')?.status).toBe('10.0 / 80 kg');
    expect(getLocationView(big).objects.find((o) => o.id === 'storage')).toMatchObject({ name: 'Big storage', status: '10.0 / 150 kg' });
  });

  it("keeps the fire's fuel and flame when it becomes a fireplace and then a furnace", () => {
    // Arrange
    const state = at('camp', { fire: { id: 'campfire', builtAt: 0, fuel: 4, lit: false } });

    // Act
    const fireplace = build(state, 'fireplace');
    const furnace = build(fireplace, 'furnace');

    // Assert
    expect(fireplace.locations.camp?.buildings.fire).toMatchObject({ id: 'fireplace', fuel: 4, lit: false });
    expect(furnace.locations.camp?.buildings.fire).toMatchObject({ id: 'furnace', fuel: 4, lit: false });
  });

  it('keeps a burning fire burning while it becomes a fireplace', () => {
    // Arrange
    const state = at('camp', { fire: { id: 'campfire', builtAt: 0, fuel: 5, lit: true } });

    // Act
    const fireplace = build(state, 'fireplace');

    // Assert
    expect(fireplace.locations.camp?.buildings.fire).toMatchObject({ id: 'fireplace', lit: true });
    expect(fireplace.locations.camp?.buildings.fire?.fuel).toBeCloseTo(5 - 6 * 0.25);
  });

  it('trains a little strength with every building step, and no attributes with crafting', () => {
    // Arrange
    const state = at('camp');
    giveItem(state, 'flint', 2);
    giveItem(state, 'cloth', 4);
    giveItem(state, 'threads', 2);

    // Act
    const crafted = performAction(state, 'craft:pair-of-flints');
    const built = performAction(state, 'build:sleepingMat');

    // Assert
    expect(Object.values(BUILDINGS).every((b) => b.trains?.strength === 1 && Object.keys(b.trains).length === 1)).toBe(true);
    expect(RECIPES.every((r) => !('trains' in r))).toBe(true);
    expect(crafted.player.attributes).toEqual(state.player.attributes);
    expect(built.player.attributes.strength.xp).toBeGreaterThan(state.player.attributes.strength.xp);
    expect(built.player.attributes.agility).toEqual(state.player.attributes.agility);
  });
});

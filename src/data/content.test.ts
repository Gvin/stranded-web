import { describe, expect, it } from 'vitest';
import { getActions } from '../engine/actions';
import { performAction } from '../engine/game';
import { createTestGame, giveItem } from '../engine/testUtils';
import { BODY_PART_IDS, BUILDING_SLOTS } from '../engine/types';
import { ICON_BODIES } from '../icons/gameIcons';
import { BUILDINGS, previousLevel, slotLevels } from './buildings';
import { ENEMIES } from './enemies';
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
    const fuelWithoutBurnTime = Object.values(ITEMS).filter((i) => i.types?.includes('fuel') && !i.fuel);

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
      Pebble: ['pebble'],
      Feather: ['feather'],
      'Coconut shell': ['coconut_shell'],
      'Empty bottle': ['bottle'],
      Hammer: ['heavy'],
      Knife: ['knife'],
      Threads: ['threads', 'fuel'],
      Cloth: ['fuel', 'cloth'],
      Resin: ['glue'],
      Moss: ['fuel'],
      Bandage: ['fuel'],
    });
  });

  it('has an icon for every item, building and enemy', () => {
    // Act
    const missing = [
      ...Object.values(ITEMS).filter((i) => !ICON_BODIES[i.icon]),
      ...Object.values(BUILDINGS).filter((b) => !ICON_BODIES[b.icon]),
      ...Object.values(ENEMIES).filter((e) => !ICON_BODIES[e.icon]),
    ].map((d) => d.id);

    // Assert
    expect(missing).toEqual([]);
  });

  it('gives every enemy trail chances that add up to 1, and rewards of existing items', () => {
    // Act
    const total = Object.values(ENEMIES).reduce((sum, e) => sum + e.trailChance, 0);
    const unknown = Object.values(ENEMIES).flatMap((e) => e.rewards.filter((r) => !ITEMS[r.itemId]).map((r) => `${e.id}:${r.itemId}`));

    // Assert
    expect(total).toBeCloseTo(1, 9);
    expect(unknown).toEqual([]);
  });

  it('builds only from existing items and types', () => {
    // Act
    const bad = Object.values(BUILDINGS)
      .flatMap((b) => b.ingredients)
      .filter((i) => ('itemId' in i ? !ITEMS[i.itemId] : !Object.values(ITEMS).some((d) => d.types?.includes(i.type))));

    // Assert
    expect(bad).toEqual([]);
  });

  it('numbers the levels of every building slot from 1, and offers a level only where the one below it can stand', () => {
    // Act
    const gaps = BUILDING_SLOTS.filter((slot) => !slotLevels(slot).every((def, index) => def.level === index + 1));
    const unreachable = LOCATIONS.flatMap((l) =>
      (l.buildings ?? []).filter((id) => {
        const below = previousLevel(id);
        return below !== undefined && !(l.buildings ?? []).includes(below.id);
      }),
    );

    // Assert
    expect(gaps).toEqual([]);
    expect(unreachable).toEqual([]);
  });

  it('names every item for sentences, with "a" or "an" as the word after it needs', () => {
    // Act
    const wrong = Object.values(ITEMS)
      .filter((i) => {
        const [article, word = ''] = i.singular.split(' ');
        return article !== (/^[aeiou]/.test(word) ? 'an' : 'a') || i.plural.length === 0;
      })
      .map((i) => i.id);

    // Assert
    expect(wrong).toEqual([]);
  });

  it('has unique object ids within every location', () => {
    // Act
    const duplicates = LOCATIONS.filter((l) => new Set(l.objects.map((o) => o.id)).size !== l.objects.length);

    // Assert
    expect(duplicates).toEqual([]);
  });

  it.each(LOCATIONS.map((l) => l.id))(
    'performs every action at %s without errors',
    (locationId) => {
      // Arrange
      const state = createTestGame(locationId);
      state.player.attributes.strength.base = 100;
      for (const id of Object.keys(ITEMS)) {
        giveItem(state, id, 3);
      }
      state.player.equipment = { leftHand: { itemId: 'knife' }, rightHand: { itemId: 'bow' } };
      state.player.body.leftLeg = [{ id: 'fractured' }];
      state.player.body.torso = [{ id: 'injured', remaining: 100 }];
      state.locations[locationId] = {
        visited: true,
        constructions: {},
        groundItems: [{ id: 999, itemId: 'stone', quantity: 2, droppedAt: 0 }],
        stock: {},
        finds: {},
        buildings: {
          house: { id: 'hut', builtAt: 0 },
          fire: { id: 'campfire', builtAt: 0, fuel: 3, lit: true },
          storage: { id: 'smallStorage', builtAt: 0, items: [{ itemId: 'rope', quantity: 2 }] },
          workbench: { id: 'basicWorkbench', builtAt: 0 },
          rainCollector: { id: 'rainCollector', builtAt: 0, water: 2 },
        },
      };
      const torch = state.player.inventory.find((s) => s.itemId === 'torch');
      if (torch) {
        torch.lit = true;
      }
      state.player.stats.energy = 50;

      // Act
      const actionIds = getActions(state).map((a) => a.id);
      const results = actionIds.flatMap((id) => [1, 2, 3, 4, 5].map((seed) => performAction({ ...state, rng: seed }, id)));

      // Assert
      expect(actionIds.length).toBeGreaterThan(10);
      expect(results.every((r) => r.log.length > 0)).toBe(true);
      // why: every action five times over, with three of every item (weapons and clothes each their own entry), takes a while.
    },
    20_000,
  );

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

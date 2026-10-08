import { describe, expect, it } from 'vitest';
import { getActions, getBlockedReason } from './actions';
import { applyBodyCondition } from './conditions';
import { findAction, performAction } from './game';
import { createTestGame, giveItem } from './testUtils';
import type { GameState } from './types';
import { getLocationView } from './views';

const blockedReason = (state: ReturnType<typeof createTestGame>, actionId: string) => {
  const action = findAction(state, actionId);
  return action ? getBlockedReason(state, action) : 'missing action';
};

describe('performAction', () => {
  it('moves the player to a connected location and spends time and energy', () => {
    // Arrange
    const state = createTestGame('beach');

    // Act
    const next = performAction(state, 'travel:forest');

    // Assert
    expect(next.player.locationId).toBe('forest');
    expect(next.time).toBe(20);
    expect(next.player.stats.energy).toBe(96);
    expect(next.locations.forest?.visited).toBe(true);
  });

  it('never modifies the state it was given', () => {
    // Arrange
    const state = createTestGame('beach');
    const snapshot = structuredClone(state);

    // Act
    performAction(state, 'travel:forest');

    // Assert
    expect(state).toEqual(snapshot);
  });

  it('returns the same state for unknown or blocked actions', () => {
    // Arrange
    const state = createTestGame('beach');

    // Act
    const unknown = performAction(state, 'travel:moon');
    const blocked = performAction(state, 'sleep');

    // Assert
    expect(unknown).toBe(state);
    expect(blocked).toBe(state);
  });

  it('makes travel slower when agility is reduced', () => {
    // Arrange
    const state = createTestGame('beach');
    applyBodyCondition(state.player, 'leftLeg', 'fractured');
    applyBodyCondition(state.player, 'rightLeg', 'fractured');

    // Act
    const travel = findAction(state, 'travel:forest');

    // Assert
    expect(travel?.minutes).toBe(28);
  });

  it('offers only the routes connected to the current location', () => {
    // Arrange
    const forest = createTestGame('forest');
    const beach = createTestGame('beach');

    // Act
    const fromForest = getActions(forest)
      .filter((a) => a.category === 'travel')
      .map((a) => a.targetId);
    const fromBeach = getActions(beach)
      .filter((a) => a.category === 'travel')
      .map((a) => a.targetId);

    // Assert
    expect(fromForest.sort()).toEqual(['beach', 'camp', 'rocks', 'spring']);
    expect(fromBeach).toEqual(['forest']);
  });

  it('lists hidden objects not in the view but still offers their actions', () => {
    // Arrange
    const state = createTestGame('beach');

    // Act
    const objectIds = getLocationView(state).objects.map((o) => o.id);
    const action = findAction(state, 'obj:sea:comb');

    // Assert
    expect(objectIds).toEqual(['wreckage', 'palms']);
    expect(action).toBeDefined();
  });

  it('drops items on the ground with the drop time and picks them up again', () => {
    // Arrange
    const state = createTestGame('beach');
    giveItem(state, 'stone', 3);

    // Act
    const dropped = performAction(state, 'drop:stone:all');
    const groundId = dropped.locations.beach?.groundItems[0]?.id;
    const pickedUp = performAction(dropped, `pickup:${groundId}`);

    // Assert
    expect(dropped.locations.beach?.groundItems).toEqual([{ id: groundId, itemId: 'stone', quantity: 3, droppedAt: 0 }]);
    expect(dropped.player.inventory).toEqual([]);
    expect(pickedUp.player.inventory).toEqual([{ itemId: 'stone', quantity: 3 }]);
    expect(pickedUp.locations.beach?.groundItems).toEqual([]);
  });

  it('leaves found items on the ground when they exceed the carry capacity', () => {
    // Arrange
    const state = createTestGame('forest');
    giveItem(state, 'log', 7);

    // Act
    const next = performAction(state, 'obj:location:sticks');

    // Assert
    expect(next.player.inventory).toEqual([{ itemId: 'log', quantity: 7 }]);
    expect(next.locations.forest?.groundItems[0]?.itemId).toBe('stick');
  });

  it('blocks travel while overloaded', () => {
    // Arrange
    const state = createTestGame('beach');
    giveItem(state, 'log', 7);

    // Act
    const reason = blockedReason(state, 'travel:forest');

    // Assert
    expect(reason).toBe('You are carrying too much to travel');
  });

  it('bandages a bleeding arm using a bandage', () => {
    // Arrange
    const state = createTestGame('beach');
    applyBodyCondition(state.player, 'leftArm', 'injured');
    applyBodyCondition(state.player, 'leftArm', 'bleeding', 'heavy');
    giveItem(state, 'bandage', 2);

    // Act
    const next = performAction(state, 'bandage:leftArm');

    // Assert
    expect(next.player.body.leftArm.map((c) => c.id)).toEqual(['bandaged']);
    expect(next.player.inventory).toEqual([{ itemId: 'bandage', quantity: 1 }]);
  });

  it('refuses to hold an item in the hand of a fractured arm', () => {
    // Arrange
    const state = createTestGame('beach');
    applyBodyCondition(state.player, 'rightArm', 'fractured');
    giveItem(state, 'knife');

    // Act
    const right = blockedReason(state, 'equip:knife#0:rightHand');
    const left = performAction(state, 'equip:knife#0:leftHand');

    // Assert
    expect(right).toBe('Your right arm cannot hold anything');
    expect(left.player.equipment.leftHand).toEqual({ itemId: 'knife', health: 50 });
  });

  it('applies the food risk with its severity', () => {
    // Arrange
    let poisoned = undefined;
    for (let seed = 1; seed < 50 && !poisoned; seed++) {
      const state = createTestGame('beach', seed);
      state.player.stats.hunger = 50;
      giveItem(state, 'bitter-berries');
      poisoned = performAction(state, 'eat:bitter-berries').player.conditions.find((c) => c.id === 'poisoned');
    }

    // Assert
    expect(poisoned?.remaining).toBe(240);
  });

  it('improves an attribute after enough training', () => {
    // Arrange
    let state = createTestGame('rocks');
    state.player.attributes.strength.xp = 29;

    // Act
    state = performAction(state, 'obj:location:stones');

    // Assert
    expect(state.player.attributes.strength).toEqual({ base: 21, xp: 1 });
    expect(state.log.some((e) => e.text === 'Your Strength has improved to 21.')).toBe(true);
  });

  it('kills the player when an action deals lethal damage', () => {
    // Arrange
    const state = createTestGame('beach');
    state.player.health.torso = 0.1;
    state.player.stats.thirst = 100;

    // Act
    const dead = performAction(state, 'obj:sea:drink');

    // Assert
    expect(dead.status).toBe('dead');
    expect(dead.deathCause).toBe('You died of dehydration.');
    expect(getActions(dead)).toEqual([]);
  });
});

describe('crafting', () => {
  it('accepts any item of the requested type and uses the cheapest first', () => {
    // Arrange
    const state = createTestGame('beach');
    giveItem(state, 'stick');
    giveItem(state, 'stone');
    giveItem(state, 'flint');
    giveItem(state, 'rope');
    giveItem(state, 'vine');

    // Act
    const next = performAction(state, 'craft:knife');

    // Assert
    expect(next.player.inventory).toEqual([
      { itemId: 'stone', quantity: 1 },
      { itemId: 'rope', quantity: 1 },
      { itemId: 'vine', quantity: 1 },
      { itemId: 'knife', quantity: 1, health: 50 },
    ]);
  });

  it('keeps a tool that is needed but not used up', () => {
    // Arrange
    const state = createTestGame('beach');
    giveItem(state, 'vine');
    giveItem(state, 'flint');

    // Act
    const next = performAction(state, 'craft:threads');

    // Assert
    expect(next.player.inventory).toEqual([
      { itemId: 'flint', quantity: 1 },
      { itemId: 'threads', quantity: 1 },
    ]);
  });

  it('twists two thread-type items into a rope', () => {
    // Arrange
    const state = createTestGame('beach');
    giveItem(state, 'grass');
    giveItem(state, 'threads');

    // Act
    const next = performAction(state, 'craft:rope');

    // Assert
    expect(next.player.inventory).toEqual([{ itemId: 'rope', quantity: 1 }]);
  });

  it('needs a workbench nearby for advanced recipes', () => {
    // Arrange
    const state = createTestGame('camp');
    giveItem(state, 'stick');
    giveItem(state, 'stone');
    giveItem(state, 'vine');
    const withWorkbench = structuredClone(state);
    withWorkbench.locations.camp = {
      visited: true,
      constructions: {},
      groundItems: [],
      stock: {},
      finds: {},
      buildings: { workbench: { id: 'basicWorkbench', builtAt: 0 } },
    };

    // Act
    const reason = blockedReason(state, 'craft:hammer');
    const next = performAction(withWorkbench, 'craft:hammer');

    // Assert
    expect(reason).toBe('Requires: A workbench nearby');
    expect(next.player.inventory).toEqual([{ itemId: 'hammer', quantity: 1, health: 100 }]);
  });

  it('reports missing type ingredients by their type', () => {
    // Arrange
    const state = createTestGame('beach');
    giveItem(state, 'cloth');

    // Act
    const reason = blockedReason(state, 'craft:bandage');

    // Assert
    expect(reason).toBe('Requires: Rope');
  });
});

describe('buildings', () => {
  const campWithMaterials = () => {
    const state = createTestGame('camp');
    giveItem(state, 'stick', 5);
    giveItem(state, 'grass', 3);
    return state;
  };

  it('calls the camp a clearing until building starts there', () => {
    // Arrange
    const state = campWithMaterials();
    const before = findAction(createTestGame('forest'), 'travel:camp')?.label;

    // Act
    const next = performAction(state, 'build:campfire');

    // Assert
    expect(before).toBe('Go to Clearing');
    expect(getLocationView(state).name).toBe('Clearing');
    expect(getLocationView(next).name).toBe('Camp');
    expect(getLocationView(next).type).toBe('camp');
  });

  it('builds in steps, using up the materials with the first one, and a new campfire is full of fuel but unlit', () => {
    // Arrange
    const state = campWithMaterials();

    // Act
    const firstStep = performAction(state, 'build:campfire');
    const finished = performAction(firstStep, 'build:campfire');

    // Assert
    expect(findAction(state, 'build:campfire')).toMatchObject({ label: 'Start building', minutes: 15, energy: 2 });
    expect(firstStep.player.inventory).toEqual([]);
    expect(firstStep.locations.camp?.constructions).toMatchObject({ campfire: { stepsDone: 1 } });
    expect(firstStep.locations.camp?.buildings.fire).toBeUndefined();
    expect(findAction(firstStep, 'build:campfire')).toMatchObject({
      label: 'Continue building (step 2 of 2)',
      requirements: [expect.anything()],
    });
    expect(getLocationView(firstStep).objects.map((o) => o.name)).toEqual(['Campfire (unfinished)']);
    expect(finished.locations.camp?.constructions).toEqual({});
    expect(finished.locations.camp?.buildings.fire).toEqual({ id: 'campfire', builtAt: 30, fuel: 5, lit: false });
  });

  it('needs no bow for a campfire', () => {
    // Arrange
    const state = campWithMaterials();

    // Act
    const reason = blockedReason(state, 'build:campfire');

    // Assert
    expect(reason).toBeUndefined();
  });

  it('offers the first level of every slot at the clearing, only a sleeping mat elsewhere, and never as crafting recipes', () => {
    // Arrange
    const camp = campWithMaterials();
    const beach = campWithMaterials();
    beach.player.locationId = 'beach';

    // Act
    const buildIds = (state: GameState) =>
      getActions(state)
        .filter((a) => a.category === 'build')
        .map((a) => a.id);
    const crafting = getActions(camp)
      .filter((a) => a.category === 'craft')
      .map((a) => a.id);

    // Assert
    expect(buildIds(camp)).toEqual([
      'build:sleepingMat',
      'build:campfire',
      'build:basicWorkbench',
      'build:smallStorage',
      'build:rainCollector',
    ]);
    expect(buildIds(beach)).toEqual(['build:sleepingMat']);
    expect(crafting.some((id) => id.includes('campfire') || id.includes('hut'))).toBe(false);
  });

  it('offers the next level once a building stands', () => {
    // Arrange
    const state = campWithMaterials();

    // Act
    const next = performAction(performAction(state, 'build:campfire'), 'build:campfire');
    const ids = getActions(next).map((a) => a.id);

    // Assert
    expect(ids).not.toContain('build:campfire');
    expect(ids).toContain('build:fireplace');
    expect(next.player.craftedRecipes).toEqual([]);
  });

  it('adds fuel to the fire without taking time, as long as it fits', () => {
    // Arrange
    const state = createTestGame('camp');
    state.locations.camp = {
      visited: true,
      constructions: {},
      groundItems: [],
      stock: {},
      finds: {},
      buildings: { fire: { id: 'campfire', builtAt: 0, fuel: 2.5, lit: false } },
    };
    giveItem(state, 'log');
    giveItem(state, 'stick');
    giveItem(state, 'stone');

    // Act
    const fuelIds = getActions(state)
      .filter((a) => a.group === 'fuel')
      .map((a) => a.id);
    const next = performAction(state, 'fire:fuel:stick');

    // Assert
    expect(fuelIds).toEqual(['fire:fuel:stick', 'fire:fuel:log']);
    expect(blockedReason(state, 'fire:fuel:log')).toBe('There is no room for it in the fire');
    expect(next.time).toBe(0);
    expect(next.locations.camp?.buildings.fire?.fuel).toBe(3.5);
    expect(next.log.at(-1)?.text).toBe('You put a stick on the fire.');
  });

  it('keeps items in storage and gives them back', () => {
    // Arrange
    const state = createTestGame('camp');
    state.locations.camp = {
      visited: true,
      constructions: {},
      groundItems: [],
      stock: {},
      finds: {},
      buildings: { storage: { id: 'smallStorage', builtAt: 0, items: [] } },
    };
    giveItem(state, 'raw-fish', 2);

    // Act
    const stored = performAction(state, 'store:raw-fish:all');
    const later = performAction({ ...stored, time: stored.time + 24 * 60 }, 'take:raw-fish:one');

    // Assert
    expect(stored.locations.camp?.buildings.storage?.items).toEqual([{ itemId: 'raw-fish', quantity: 2 }]);
    expect(stored.log.at(-1)?.text).toBe('You put 2 raw fish into storage.');
    expect(later.player.inventory).toEqual([{ itemId: 'raw-fish', quantity: 1 }]);
    expect(later.locations.camp?.buildings.storage?.items).toEqual([{ itemId: 'raw-fish', quantity: 1 }]);
  });
});

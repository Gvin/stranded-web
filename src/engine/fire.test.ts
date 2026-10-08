import { describe, expect, it } from 'vitest';
import { getActions, getBlockedReason } from './actions';
import { heatingAt } from './environment';
import { findAction, performAction } from './game';
import { advanceTime } from './simulation';
import { createTestGame, giveItem } from './testUtils';
import { hours } from './time';
import type { BuildingId, GameState, LocationBuildings, WeatherId } from './types';

/** A test game at the location with the given buildings standing there. */
function at(locationId: string, buildings: LocationBuildings = {}, weather: WeatherId = 'cloudy'): GameState {
  const state = createTestGame(locationId);
  state.locations[locationId] = { visited: true, constructions: {}, groundItems: [], stock: {}, finds: {}, buildings };
  state.environment.weather = weather;
  state.player.stats.energy = 50;
  return state;
}

const campWithFire = (fuel: number, lit: boolean, id: BuildingId = 'campfire', weather: WeatherId = 'cloudy') =>
  at('camp', { fire: { id, builtAt: 0, fuel, lit } }, weather);

const blocked = (state: GameState, actionId: string) => {
  const action = findAction(state, actionId);
  return action ? getBlockedReason(state, action) : 'missing action';
};

const ids = (state: GameState, prefix: string) =>
  getActions(state)
    .map((a) => a.id)
    .filter((id) => id.startsWith(prefix));

describe('fires', () => {
  it('burn 1 fuel an hour, a furnace 0.7, and go out when the fuel is gone', () => {
    // Arrange
    const campfire = campWithFire(2, true);
    const furnace = campWithFire(7, true, 'furnace');

    // Act
    advanceTime(campfire, hours(3), 'awake');
    advanceTime(furnace, hours(5), 'awake');

    // Assert
    expect(campfire.locations.camp?.buildings.fire).toMatchObject({ fuel: 0, lit: false });
    expect(campfire.log.map((e) => e.text)).toContain('The campfire has burnt down. It needs fuel.');
    expect(furnace.locations.camp?.buildings.fire?.fuel).toBeCloseTo(3.5);
  });

  it('warm the location only while they burn', () => {
    // Act
    const warmth = [campWithFire(3, true), campWithFire(3, false)].map((state) => heatingAt(state, 'camp'));

    // Assert
    expect(warmth).toEqual(['Campfire', undefined]);
  });

  it('can be lit four ways once they hold fuel', () => {
    // Act
    const empty = ids(campWithFire(0, false), 'fire:light:');
    const withFuel = ids(campWithFire(1, false), 'fire:light:');

    // Assert
    expect(empty).toEqual([]);
    expect(withFuel).toEqual(['fire:light:bow-drill', 'fire:light:flints', 'fire:light:friction', 'fire:light:torch']);
    expect(blocked(campWithFire(1, false), 'fire:light:bow-drill')).toBe('Requires: Bow, Stick');
  });

  it('light with a bow drill in 15 minutes for 3 energy, using up a stick but not the bow', () => {
    // Arrange
    const state = campWithFire(5, false);
    giveItem(state, 'bow');
    giveItem(state, 'stick', 2);

    // Act
    const next = performAction(state, 'fire:light:bow-drill');

    // Assert
    expect(next.locations.camp?.buildings.fire?.lit).toBe(true);
    expect(next.time).toBe(15);
    expect(next.player.stats.energy).toBe(47);
    expect(next.player.inventory).toEqual([
      { itemId: 'bow', quantity: 1, health: 100 },
      { itemId: 'stick', quantity: 1 },
    ]);
  });

  it('light with a pair of flints, which loses 1 health a fire and is gone at 0', () => {
    // Arrange
    const state = campWithFire(5, false);
    state.player.inventory.push({ itemId: 'pair-of-flints', quantity: 1, health: 2 });

    // Act
    const once = performAction(state, 'fire:light:flints');
    once.locations.camp = { ...once.locations.camp!, buildings: { fire: { id: 'campfire', builtAt: 0, fuel: 5, lit: false } } };
    const twice = performAction(once, 'fire:light:flints');

    // Assert
    expect(once.time).toBe(10);
    expect(once.player.inventory).toEqual([{ itemId: 'pair-of-flints', quantity: 1, health: 1 }]);
    expect(twice.player.inventory).toEqual([]);
    expect(twice.log.map((e) => e.text)).toContain('Your pair of flints is worn down to nothing.');
  });

  it('light instantly from a lit torch', () => {
    // Arrange
    const state = campWithFire(5, false);
    state.player.inventory.push({ itemId: 'torch', quantity: 1, health: 50, lit: true });

    // Act
    const next = performAction(state, 'fire:light:torch');

    // Assert
    expect(next.locations.camp?.buildings.fire?.lit).toBe(true);
    expect(next.time).toBe(0);
    expect(next.player.inventory).toEqual(state.player.inventory);
  });

  it('can be put out instantly, keeping the fuel', () => {
    // Act
    const next = performAction(campWithFire(3, true), 'fire:put-out');

    // Assert
    expect(next.time).toBe(0);
    expect(next.locations.camp?.buildings.fire).toMatchObject({ fuel: 3, lit: false });
  });

  it('cook only while they burn', () => {
    // Arrange
    const cold = campWithFire(3, false);
    const burning = campWithFire(3, true);
    giveItem(cold, 'raw-fish');
    giveItem(burning, 'raw-fish');

    // Act
    const offered = [cold, burning].map((state) => findAction(state, 'fire:cook:raw-fish') !== undefined);

    // Assert
    expect(offered).toEqual([false, true]);
  });

  it('give the rain as the one reason not to light them, whatever the player carries', () => {
    // Act
    const reasons = ['fire:light:bow-drill', 'fire:light:flints', 'fire:light:friction', 'fire:light:torch'].map((id) =>
      blocked(campWithFire(3, false, 'campfire', 'rainy'), id),
    );

    // Assert
    expect(new Set(reasons)).toEqual(new Set(['It is raining: the fire will not catch until the rain stops']));
  });

  it('can be lit in the rain only if it is a furnace', () => {
    // Arrange
    const fireplace = campWithFire(3, false, 'fireplace', 'rainy');
    const furnace = campWithFire(3, false, 'furnace', 'rainy');
    giveItem(fireplace, 'stick', 2);
    giveItem(furnace, 'stick', 2);

    // Act
    const reasons = [fireplace, furnace].map((state) => blocked(state, 'fire:light:friction'));

    // Assert
    expect(reasons).toEqual(['It is raining: the fire will not catch until the rain stops', undefined]);
  });
});

describe('torch', () => {
  it('is crafted from a stick, cloth and glue in 15 minutes, unlit and at full health', () => {
    // Arrange
    const state = at('beach');
    giveItem(state, 'stick');
    giveItem(state, 'cloth');
    giveItem(state, 'resin');

    // Act
    const next = performAction(state, 'craft:torch');

    // Assert
    expect(next.time).toBe(15);
    expect(next.player.inventory).toEqual([{ itemId: 'torch', quantity: 1, health: 100 }]);
  });

  it('is lit instantly from a burning fire or another lit torch, and not without one', () => {
    // Arrange
    const byFire = campWithFire(3, true);
    giveItem(byFire, 'torch');
    const byTorch = at('beach');
    byTorch.player.inventory.push({ itemId: 'torch', quantity: 1, health: 100 }, { itemId: 'torch', quantity: 1, health: 30, lit: true });
    const noFlame = at('beach');
    giveItem(noFlame, 'torch');

    // Act
    const lit = performAction(byFire, 'torch:light:torch#0');
    const fromTorch = performAction(byTorch, 'torch:light:torch#0');

    // Assert
    expect(lit.time).toBe(0);
    expect(lit.player.inventory).toEqual([{ itemId: 'torch', quantity: 1, health: 100, lit: true }]);
    expect(fromTorch.player.inventory.every((s) => s.lit)).toBe(true);
    expect(blocked(noFlame, 'torch:light:torch#0')).toBe('Requires: A burning fire or a lit torch');
  });

  it('burns 2 health an hour in hand and on the ground, and burns out at 0', () => {
    // Arrange
    const state = at('beach');
    state.player.equipment.rightHand = { itemId: 'torch', health: 100, lit: true };
    state.locations.beach?.groundItems.push({ id: 900, itemId: 'torch', quantity: 1, droppedAt: 0, health: 3, lit: true });

    // Act
    advanceTime(state, hours(5), 'awake');

    // Assert
    expect(state.player.equipment.rightHand?.health).toBeCloseTo(90);
    expect(state.locations.beach?.groundItems).toEqual([]);
    expect(state.log.map((e) => e.text)).toContain('The torch on the ground has burnt out.');
  });

  it('burns in the bag too', () => {
    // Arrange
    const state = at('beach');
    state.player.inventory.push({ itemId: 'torch', quantity: 1, health: 50, lit: true });

    // Act
    advanceTime(state, hours(5), 'awake');

    // Assert
    expect(state.player.inventory[0]?.health).toBeCloseTo(40);
  });

  it('is put out when it goes into storage', () => {
    // Arrange
    const state = at('camp', { storage: { id: 'smallStorage', builtAt: 0, items: [] } });
    state.player.inventory.push({ itemId: 'torch', quantity: 1, health: 50, lit: true });

    // Act
    const stored = performAction(state, 'store:torch#0:one');
    const later = performAction({ ...stored, time: stored.time + hours(10) }, 'rest');

    // Assert
    const kept = stored.locations.camp?.buildings.storage?.items[0];
    expect(kept?.lit).toBeUndefined();
    expect(kept?.health).toBeCloseTo(50 - 2 / 60);
    expect(stored.log.at(-1)?.text).toBe('You put out the torch and put it into storage.');
    expect(later.locations.camp?.buildings.storage?.items[0]?.health).toBe(kept?.health);
  });

  it('cannot be lit in the rain without a roof, even from a fire', () => {
    // Arrange
    const state = campWithFire(10, true, 'furnace', 'rainy');
    giveItem(state, 'torch');

    // Act
    const reason = blocked(state, 'torch:light:torch#0');

    // Assert
    expect(reason).toBe('The rain would put it out at once');
  });

  it('wears out only while lit when held: held items do not wear out by the day like clothes', () => {
    // Arrange
    const state = at('beach');
    state.player.equipment.rightHand = { itemId: 'torch', health: 100 };

    // Act
    advanceTime(state, hours(24), 'awake');

    // Assert
    expect(state.player.equipment.rightHand?.health).toBe(100);
    expect(state.player.equipment.body?.health).toBeCloseTo(59);
  });

  it('goes out in the rain, unless the player is under a roof', () => {
    // Arrange
    const outside = at('beach', {}, 'rainy');
    const sheltered = at('beach', { house: { id: 'shelter', builtAt: 0 } }, 'rainy');
    for (const state of [outside, sheltered]) {
      state.player.inventory.push({ itemId: 'torch', quantity: 1, health: 100, lit: true });
    }

    // Act
    const results = [outside, sheltered].map((state) => performAction(state, 'rest'));

    // Assert
    expect(results.map((s) => s.player.inventory[0]?.lit)).toEqual([undefined, true]);
    expect(results[0]?.log.map((e) => e.text)).toContain('The rain puts out your torch.');
    expect(blocked(outside, 'torch:put-out:torch#0')).toBeUndefined();
  });

  it('keeps burning when it is dropped and picked up again', () => {
    // Arrange
    const state = at('beach');
    state.player.inventory.push({ itemId: 'torch', quantity: 1, health: 80, lit: true });

    // Act
    const dropped = performAction(state, 'drop:torch#0:one');
    const ground = dropped.locations.beach?.groundItems[0];
    const pickedUp = performAction(dropped, `pickup:${ground?.id}`);

    // Assert
    expect(ground).toMatchObject({ itemId: 'torch', health: 80, lit: true });
    expect(dropped.log.at(-1)?.text).toBe('You drop a torch (80/100) on the ground.');
    expect(pickedUp.player.inventory[0]).toMatchObject({ itemId: 'torch', lit: true });
  });
});

describe('pair of flints', () => {
  it('is put together from two flints instantly', () => {
    // Arrange
    const state = at('beach');
    giveItem(state, 'flint', 2);

    // Act
    const next = performAction(state, 'craft:pair-of-flints');

    // Assert
    expect(next.time).toBe(0);
    expect(next.player.inventory).toEqual([{ itemId: 'pair-of-flints', quantity: 1, health: 20 }]);
  });
});

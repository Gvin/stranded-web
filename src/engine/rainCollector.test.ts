import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../data/buildings';
import { getBlockedReason } from './actions';
import { findAction, performAction } from './game';
import { advanceTime } from './simulation';
import { createTestGame, giveItem } from './testUtils';
import { days, hours } from './time';
import type { GameState, WeatherId } from './types';
import { getLocationView } from './views';

const MIDDAY = hours(4);

/** A test game at the camp with a rain collector holding the given water, in a weather that does not change. */
function campWithCollector(water: number, weather: WeatherId = 'cloudy', time = 0): GameState {
  const state = createTestGame('camp');
  state.time = time;
  state.environment = { weather, until: time + days(30) };
  state.locations.camp = {
    visited: true,
    constructions: {},
    groundItems: [],
    stock: {},
    finds: {},
    buildings: { rainCollector: { id: 'rainCollector', builtAt: 0, water } },
  };
  return state;
}

const water = (state: GameState) => state.locations.camp?.buildings.rainCollector?.water;
const blocked = (state: GameState, actionId: string) => {
  const action = findAction(state, actionId);
  return action ? getBlockedReason(state, action) : 'missing action';
};

describe('building steps', () => {
  it('take 15 minutes and 2 energy each, with more steps for the bigger buildings', () => {
    // Act
    const steps = Object.fromEntries(Object.values(BUILDINGS).map((b) => [b.id, b.steps]));
    const mat = findAction(createTestGame('camp'), 'build:sleepingMat');

    // Assert
    expect(steps).toEqual({
      sleepingMat: 2,
      shelter: 6,
      hut: 10,
      house: 20,
      campfire: 2,
      fireplace: 6,
      furnace: 12,
      basicWorkbench: 5,
      workbench: 8,
      smallStorage: 5,
      mediumStorage: 8,
      bigStorage: 12,
      rainCollector: 5,
    });
    expect(mat).toMatchObject({ minutes: 15, energy: 2 });
  });
});

describe('small rain collector', () => {
  it('is built at the camp from logs, rope, threads, glue and leather with a hammer and an axe', () => {
    // Arrange
    const state = createTestGame('camp');
    giveItem(state, 'log', 5);
    giveItem(state, 'rope', 4);
    giveItem(state, 'threads', 3);
    giveItem(state, 'resin', 2);
    giveItem(state, 'leather', 3);
    const withoutTools = structuredClone(state);
    giveItem(state, 'hammer');
    giveItem(state, 'axe');

    // Act
    let built = state;
    for (let step = 0; step < 5; step++) {
      built = performAction(built, 'build:rainCollector');
    }

    // Assert
    expect(blocked(withoutTools, 'build:rainCollector')).toBe('Requires: Hammer, Axe');
    expect(built.time).toBe(5 * 15);
    expect(built.locations.camp?.buildings.rainCollector).toEqual({ id: 'rainCollector', builtAt: 75, water: 0 });
    expect(built.player.inventory.map((s) => s.itemId).sort()).toEqual(['axe', 'hammer']);
  });

  it('fills with 10 bottles of water per hour of rain and 15 in a storm, holding at most 2', () => {
    // Arrange
    const rainy = campWithCollector(0, 'rainy');
    const stormy = campWithCollector(0, 'stormy');
    const full = campWithCollector(0, 'rainy');

    // Act
    advanceTime(rainy, 6, 'awake');
    advanceTime(stormy, 6, 'awake');
    advanceTime(full, hours(1), 'awake');

    // Assert
    expect(water(rainy)).toBeCloseTo(1);
    expect(water(stormy)).toBeCloseTo(1.5);
    expect(water(full)).toBe(2);
  });

  it('stays empty without rain and fills under the roof of a hut all the same', () => {
    // Arrange
    const dry = campWithCollector(0, 'clear');
    const underRoof = campWithCollector(0, 'rainy');
    underRoof.locations.camp = {
      ...(underRoof.locations.camp as GameState['locations'][string]),
      buildings: { rainCollector: { id: 'rainCollector', builtAt: 0, water: 0 }, house: { id: 'hut', builtAt: 0 } },
    };

    // Act
    advanceTime(dry, hours(1), 'awake');
    advanceTime(underRoof, 6, 'awake');

    // Assert
    expect(water(dry)).toBe(0);
    expect(water(underRoof)).toBeCloseTo(1);
  });

  it('shows how much water it holds', () => {
    // Act
    const status = getLocationView(campWithCollector(1.57)).objects.find((o) => o.id === 'rainCollector')?.status;

    // Assert
    expect(status).toBe('1.5 / 2 bottles of water');
  });

  it('lets the player drink a bottle of water from it', () => {
    // Arrange
    const state = campWithCollector(1.5);
    state.player.stats.thirst = 50;

    // Act
    const next = performAction(state, 'rainCollector:drink');

    // Assert
    expect(water(next)).toBeCloseTo(0.5);
    expect(next.player.stats.thirst).toBeCloseTo(50 - 35 + (2 / 60) * 4, 5);
    expect(blocked(next, 'rainCollector:drink')).toBe('Not enough water in the collector');
  });

  it('fills an empty bottle with a bottle of water', () => {
    // Arrange
    const state = campWithCollector(2);
    giveItem(state, 'empty-bottle');

    // Act
    const next = performAction(state, 'rainCollector:fill');

    // Assert
    expect(blocked(campWithCollector(2), 'rainCollector:fill')).toBe('Requires: Empty bottle');
    expect(water(next)).toBeCloseTo(1);
    expect(next.player.inventory).toEqual([{ itemId: 'water-bottle', quantity: 1 }]);
  });

  it('offers washing your face only while it is Very Hot or the player is overheated, using half a bottle', () => {
    // Arrange
    const hot = campWithCollector(1, 'cloudy', MIDDAY);
    const veryHot = campWithCollector(1, 'clear', MIDDAY);
    veryHot.player.exposure.veryHot = 50;
    const almostEmpty = campWithCollector(0.4, 'clear', MIDDAY);

    // Act
    const next = performAction(veryHot, 'rainCollector:wash');

    // Assert
    expect(findAction(hot, 'rainCollector:wash')).toBeUndefined();
    expect(blocked(almostEmpty, 'rainCollector:wash')).toBe('Not enough water in the collector');
    expect(water(next)).toBeCloseTo(0.5);
    expect(next.player.exposure.veryHot).toBe(0);
  });
});

describe('resin', () => {
  it('turns up now and then when gathering sticks or chopping wood', () => {
    // Arrange
    const forest = createTestGame('forest');
    giveItem(forest, 'axe');

    // Act
    const sticks = findAction(forest, 'obj:location:sticks')?.gains?.find((g) => g.itemId === 'resin');
    const chop = findAction(forest, 'obj:location:chop')?.gains?.find((g) => g.itemId === 'resin');
    const chopped = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => performAction({ ...forest, rng: seed }, 'obj:location:chop'));
    // why: a felled tree gives more than the player can carry, so the resin may end up on the ground.
    const gotResin = (s: GameState) =>
      s.player.inventory.some((i) => i.itemId === 'resin') || (s.locations.forest?.groundItems ?? []).some((g) => g.itemId === 'resin');

    // Assert
    expect(sticks?.chance).toBe(0.05);
    expect(chop?.chance).toBe(0.3);
    expect(chopped.some(gotResin)).toBe(true);
    expect(chopped.some((s) => !gotResin(s))).toBe(true);
  });
});

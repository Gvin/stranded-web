import { describe, expect, it } from 'vitest';
import { WEATHERS } from '../data/weather';
import { deserializeGame, serializeGame } from '../save/saveFile';
import { getActions, getBlockedReason } from './actions';
import { getCharacterSheet } from './character';
import { createActionContext } from './context';
import { getBodyTemperature, rollNextWeather, temperatureId } from './environment';
import { findAction, performAction } from './game';
import { hit } from './outcomes';
import { advanceTime } from './simulation';
import { createTestGame, giveItem } from './testUtils';
import { days, hours } from './time';
import type { GameState, LocationBuildings, WeatherId } from './types';
import { getLocationInfo } from './world';

const MIDDAY = hours(4);
const EVENING = hours(10);
const NIGHT = hours(15);

/** A test game at the given time and weather; the weather does not change on its own. */
function gameAt(time: number, weather: WeatherId, locationId = 'beach'): GameState {
  const state = createTestGame(locationId);
  state.time = time;
  state.environment = { weather, until: time + days(30) };
  return state;
}

/** Fills the player up again, so long waits in a test do not end in thirst. */
function refreshed(state: GameState): GameState {
  state.player.stats = { health: 100, thirst: 0, hunger: 0, energy: 100 };
  return state;
}

const bodyTemperature = (state: GameState) => temperatureId(getBodyTemperature(state).value);
const environmentTemperature = (state: GameState) => temperatureId(getBodyTemperature(state).environment);

function withBuildings(state: GameState, buildings: GameState['locations'][string]['buildings']): GameState {
  state.locations[state.player.locationId] = { visited: true, constructions: {}, groundItems: [], stock: {}, finds: {}, buildings };
  return state;
}

describe('environment temperature', () => {
  it('follows the time of day', () => {
    // Act
    const temperatures = [0, MIDDAY, EVENING, NIGHT].map((time) => environmentTemperature(gameAt(time, 'cloudy')));

    // Assert
    expect(temperatures).toEqual(['normal', 'hot', 'normal', 'cold']);
  });

  it('is shifted by the weather but stays between Very Cold and Very Hot', () => {
    // Act
    const clearMidday = environmentTemperature(gameAt(MIDDAY, 'clear'));
    const windyMorning = environmentTemperature(gameAt(0, 'windy'));
    const stormyNight = environmentTemperature(gameAt(NIGHT, 'stormy'));

    // Assert
    expect([clearMidday, windyMorning, stormyNight]).toEqual(['veryHot', 'cold', 'veryCold']);
  });
});

describe('body temperature', () => {
  it('is one step cooler under a roof, which does not help against the cold', () => {
    // Arrange
    const hut: LocationBuildings = { house: { id: 'hut', builtAt: 0 } };

    // Act
    const hot = bodyTemperature(withBuildings(gameAt(MIDDAY, 'cloudy', 'camp'), hut));
    const veryHot = bodyTemperature(withBuildings(gameAt(MIDDAY, 'clear', 'camp'), hut));
    const cold = bodyTemperature(withBuildings(gameAt(NIGHT, 'windy', 'camp'), hut));

    // Assert
    expect([hot, veryHot]).toEqual(['normal', 'hot']);
    expect(cold).toBe('cold');
  });

  it('gets shade from a hat, which does not add to a roof', () => {
    // Arrange
    const outdoors = gameAt(MIDDAY, 'clear');
    outdoors.player.equipment.head = { itemId: 'baseball-hat', health: 30 };
    const inHut = withBuildings(gameAt(MIDDAY, 'clear', 'camp'), { house: { id: 'hut', builtAt: 0 } });
    inHut.player.equipment.head = { itemId: 'baseball-hat', health: 30 };

    // Act
    const temperatures = [bodyTemperature(outdoors), bodyTemperature(inHut)];

    // Assert
    expect(temperatures).toEqual(['hot', 'hot']);
  });

  it('adds the warmth of clothes to heating, but never above Normal', () => {
    // Arrange
    const fire: LocationBuildings = { fire: { id: 'campfire', builtAt: 0, fuel: 5, lit: true } };
    const naked = withBuildings(gameAt(NIGHT, 'windy', 'camp'), fire);
    delete naked.player.equipment.body;
    const dressed = withBuildings(gameAt(NIGHT, 'windy', 'camp'), fire);
    const dressedNoFire = gameAt(NIGHT, 'windy', 'camp');
    const coldNight = withBuildings(gameAt(NIGHT, 'cloudy', 'camp'), fire);

    // Act
    const temperatures = [naked, dressed, dressedNoFire, coldNight].map(bodyTemperature);

    // Assert
    expect(temperatures).toEqual(['cold', 'normal', 'cold', 'normal']);
  });

  it('is one step colder while wet', () => {
    // Arrange
    const state = gameAt(0, 'cloudy');
    state.player.conditions.push({ id: 'wet', remaining: 60 });

    // Act
    const temperature = bodyTemperature(state);

    // Assert
    expect(temperature).toBe('cold');
  });

  it('makes thirst grow faster in the heat and hunger faster in the cold', () => {
    // Arrange
    const hot = gameAt(MIDDAY, 'cloudy');
    const cold = gameAt(NIGHT, 'cloudy');
    delete cold.player.equipment.body;

    // Act
    advanceTime(hot, hours(1), 'awake');
    advanceTime(cold, hours(1), 'awake');

    // Assert
    expect(hot.player.stats.thirst).toBeCloseTo(5);
    expect(hot.player.stats.hunger).toBeCloseTo(2);
    expect(cold.player.stats.thirst).toBeCloseTo(3.6);
    expect(cold.player.stats.hunger).toBeCloseTo(2.5);
  });
});

describe('Overheated and Freezing', () => {
  it('overheat the player after more than an hour of Very Hot, renew while it lasts and wear off 30 minutes later', () => {
    // Arrange
    const state = gameAt(MIDDAY, 'clear');

    // Act
    advanceTime(state, hours(1), 'awake');
    const afterOneHour = state.player.conditions.map((c) => c.id);
    advanceTime(state, hours(1), 'awake');
    const overheated = state.player.conditions.find((c) => c.id === 'overheated')?.remaining;
    state.environment.weather = 'cloudy';
    advanceTime(state, 30, 'awake');

    // Assert
    expect(afterOneHour).toEqual([]);
    expect(overheated).toBe(30);
    expect(state.player.conditions).toEqual([]);
  });

  it('lower every attribute by 20%', () => {
    // Arrange
    const state = createTestGame();
    state.player.conditions.push({ id: 'freezing', remaining: 30 });

    // Act
    const sheet = getCharacterSheet(state);

    // Assert
    expect(sheet.conditions.map((c) => c.name)).toEqual(['Freezing']);
    expect(Object.values(sheet.attributes).map((a) => a.effective)).toEqual([16, 16, 16, 16]);
    expect(sheet.max.energy).toBe(96);
  });

  it('freeze the player after more than an hour of Very Cold', () => {
    // Arrange
    const state = gameAt(NIGHT, 'stormy', 'camp');

    // Act
    advanceTime(state, hours(1) + 30, 'awake');

    // Assert
    expect(bodyTemperature(state)).toBe('veryCold');
    expect(state.player.conditions.map((c) => c.id)).toContain('freezing');
  });
});

describe('weather', () => {
  it('rolls the next weather by its chances when the current one ends', () => {
    // Arrange
    const counts: Record<string, number> = {};
    const state = createTestGame();

    // Act
    for (let i = 0; i < 4000; i++) {
      rollNextWeather(state, 0);
      counts[state.environment.weather] = (counts[state.environment.weather] ?? 0) + 1;
      const [min, max] = WEATHERS[state.environment.weather].hours;
      expect(state.environment.until).toBeGreaterThanOrEqual(hours(min));
      expect(state.environment.until).toBeLessThanOrEqual(hours(max));
    }

    // Assert
    for (const weather of Object.values(WEATHERS)) {
      expect((counts[weather.id] ?? 0) / 4000).toBeCloseTo(weather.chance, 1);
    }
  });

  it('changes when its time is up and logs the new weather', () => {
    // Arrange
    const state = gameAt(0, 'cloudy');
    state.environment.until = hours(1);

    // Act
    advanceTime(state, hours(1), 'awake');

    // Assert
    expect(state.environment.until).toBeGreaterThan(hours(1));
  });

  it('makes the player wet in the rain without a roof, for two hours after it stops', () => {
    // Arrange
    const state = gameAt(0, 'rainy');

    // Act
    advanceTime(state, hours(1), 'awake');
    const wet = state.player.conditions.find((c) => c.id === 'wet')?.remaining;
    state.environment.weather = 'cloudy';
    advanceTime(state, hours(2) - 10, 'awake');
    const stillWet = state.player.conditions.some((c) => c.id === 'wet');
    advanceTime(state, 10, 'awake');

    // Assert
    expect(wet).toBe(120);
    expect(stillWet).toBe(true);
    expect(state.player.conditions).toEqual([]);
    expect(state.log.at(-1)?.text).toBe('You are dry again.');
  });

  it('makes the player wet only after 10 minutes out in the rain, starting over under a roof', () => {
    // Arrange
    const state = withBuildings(gameAt(0, 'rainy', 'beach'), {});
    const hut = withBuildings(gameAt(0, 'rainy', 'camp'), { house: { id: 'hut', builtAt: 0 } });

    // Act
    advanceTime(state, 5, 'awake');
    const afterFive = state.player.conditions.length;
    state.player.locationId = 'camp';
    state.locations.camp = hut.locations.camp as GameState['locations'][string];
    advanceTime(state, 5, 'awake');
    const underRoof = state.player.exposure.rain;
    state.player.locationId = 'beach';
    advanceTime(state, 5, 'awake');
    const backOutside = state.player.conditions.length;
    advanceTime(state, 5, 'awake');

    // Assert
    expect([afterFive, underRoof, backOutside]).toEqual([0, 0, 0]);
    expect(state.player.conditions.map((c) => c.id)).toEqual(['wet']);
  });

  it('gets the player wet on the way through the rain, even when they set off from under a roof', () => {
    // Arrange
    const state = withBuildings(gameAt(0, 'rainy', 'camp'), { house: { id: 'hut', builtAt: 0 } });

    // Act
    const next = performAction(state, 'travel:forest');

    // Assert
    expect(next.player.locationId).toBe('forest');
    expect(next.player.conditions.map((c) => c.id)).toEqual(['wet']);
  });

  it('dries the player twice as fast while the island is hot', () => {
    // Arrange
    const state = gameAt(MIDDAY, 'cloudy');
    state.player.conditions.push({ id: 'wet', remaining: 120 });

    // Act
    advanceTime(state, hours(1), 'awake');

    // Assert
    expect(state.player.conditions).toEqual([]);
  });

  it('keeps the player dry under a roof', () => {
    // Arrange
    const state = withBuildings(gameAt(0, 'stormy', 'camp'), { house: { id: 'hut', builtAt: 0 } });

    // Act
    advanceTime(state, hours(1), 'awake');

    // Assert
    expect(state.player.conditions).toEqual([]);
  });

  it('puts out a campfire, keeping its fuel, and it cannot be lit again until the rain stops', () => {
    // Arrange
    const state = withBuildings(gameAt(0, 'cloudy', 'camp'), { fire: { id: 'campfire', builtAt: 0, fuel: 5, lit: true } });
    giveItem(state, 'stick', 2);
    state.environment.weather = 'rainy';

    // Act
    const rained = performAction(state, 'rest');
    const blocked = getBlockedReason(rained, findAction(rained, 'fire:light:friction') ?? fail());
    rained.environment.weather = 'cloudy';
    const relit = performAction(rained, 'fire:light:friction');

    // Assert
    expect(rained.locations.camp?.buildings.fire?.lit).toBe(false);
    expect(rained.locations.camp?.buildings.fire?.fuel).toBeCloseTo(5 - 10 / 60);
    expect(rained.log.map((e) => e.text)).toContain('The rain puts out the campfire.');
    expect(blocked).toBe('It is raining: the fire will not catch until the rain stops');
    expect(relit.locations.camp?.buildings.fire?.lit).toBe(true);
  });

  it('puts out a campfire and a fireplace even under a roof, but never a furnace', () => {
    // Arrange
    const roofed = (id: 'campfire' | 'fireplace' | 'furnace') =>
      withBuildings(gameAt(0, 'rainy', 'camp'), { fire: { id, builtAt: 0, fuel: 5, lit: true }, house: { id: 'hut', builtAt: 0 } });

    // Act
    const results = (['campfire', 'fireplace', 'furnace'] as const).map((id) => performAction(roofed(id), 'rest'));

    // Assert
    expect(results.map((s) => s.locations.camp?.buildings.fire?.lit)).toEqual([false, false, true]);
  });

  it('makes the sea too rough to dive in a storm', () => {
    // Arrange
    const state = gameAt(0, 'stormy');

    // Act
    const reason = getBlockedReason(state, findAction(state, 'obj:sea:dive') ?? fail());

    // Assert
    expect(reason).toBe('The sea is too rough to dive in a storm');
  });
});

describe('wearing out', () => {
  it('starts the game in clothes at 60 of 100 health that keep you warm', () => {
    // Act
    const state = createTestGame();

    // Assert
    expect(state.player.equipment.body).toEqual({ itemId: 'clothes', health: 60 });
    expect(bodyTemperature(gameAt(NIGHT, 'cloudy'))).toBe('normal');
  });

  it('takes 1 health a day from worn items only, keeping fractions when taken off', () => {
    // Arrange
    const state = gameAt(0, 'cloudy');
    giveItem(state, 'makeshift-hat');

    // Act
    advanceTime(state, hours(23), 'resting');
    const undressed = performAction(refreshed(state), 'unequip:body');
    const inBag = undressed.player.inventory.find((s) => s.itemId === 'clothes')?.health;
    advanceTime(undressed, hours(20), 'resting');
    const dressed = performAction(refreshed(undressed), 'equip:clothes#0:body');
    advanceTime(dressed, hours(1), 'resting');

    // Assert
    // why: taking clothes off takes a minute, still wearing them.
    expect(inBag).toBeCloseTo(60 - 23 / 24 - 1 / 1440, 6);
    expect(dressed.player.equipment.body?.health).toBeCloseTo(59 - 1 / 1440, 6);
    expect(dressed.player.inventory.find((s) => s.itemId === 'makeshift-hat')?.health).toBe(30);
  });

  it('destroys a worn item at 0 health and announces it in a popup', () => {
    // Arrange
    const state = gameAt(0, 'cloudy');
    state.player.equipment.head = { itemId: 'makeshift-hat', health: 0.5 };

    // Act
    advanceTime(state, hours(13), 'resting');

    // Assert
    expect(state.player.equipment.head).toBeUndefined();
    expect(state.player.inventory).toEqual([]);
    expect(state.log.find((e) => e.alert)?.text).toBe('Your makeshift hat fell apart. It is gone.');
  });

  it('never stacks items that wear out, so each can be worn or dropped on its own', () => {
    // Arrange
    const state = createTestGame();
    giveItem(state, 'makeshift-hat', 2);
    state.player.inventory[0] = { itemId: 'makeshift-hat', quantity: 1, health: 5 };

    // Act
    const dropped = performAction(state, 'drop:makeshift-hat#0:one');
    const worn = performAction(state, 'equip:makeshift-hat#1:head');

    // Assert
    expect(state.player.inventory).toHaveLength(2);
    expect(dropped.player.inventory).toEqual([{ itemId: 'makeshift-hat', quantity: 1, health: 30 }]);
    expect(dropped.locations.beach?.groundItems.map((g) => g.health)).toEqual([5]);
    expect(worn.player.equipment.head).toEqual({ itemId: 'makeshift-hat', health: 30 });
    expect(findAction(state, 'drop:makeshift-hat#0:all')).toBeUndefined();
  });

  it('keeps the player dry in a crafted raincoat', () => {
    // Arrange
    const state = createTestGame();
    giveItem(state, 'leather', 3);
    giveItem(state, 'resin', 2);
    giveItem(state, 'threads');
    giveItem(state, 'rope');

    // Act
    const crafted = performAction(state, 'craft:makeshift-raincoat');
    const dressed = performAction(crafted, 'equip:makeshift-raincoat#0:body');
    dressed.environment = { weather: 'stormy', until: dressed.time + days(1) };
    advanceTime(dressed, hours(1), 'awake');

    // Assert
    expect(crafted.player.inventory).toEqual([{ itemId: 'makeshift-raincoat', quantity: 1, health: 100 }]);
    expect(dressed.player.equipment.body).toMatchObject({ itemId: 'makeshift-raincoat' });
    expect(dressed.player.conditions).toEqual([]);
  });

  it('gives crafted clothing full health', () => {
    // Arrange
    const state = createTestGame();
    giveItem(state, 'cloth', 2);
    giveItem(state, 'threads');
    giveItem(state, 'rope');

    // Act
    const next = performAction(state, 'craft:makeshift-clothes');

    // Assert
    expect(next.player.inventory).toEqual([{ itemId: 'makeshift-clothes', quantity: 1, health: 60 }]);
  });

  it('shows the health left in item labels', () => {
    // Arrange
    const state = createTestGame();
    state.locations.beach = {
      visited: true,
      constructions: {},
      stock: {},
      finds: {},
      buildings: {},
      groundItems: [{ id: 99, itemId: 'baseball-hat', quantity: 1, droppedAt: 0, health: 29.2 }],
    };

    // Act
    const label = findAction(state, 'pickup:99')?.label;
    const next = performAction(state, 'pickup:99');

    // Assert
    expect(label).toBe('Pick up Baseball hat (30/100)');
    expect(next.player.inventory).toEqual([{ itemId: 'baseball-hat', quantity: 1, health: 29.2 }]);
  });
});

describe('travelling', () => {
  it('leaves the warmth of the campfire behind for the whole way', () => {
    // Arrange
    const state = withBuildings(gameAt(NIGHT, 'windy', 'camp'), { fire: { id: 'campfire', builtAt: 0, fuel: 5, lit: true } });
    delete state.player.equipment.body;

    // Act
    const next = performAction(state, 'travel:forest');

    // Assert
    expect(next.time).toBe(NIGHT + 15);
    expect(next.player.exposure.veryCold).toBe(15);
  });

  it('is on the way when the player dies while travelling, and such a game still saves and loads', () => {
    // Arrange
    const state = gameAt(0, 'cloudy', 'camp');
    state.player.stats.health = 1;
    state.player.body.torso = [{ id: 'bleeding', remaining: hours(4) }];

    // Act
    const next = performAction(state, 'travel:forest');

    // Assert
    expect(next.status).toBe('dead');
    expect(next.player.locationId).toBe('path');
    expect(getLocationInfo(next, next.player.locationId).name).toBe('On the way');
    expect(deserializeGame(serializeGame(next)).status).toBe('ok');
  });

  it('is never offered as a destination', () => {
    // Act
    const destinations = ['beach', 'forest', 'spring', 'rocks', 'camp'].flatMap((id) =>
      getActions(createTestGame(id))
        .filter((a) => a.category === 'travel')
        .map((a) => a.targetId),
    );

    // Assert
    expect(destinations).not.toContain('path');
  });
});

describe('cooling down and warming up', () => {
  const fire: LocationBuildings = { fire: { id: 'campfire', builtAt: 0, fuel: 5, lit: true } };
  const blocked = (state: GameState, actionId: string) => getBlockedReason(state, findAction(state, actionId) ?? fail());

  it('offers washing your face at the spring only while it is Very Hot or the player is overheated', () => {
    // Arrange
    const hot = gameAt(MIDDAY, 'cloudy', 'spring');
    const overheated = gameAt(MIDDAY, 'cloudy', 'spring');
    overheated.player.conditions.push({ id: 'overheated', remaining: 20 });

    // Act
    const offered = [hot, overheated, gameAt(MIDDAY, 'clear', 'spring')].map((state) => findAction(state, 'obj:pool:wash') !== undefined);

    // Assert
    expect(offered).toEqual([false, true, true]);
    expect(blocked(overheated, 'obj:pool:wash')).toBeUndefined();
  });

  it('starts the hour until overheating over and takes 15 minutes off Overheated when washing', () => {
    // Arrange
    const state = gameAt(MIDDAY, 'clear', 'spring');
    state.player.exposure.veryHot = 50;
    state.player.stats.energy = 50;
    state.player.conditions.push({ id: 'overheated', remaining: 30 });

    // Act
    const next = performAction(state, 'obj:pool:wash');

    // Assert
    expect(next.time).toBe(MIDDAY + 5);
    expect(next.player.stats.energy).toBe(49);
    expect(next.player.exposure.veryHot).toBe(0);
    expect(next.player.conditions).toEqual([{ id: 'overheated', remaining: 30 - 5 - 15 }]);
  });

  it('offers sitting next to a burning fire only while it is Very Cold or the player is freezing or wet', () => {
    // Arrange
    const cold = withBuildings(gameAt(NIGHT, 'cloudy', 'camp'), fire);
    const wet = withBuildings(gameAt(NIGHT, 'cloudy', 'camp'), fire);
    wet.player.conditions.push({ id: 'wet', remaining: 60 });
    const veryCold = withBuildings(gameAt(NIGHT, 'windy', 'camp'), fire);
    const unlit = withBuildings(gameAt(NIGHT, 'windy', 'camp'), { fire: { id: 'campfire', builtAt: 0, fuel: 0, lit: false } });

    // Act
    const offered = [cold, wet, veryCold, unlit].map((state) => findAction(state, 'fire:sit') !== undefined);

    // Assert
    expect(offered).toEqual([false, true, true, false]);
    expect(blocked(wet, 'fire:sit')).toBeUndefined();
  });

  it('starts the hour until freezing over and takes 15 minutes off Freezing and Wet by the fire', () => {
    // Arrange
    const state = withBuildings(gameAt(NIGHT, 'windy', 'camp'), fire);
    delete state.player.equipment.body;
    state.player.exposure.veryCold = 40;
    state.player.stats.energy = 50;
    state.player.conditions.push({ id: 'freezing', remaining: 30 }, { id: 'wet', remaining: 10 });

    // Act
    const next = performAction(state, 'fire:sit');

    // Assert
    expect(next.time).toBe(NIGHT + 5);
    expect(next.player.stats.energy).toBe(50);
    expect(next.player.exposure.veryCold).toBe(0);
    expect(next.player.conditions).toEqual([{ id: 'freezing', remaining: 30 - 5 - 15 }]);
    expect(next.log.map((e) => e.text)).toContain('You are dry again.');
  });
});

describe('armor', () => {
  it('stops one point of damage from every hit for each armor point worn', () => {
    // Arrange
    const state = createTestGame();
    state.player.equipment.body = { itemId: 'leather-jacket', health: 200 };
    state.player.equipment.head = { itemId: 'leather-hat', health: 100 };
    const ctx = createActionContext(state);

    // Act
    hit(ctx, 10, 'Hit.');
    hit(ctx, 3, 'Hit.');

    // Assert
    expect(state.player.stats.health).toBe(100 - (10 - 3));
  });
});

function fail(): never {
  throw new Error('Missing action');
}

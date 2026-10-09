import { describe, expect, it } from 'vitest';
import { getBlockedReason } from './actions';
import { applyBodyCondition } from './conditions';
import { startFight } from './fight';
import { createNewGame, findAction, performAction } from './game';
import { createTestGame, giveItem } from './testUtils';
import { days, hours } from './time';
import type { GameState } from './types';
import { getLocationView } from './views';
import { getLocationStock, takeLocationStock } from './world';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

function forest(perception: number, seed?: number): GameState {
  const state = createTestGame('forest', seed);
  state.player.attributes.perception.base = perception;
  return state;
}

const foundTrail = (state: GameState) => state.fight !== undefined;

describe('tracking animals', () => {
  it('takes 3 hours and 10 energy, with a 30% chance at 20 Perception that rises to 90% at 100', () => {
    // Act
    const tracks = [10, 20, 60, 100].map((perception) => findAction(forest(perception), 'obj:location:track'));

    // Assert
    expect(tracks[0]).toMatchObject({ label: 'Track animals', minutes: 180, energy: 10 });
    expect(tracks.map((t) => t?.gains)).toEqual(
      [0.225, 0.3, 0.6, 0.9].map((chance) => [{ label: 'A trail to an animal (starts a fight)', chance: expect.closeTo(chance, 6) }]),
    );
  });

  it('finds a trail about 30% of the time at 20 Perception, which leads to a fight', () => {
    // Act
    const results = SEEDS.map((seed) => performAction(forest(20, seed), 'obj:location:track'));

    // Assert
    const found = results.filter(foundTrail);
    expect(found.length / SEEDS.length).toBeGreaterThan(0.2);
    expect(found.length / SEEDS.length).toBeLessThan(0.4);
    expect(found.every((s) => /^You find a fresh trail and follow it to an? [a-z]+\.$/.test(s.log.at(-1)?.text ?? ''))).toBe(true);
    expect(
      results
        .filter((s) => !foundTrail(s))
        .every((s) => s.log.at(-1)?.text === 'You search the undergrowth for hours, but find no fresh tracks.'),
    ).toBe(true);
  });

  it('trains Perception by 3 points, whether a trail is found or not', () => {
    // Act
    const next = performAction(forest(20), 'obj:location:track');

    // Assert
    expect(next.player.attributes.perception.xp).toBe(3);
  });

  it('finds trails about three times as often at 100 Perception', () => {
    // Act
    const found = SEEDS.filter((seed) => foundTrail(performAction(forest(100, seed), 'obj:location:track'))).length;

    // Assert
    expect(found / SEEDS.length).toBeGreaterThan(0.8);
    expect(found / SEEDS.length).toBeLessThan(0.97);
  });
});

/** A forest game with a snare set the given minutes ago (a day by default). */
function withSnare(seed: number, minutesAgo = hours(24)): GameState {
  const state = createTestGame('forest', seed);
  state.time = hours(100);
  state.locations.forest = {
    visited: true,
    constructions: {},
    groundItems: [],
    stock: {},
    finds: {},
    buildings: { snare: { id: 'snare', builtAt: state.time - minutesAgo } },
  };
  return state;
}

function emptied(state: GameState, locationId: string, population: string): GameState {
  takeLocationStock(state, locationId, population, 1000);
  return state;
}

const count = (state: GameState, itemId: string) =>
  state.player.inventory.filter((s) => s.itemId === itemId).reduce((sum, s) => sum + s.quantity, 0);

describe('populations', () => {
  it('keep 10 animals in the forest, 20 fish at the beach and 8 nests at the rocks, regrowing, and show nowhere', () => {
    // Arrange
    const state = createTestGame('forest');
    emptied(state, 'forest', 'animals');

    // Act
    state.time += hours(24);

    // Assert
    expect(getLocationStock(createTestGame(), 'forest', 'animals')).toBe(10);
    expect(getLocationStock(createTestGame(), 'beach', 'fish')).toBe(20);
    expect(getLocationStock(createTestGame(), 'rocks', 'nests')).toBe(8);
    expect(getLocationStock(state, 'forest', 'animals')).toBe(2);
    expect(getLocationView(state).objects.some((o) => /animal/i.test(o.status ?? ''))).toBe(false);
  });

  it('give no trail to track once the forest is hunted out', () => {
    // Act
    const found = SEEDS.filter((seed) => performAction(emptied(forest(100, seed), 'forest', 'animals'), 'obj:location:track').fight);

    // Assert
    expect(found).toEqual([]);
  });

  it('lose one animal for every kill', () => {
    // Arrange
    const state = createTestGame('forest');
    startFight(state, 'rabbit');
    Object.assign(state.fight ?? {}, { playerAt: 4, enemyAt: 5, seen: true, enemyHealth: 1 });
    state.player.equipment.rightHand = { itemId: 'knife', health: 50 };
    state.player.attributes.agility.base = 100;

    // Act
    const won = SEEDS.map((seed) => performAction({ ...state, rng: seed }, 'fight:attack')).find((s) => s.fight === undefined);

    // Assert
    expect(won && getLocationStock(won, 'forest', 'animals')).toBe(9);
  });
});

describe('snares', () => {
  it('are set in the forest in one building step from 2 sticks and a rope, one at a time, and nowhere else', () => {
    // Arrange
    const state = createTestGame('forest');
    giveItem(state, 'stick', 2);
    giveItem(state, 'rope');
    const camp = createTestGame('camp');
    giveItem(camp, 'stick', 2);
    giveItem(camp, 'rope');

    // Act
    const set = performAction(state, 'build:snare');

    // Assert
    expect(findAction(state, 'build:snare')).toMatchObject({ minutes: 15, energy: 2 });
    expect(set.locations.forest?.buildings.snare).toEqual({ id: 'snare', builtAt: set.time });
    expect(set.player.inventory).toEqual([]);
    expect(findAction(set, 'build:snare')).toBeUndefined();
    expect(findAction(camp, 'build:snare')).toBeUndefined();
  });

  it('can be checked a day after they were set, in 15 minutes for 1 energy, which uses them up', () => {
    // Arrange
    const early = withSnare(1, hours(23));
    const ready = withSnare(1);

    // Act
    const checked = performAction(ready, 'snare:check');

    // Assert
    expect(findAction(early, 'snare:check')).toBeUndefined();
    expect(findAction(ready, 'snare:check')).toMatchObject({ minutes: 15, energy: 1 });
    expect(checked.locations.forest?.buildings.snare).toBeUndefined();
  });

  it('catch something half the time: a seagull, a rabbit, a turtle or a kiwi, by the trail chances, with its reward and no fight', () => {
    // Act
    const checks = SEEDS.map((seed) => performAction(withSnare(seed), 'snare:check'));
    const caught = checks.map((state) => /Your snare has caught an? ([a-z]+)\./.exec(state.log.map((e) => e.text).join('\n'))?.[1]);
    const share = (animal: string) => caught.filter((c) => c === animal).length / SEEDS.length;
    const rabbit = checks[caught.indexOf('rabbit')];

    // Assert
    expect(caught.filter(Boolean).length / SEEDS.length).toBeGreaterThan(0.4);
    expect(caught.filter(Boolean).length / SEEDS.length).toBeLessThan(0.6);
    expect(new Set(caught.filter(Boolean))).toEqual(new Set(['seagull', 'rabbit', 'turtle', 'kiwi']));
    expect(share('seagull')).toBeGreaterThan(share('kiwi'));
    expect(checks.every((state) => state.fight === undefined)).toBe(true);
    expect(rabbit && [count(rabbit, 'raw-meat'), count(rabbit, 'leather')]).toEqual([2, 1]);
    expect(rabbit && getLocationStock(rabbit, 'forest', 'animals')).toBe(9);
  });

  it('stay empty once the forest is hunted out', () => {
    // Act
    const caught = SEEDS.filter(
      (seed) => performAction(emptied(withSnare(seed), 'forest', 'animals'), 'snare:check').player.inventory.length > 0,
    );

    // Assert
    expect(caught).toEqual([]);
  });
});

describe('spear fishing', () => {
  it('needs a spear in hand, takes an hour and 6 energy, and trains Agility', () => {
    // Arrange
    const bare = createTestGame('beach');
    const armed = createTestGame('beach');
    armed.player.equipment.leftHand = { itemId: 'spear', health: 50 };

    // Act
    const next = performAction(armed, 'obj:sea:spearfish');

    // Assert
    expect(findAction(bare, 'obj:sea:spearfish')?.requirements.map((r) => r.describe())).toEqual(['Spear in hand']);
    expect(findAction(armed, 'obj:sea:spearfish')).toMatchObject({ minutes: 60, energy: 6 });
    expect(findAction(armed, 'obj:sea:spearfish')?.gains).toEqual([{ label: 'Raw fish', itemId: 'raw-fish', chance: 0.3 }]);
    expect(next.player.attributes.agility.xp).toBe(1);
  });

  it('catches a fish with the Agility success chance, taking it from the fish, and none once they are fished out', () => {
    // Act
    const fish = (prepare: (state: GameState) => GameState) =>
      SEEDS.map((seed) => {
        const state = createTestGame('beach', seed);
        state.player.equipment.rightHand = { itemId: 'spear', health: 50 };
        return performAction(prepare(state), 'obj:sea:spearfish');
      }).filter((state) => count(state, 'raw-fish') === 1);
    const caught = fish((state) => state);
    const fishedOut = fish((state) => emptied(state, 'beach', 'fish'));

    // Assert
    expect(caught.length / SEEDS.length).toBeGreaterThan(0.2);
    expect(caught.length / SEEDS.length).toBeLessThan(0.4);
    expect(caught.every((state) => getLocationStock(state, 'beach', 'fish') === 19)).toBe(true);
    expect(fishedOut).toEqual([]);
  });

  it('is blocked in a storm, but not with a broken limb', () => {
    // Arrange
    const stormy = createTestGame('beach');
    stormy.player.equipment.rightHand = { itemId: 'spear', health: 50 };
    stormy.environment = { weather: 'stormy', until: stormy.time + days(1) };
    const broken = createTestGame('beach');
    broken.player.equipment.rightHand = { itemId: 'spear', health: 50 };
    applyBodyCondition(broken.player, 'leftLeg', 'fractured');
    const blocked = (state: GameState) => {
      const action = findAction(state, 'obj:sea:spearfish');
      if (!action) throw new Error('Spear fishing is missing');
      return getBlockedReason(state, action);
    };

    // Act
    const reasons = [stormy, broken].map(blocked);

    // Assert
    expect(reasons).toEqual(['The sea is too rough to fish in a storm', undefined]);
  });

  it('shares the fish with diving at the reef', () => {
    // Act
    const dive = (prepare: (state: GameState) => GameState) =>
      SEEDS.map((seed) => {
        const state = createTestGame('beach', seed);
        state.player.attributes.agility.base = 100;
        return performAction(prepare(state), 'obj:sea:dive');
      });
    const withFish = dive((state) => state).filter((state) => count(state, 'raw-fish') > 0);
    const fishedOut = dive((state) => emptied(state, 'beach', 'fish')).filter((state) => count(state, 'raw-fish') > 0);

    // Assert
    expect(withFish.length).toBeGreaterThan(0);
    expect(withFish.every((state) => getLocationStock(state, 'beach', 'fish') === 19)).toBe(true);
    expect(fishedOut).toEqual([]);
  });
});

describe('looking for nests', () => {
  it('takes 30 minutes and 3 energy, finds a nest 30% of the time at 20 Perception and Agility, 45% with one at 100, 60% with both', () => {
    // Arrange
    const at = (perception: number, agility: number) => {
      const state = createTestGame('rocks');
      state.player.attributes.perception.base = perception;
      state.player.attributes.agility.base = agility;
      return findAction(state, 'obj:location:nests');
    };

    // Act
    const chances = [at(20, 20), at(100, 20), at(20, 100), at(100, 100)].map((action) => action?.gains?.[0]?.chance ?? 0);

    // Assert
    expect(at(20, 20)).toMatchObject({ minutes: 30, energy: 3 });
    expect(chances.map((c) => Math.round(c * 100))).toEqual([30, 45, 45, 60]);
    expect(at(20, 20)?.gains?.[0]?.label).toBe('Bird egg ×1–3');
  });

  it('shows the eggs as an unknown find until the player has had one', () => {
    // Arrange
    const state = createNewGame(1);
    state.player.locationId = 'rocks';

    // Act
    const gains = findAction(state, 'obj:location:nests')?.gains;

    // Assert
    expect(gains).toEqual([{ label: 'Unknown find', chance: expect.closeTo(0.3, 6), unknown: true }]);
  });

  it('gives 1 to 3 bird eggs from a nest, takes the nest, finds none once they are robbed, and trains Perception', () => {
    // Act
    const look = (prepare: (state: GameState) => GameState) =>
      SEEDS.map((seed) => performAction(prepare(createTestGame('rocks', seed)), 'obj:location:nests'));
    const found = look((state) => state).filter((state) => count(state, 'bird-egg') > 0);
    const robbed = look((state) => emptied(state, 'rocks', 'nests')).filter((state) => count(state, 'bird-egg') > 0);

    // Assert
    expect(found.length / SEEDS.length).toBeGreaterThan(0.2);
    expect(found.length / SEEDS.length).toBeLessThan(0.4);
    expect(new Set(found.map((state) => count(state, 'bird-egg')))).toEqual(new Set([1, 2, 3]));
    expect(found.every((state) => getLocationStock(state, 'rocks', 'nests') === 7)).toBe(true);
    expect(found.every((state) => state.player.attributes.perception.xp === 1)).toBe(true);
    expect(robbed).toEqual([]);
  });
});

describe('spear fishing for the first time', () => {
  it('shows the fish as an unknown find until the player has had one, like diving', () => {
    // Arrange
    const state = createNewGame(1);
    state.player.equipment.rightHand = { itemId: 'spear', health: 50 };

    // Act
    const gains = findAction(state, 'obj:sea:spearfish')?.gains;

    // Assert
    expect(gains).toEqual([{ label: 'Unknown find', chance: expect.closeTo(0.3, 6), unknown: true }]);
  });
});

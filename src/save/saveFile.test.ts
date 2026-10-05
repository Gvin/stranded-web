import { describe, expect, it } from 'vitest';
import { getActions } from '../engine/actions';
import { createNewGame, performAction } from '../engine/game';
import type { GameState } from '../engine/types';
import { MIGRATIONS, runMigrations } from './migrations';
import { deserializeGame, serializeGame } from './saveFile';
import { GAME_VERSION, MIN_SUPPORTED_SAVE_VERSION, SAVE_VERSION } from './version';

const envelope = (saveVersion: number, state: unknown = createNewGame(1)) =>
  JSON.stringify({ saveVersion, gameVersion: '0.0.1', savedAt: '2026-01-01T00:00:00.000Z', state });

describe('save versioning', () => {
  it('has a migration for every supported save version below the current one', () => {
    // Act
    const missing = [];
    for (let version = MIN_SUPPORTED_SAVE_VERSION; version < SAVE_VERSION; version++) {
      if (!MIGRATIONS[version]) {
        missing.push(version);
      }
    }

    // Assert
    expect(missing).toEqual([]);
    expect(MIN_SUPPORTED_SAVE_VERSION).toBeLessThanOrEqual(SAVE_VERSION);
  });

  it('runs migrations in order from the saved version to the target version', () => {
    // Arrange
    const migrations = {
      1: (s: Record<string, unknown>) => ({ ...s, steps: ['1to2'] }),
      2: (s: Record<string, unknown>) => ({ ...s, steps: [...(s.steps as string[]), '2to3'] }),
    };

    // Act
    const result = runMigrations({ time: 5 }, 1, 3, migrations);

    // Assert
    expect(result).toEqual({ time: 5, steps: ['1to2', '2to3'] });
  });

  it('fails when a migration in the chain is missing', () => {
    // Act
    const act = () => runMigrations({}, 1, 3, { 1: (s) => s });

    // Assert
    expect(act).toThrow('No migration from save version 2 to 3');
  });
});

describe('serializeGame / deserializeGame', () => {
  it('round-trips a game together with the game and save versions', () => {
    // Arrange
    const state = createNewGame(42);

    // Act
    const json = serializeGame(state, new Date('2026-10-05T10:00:00.000Z'));
    const loaded = deserializeGame(json);

    // Assert
    expect(JSON.parse(json)).toMatchObject({ saveVersion: SAVE_VERSION, gameVersion: GAME_VERSION, savedAt: '2026-10-05T10:00:00.000Z' });
    expect(loaded).toEqual({ status: 'ok', state, migratedFrom: undefined });
  });

  it('rejects saves made by a newer game version', () => {
    // Act
    const result = deserializeGame(envelope(SAVE_VERSION + 1));

    // Assert
    expect(result.status).toBe('incompatible');
  });

  it('rejects saves older than the minimum supported version', () => {
    // Act
    const result = deserializeGame(envelope(MIN_SUPPORTED_SAVE_VERSION - 1));

    // Assert
    expect(result).toEqual({
      status: 'incompatible',
      reason: 'Saves from game version 0.0.1 are no longer supported.',
      saveGameVersion: '0.0.1',
    });
  });

  it('reports broken save data as corrupt', () => {
    // Act
    const notJson = deserializeGame('{oops');
    const noState = deserializeGame(JSON.stringify({ saveVersion: SAVE_VERSION }));
    const badState = deserializeGame(envelope(SAVE_VERSION, { time: 'later' }));

    // Assert
    expect([notJson.status, noState.status, badState.status]).toEqual(['corrupt', 'corrupt', 'corrupt']);
  });
});

/** A save written by game 0.1.0 (format 1), using items, conditions and structures that no longer exist. */
function v1Save(): string {
  const time = 600;
  const state = {
    time,
    rng: 7,
    nextId: 50,
    status: 'alive',
    player: {
      locationId: 'camp',
      stats: { health: 80, thirst: 60, hunger: 70, energy: 50 },
      attributes: {
        strength: { base: 21, xp: 3 },
        endurance: { base: 20, xp: 0 },
        perception: { base: 20, xp: 5 },
        agility: { base: 20, xp: 0 },
      },
      body: {
        head: [],
        torso: [{ id: 'bandaged', since: 500 }],
        leftArm: [{ id: 'injured', since: 0 }],
        rightArm: [],
        leftLeg: [
          { id: 'fractured', since: 400 },
          { id: 'bleeding', since: 560 },
        ],
        rightLeg: [],
      },
      conditions: [
        { id: 'poisoned', until: 900 },
        { id: 'dizzy', until: 300 },
      ],
      inventory: [
        { itemId: 'rag', quantity: 3 },
        { itemId: 'plank', quantity: 1 },
        { itemId: 'firewood', quantity: 2 },
        { itemId: 'empty-bottle', quantity: 1 },
        { itemId: 'ship-biscuit', quantity: 2 },
      ],
      equipment: { leftHand: 'stone-axe', rightHand: 'sharp-stone', back: 'palm-backpack' },
    },
    locations: {
      beach: {
        visited: true,
        groundItems: [{ id: 9, itemId: 'palm-leaf', quantity: 4, droppedAt: 100 }],
        stock: {},
        finds: { 'wreckage:rag': 5 },
      },
      camp: { visited: true, groundItems: [], stock: {}, finds: {}, campfire: { litUntil: 700 }, shelter: true },
    },
    flags: { 'shirt-torn': true },
    log: [{ id: 1, time: 0, text: 'You wake up.', tone: 'info' }],
  };
  return JSON.stringify({ saveVersion: 1, gameVersion: '0.1.0', savedAt: '2026-10-05T10:00:00.000Z', state });
}

describe('migration from save format 1', () => {
  it('converts items, conditions and structures to the current format', () => {
    // Act
    const result = deserializeGame(v1Save());

    // Assert
    expect(result.status).toBe('ok');
    const state = (result as { state: GameState }).state;
    expect(result).toMatchObject({ migratedFrom: 1 });
    expect(state.player.inventory).toEqual([
      { itemId: 'cloth', quantity: 3 },
      { itemId: 'log', quantity: 3 },
      { itemId: 'ship-biscuit', quantity: 2 },
      { itemId: 'flint', quantity: 1 },
    ]);
    expect(state.player.equipment).toEqual({ leftHand: 'hammer', body: 'clothes' });
    expect(state.player.stats).toMatchObject({ thirst: 40, hunger: 30 });
    expect(state.player.craftedRecipes.sort()).toEqual(['build-campfire', 'build-hut']);
    expect(state.player.body.leftArm).toEqual([{ id: 'injured', remaining: 4320 - 600 }]);
    expect(state.player.body.torso).toEqual([{ id: 'bandaged', remaining: (500 + 2160 - 600) * 2 }]);
    expect(state.player.body.leftLeg).toEqual([{ id: 'fractured' }, { id: 'bleeding', remaining: 200 }]);
    expect(state.player.conditions).toEqual([{ id: 'poisoned', remaining: 300 }]);
    expect(state.locations.camp?.buildings).toEqual({ campfire: { builtAt: 0, litUntil: 700 }, hut: { builtAt: 0 } });
    expect(state.locations.beach?.groundItems).toEqual([{ id: 9, itemId: 'grass', quantity: 4, droppedAt: 100 }]);
    expect(state.locations.beach?.finds).toEqual({ 'wreckage:cloth': 5 });
  });

  it('produces a game that can be played on', () => {
    // Arrange
    const state = (deserializeGame(v1Save()) as { state: GameState }).state;

    // Act
    const results = getActions(state).map((action) => performAction(state, action.id));

    // Assert
    expect(results.length).toBeGreaterThan(5);
    expect(results.every((r) => r.status === 'alive' || r.status === 'dead')).toBe(true);
  });

  it('rejects saves that refer to items the game does not know', () => {
    // Arrange
    const state = createNewGame(3);
    state.player.inventory.push({ itemId: 'laser-sword', quantity: 1 });

    // Act
    const result = deserializeGame(JSON.stringify({ saveVersion: SAVE_VERSION, gameVersion: GAME_VERSION, savedAt: '', state }));

    // Assert
    expect(result.status).toBe('corrupt');
  });
});

/** A save written by game 0.2.0 (format 2): thirst and hunger still count down, no worn equipment. */
function v2Save(): string {
  const state = {
    ...createNewGame(9),
    time: 300,
  } as unknown as Record<string, unknown> & { player: Record<string, unknown> };
  const { craftedRecipes: _dropped, ...player } = state.player;
  void _dropped;
  const v2State = {
    ...state,
    player: {
      ...player,
      stats: { health: 70, thirst: 75, hunger: 40, energy: 60 },
      equipment: { leftHand: 'knife' },
    },
    locations: {
      beach: { visited: true, groundItems: [], stock: { 'fallen-coconuts': { amount: 1, updatedAt: 200 } }, finds: {}, buildings: {} },
      camp: { visited: true, groundItems: [], stock: {}, finds: {}, buildings: { workbench: { builtAt: 100 } } },
    },
  };
  return JSON.stringify({ saveVersion: 2, gameVersion: '0.2.0', savedAt: '2026-10-05T12:00:00.000Z', state: v2State });
}

describe('migration from save format 2', () => {
  it('flips thirst and hunger, adds clothes, remembers buildings and moves the fallen coconuts', () => {
    // Act
    const result = deserializeGame(v2Save());

    // Assert
    expect(result).toMatchObject({ status: 'ok', migratedFrom: 2 });
    const state = (result as { state: GameState }).state;
    expect(state.player.stats).toEqual({ health: 70, thirst: 25, hunger: 60, energy: 60 });
    expect(state.player.equipment).toEqual({ leftHand: 'knife', body: 'clothes' });
    expect(state.player.craftedRecipes).toEqual(['build-workbench']);
    expect(state.locations.beach?.stock).toEqual({ 'palms:fallen': { amount: 1, updatedAt: 200 } });
  });
});

describe('migration from save format 3', () => {
  it('adds an empty list of unfinished buildings to every location', () => {
    // Arrange
    const state = createNewGame(5) as unknown as { locations: Record<string, Record<string, unknown>> };
    for (const location of Object.values(state.locations)) {
      delete location.constructions;
    }

    // Act
    const result = deserializeGame(JSON.stringify({ saveVersion: 3, gameVersion: '0.5.0', savedAt: '', state }));

    // Assert
    expect(result).toMatchObject({ status: 'ok', migratedFrom: 3 });
    const migrated = (result as { state: GameState }).state;
    expect(Object.values(migrated.locations).every((l) => JSON.stringify(l.constructions) === '{}')).toBe(true);
  });
});

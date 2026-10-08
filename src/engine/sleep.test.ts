import { describe, expect, it } from 'vitest';
import { fullPartHealth, totalHealth } from './body';
import { getActions } from './actions';
import { getCharacterSheet } from './character';
import { performAction } from './game';
import { advanceTime } from './simulation';
import { createTestGame } from './testUtils';
import { hours } from './time';
import { BODY_PART_IDS, type BuildingId, type GameState } from './types';

/** A tired test game at the camp, sleeping on the given level of the house slot (or on the bare ground). */
function sleeper(bed?: BuildingId): GameState {
  const state = createTestGame('camp');
  state.locations.camp = {
    visited: true,
    constructions: {},
    groundItems: [],
    stock: {},
    finds: {},
    buildings: bed ? { house: { id: bed, builtAt: 0 } } : {},
  };
  state.player.stats.energy = 10;
  // why: every part at half its health, 50 in all, so the healing shared between them is never lost.
  for (const part of BODY_PART_IDS) {
    state.player.health[part] = fullPartHealth(state.player, part) / 2;
  }
  return state;
}

const BEDS = [undefined, 'sleepingMat', 'shelter', 'hut', 'house'] as const;

describe('sleep', () => {
  it('gives back energy and health by what the player sleeps on', () => {
    // Act
    const results = BEDS.map((bed) => {
      const state = sleeper(bed);
      advanceTime(state, hours(2), 'sleeping');
      return [state.player.stats.energy, totalHealth(state.player)].map((value) => Math.round(value * 100) / 100);
    });

    // Assert
    expect(results).toEqual([
      [10 + 2 * 7, 50],
      [10 + 2 * 8, 50],
      [10 + 2 * 10, 50 + 2 * 1],
      [10 + 2 * 12, 50 + 2 * 2],
      [10 + 2 * 15, 50 + 2 * 3],
    ]);
  });

  it('leaves a condition for 20 hours by where the player slept, replacing the one before', () => {
    // Act
    const conditions = BEDS.map((bed) => {
      const state = sleeper(bed);
      state.player.conditions.push({ id: 'goodSleep', remaining: 60 });
      return performAction(state, 'sleep').player.conditions;
    });

    // Assert
    expect(conditions).toEqual([
      [{ id: 'awfulSleep', remaining: hours(20) }],
      [{ id: 'badSleep', remaining: hours(20) }],
      [],
      [{ id: 'goodSleep', remaining: hours(20) }],
      [{ id: 'perfectSleep', remaining: hours(20) }],
    ]);
  });

  it('changes every attribute by the sleep condition', () => {
    // Act
    const strength = BEDS.map((bed) => getCharacterSheet(performAction(sleeper(bed), 'sleep')).attributes.strength);

    // Assert
    expect(strength.map((s) => s.percent)).toEqual([-20, -10, 0, 10, 20]);
  });

  it('shows what the sleep gives in its popup, never more energy than is missing', () => {
    // Arrange
    const state = sleeper('hut');
    state.player.stats.energy = 40;

    // Act
    const sleep = getActions(state).find((a) => a.id === 'sleep');

    // Assert
    expect(sleep?.description).toBe('Sleep for 8 h in your hut.');
    expect(sleep?.gains?.map((g) => g.label)).toEqual(['+60 energy', 'Up to +16 health', 'Good Sleep for 20 h: +10% to all attributes']);
  });
});

describe('Sleepy', () => {
  it('comes after 20 hours awake, lets the player sleep at any energy and ends with the sleep', () => {
    // Arrange
    const awake = sleeper();
    awake.player.stats.energy = 100;
    const sleepy = structuredClone(awake);
    sleepy.time = hours(20);

    // Act
    const conditionIds = (state: GameState) => getCharacterSheet(state).conditions.map((c) => c.id);
    const offered = [awake, sleepy].map((state) => getActions(state).some((a) => a.id === 'sleep'));
    const slept = performAction(sleepy, 'sleep');

    // Assert
    expect(conditionIds(awake)).not.toContain('sleepy');
    expect(conditionIds(sleepy)).toContain('sleepy');
    expect(getCharacterSheet(sleepy).attributes.agility.percent).toBe(-20);
    expect(offered).toEqual([false, true]);
    expect(slept.player.awakeSince).toBe(slept.time);
    expect(conditionIds(slept)).not.toContain('sleepy');
  });

  it('is announced when it begins', () => {
    // Arrange
    const state = sleeper();
    state.player.stats.energy = 100;
    state.time = hours(20) - 30;

    // Act
    const next = performAction(state, 'rest');

    // Assert
    expect(next.log.map((e) => e.text)).toContain('Your eyelids are heavy. You are sleepy and need to sleep.');
  });
});

describe('resting', () => {
  it('restores 5 energy and heals 0.5 health an hour, the same as being awake', () => {
    // Arrange
    const state = sleeper();
    state.player.stats.energy = 50;

    // Act
    const next = performAction(state, 'rest');

    // Assert
    expect(next.player.stats.energy).toBeCloseTo(55);
    expect(totalHealth(next.player)).toBeCloseTo(50.5);
  });
});

import { describe, expect, it } from 'vitest';
import { findAction, performAction } from './game';
import { createTestGame } from './testUtils';
import type { GameState } from './types';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

function forest(perception: number, seed?: number): GameState {
  const state = createTestGame('forest', seed);
  state.player.attributes.perception.base = perception;
  return state;
}

const foundTrail = (state: GameState) => state.log.some((e) => e.text === 'You find a fresh animal trail.');

describe('tracking animals', () => {
  it('takes 3 hours and 10 energy, with a 30% chance at 20 Perception that rises to 90% at 100', () => {
    // Act
    const tracks = [10, 20, 60, 100].map((perception) => findAction(forest(perception), 'obj:location:track'));

    // Assert
    expect(tracks[0]).toMatchObject({ label: 'Track animals', minutes: 180, energy: 10 });
    expect(tracks.map((t) => t?.gains)).toEqual(
      [0.225, 0.3, 0.6, 0.9].map((chance) => [{ label: 'A fresh animal trail', chance: expect.closeTo(chance, 6) }]),
    );
  });

  it('finds a trail about 30% of the time at 20 Perception, and shows it in a popup', () => {
    // Act
    const results = SEEDS.map((seed) => performAction(forest(20, seed), 'obj:location:track'));

    // Assert
    const found = results.filter(foundTrail);
    expect(found.length / SEEDS.length).toBeGreaterThan(0.2);
    expect(found.length / SEEDS.length).toBeLessThan(0.4);
    expect(found.every((s) => s.log.at(-1)?.alert === true)).toBe(true);
    expect(
      results
        .filter((s) => !foundTrail(s))
        .every((s) => s.log.at(-1)?.text === 'You search the undergrowth for hours, but find no fresh tracks.'),
    ).toBe(true);
  });

  it('finds trails about three times as often at 100 Perception', () => {
    // Act
    const found = SEEDS.filter((seed) => foundTrail(performAction(forest(100, seed), 'obj:location:track'))).length;

    // Assert
    expect(found / SEEDS.length).toBeGreaterThan(0.8);
    expect(found / SEEDS.length).toBeLessThan(0.97);
  });
});

import { describe, expect, it } from 'vitest';
import { findAction, performAction } from './game';
import { perceptionFactor, successChance } from './rules';
import { createTestGame } from './testUtils';
import type { AttributeId, GameState } from './types';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

function withAttribute(state: GameState, id: AttributeId, base: number): GameState {
  state.player.attributes[id].base = base;
  return state;
}

const gainChance = (state: GameState, actionId: string, itemId: string) =>
  findAction(state, actionId)?.gains?.find((g) => g.itemId === itemId)?.chance;

describe('attributes', () => {
  it('give actions that depend on them a 30% success chance at 20, half a percent more per point, less below 20', () => {
    // Act
    const chances = [1, 10, 20, 40, 100].map(successChance);

    // Assert
    expect(chances.map((c) => Math.round(c * 1000) / 1000)).toEqual([0.205, 0.25, 0.3, 0.4, 0.7]);
  });

  it('let Perception multiply find chances by 1 at 20, evenly up to 2 at 100, and below 1 under 20', () => {
    // Act
    const factors = [0, 20, 60, 100].map((perception) => perceptionFactor(perception));

    // Assert
    expect(factors).toEqual([0.75, 1, 1.5, 2]);
  });

  it('decide climbing for coconuts, diving at the reef and tearing down vines by Agility and Strength', () => {
    // Arrange
    const climber = withAttribute(createTestGame('beach'), 'agility', 60);
    const tearer = withAttribute(createTestGame('forest'), 'strength', 100);

    // Act
    const climb = gainChance(climber, 'obj:palms:climb', 'coconut');
    const dive = gainChance(climber, 'obj:sea:dive', 'raw-fish');
    const tear = gainChance(tearer, 'obj:vines:tear', 'vine');

    // Assert
    expect(climb).toBeCloseTo(0.5);
    expect(dive).toBeCloseTo(0.3 * 0.5);
    expect(tear).toBeCloseTo(0.7);
  });

  it('let the player reach the top of a palm about 30% of the time at 20 Agility', () => {
    // Act
    const reached = SEEDS.filter((seed) =>
      performAction(createTestGame('beach', seed), 'obj:palms:climb').player.inventory.some((s) => s.itemId === 'coconut'),
    ).length;

    // Assert
    expect(reached / SEEDS.length).toBeGreaterThan(0.2);
    expect(reached / SEEDS.length).toBeLessThan(0.4);
  });
});

describe('picking berries', () => {
  it('gives a bitter berry 10% of the time, whatever the Perception', () => {
    // Act
    const bitter = (perception: number) =>
      SEEDS.map((seed) => {
        const state = withAttribute(createTestGame('forest', seed), 'perception', perception);
        const next = performAction(state, 'obj:berry-bushes:pick');
        const count = (itemId: string) => next.player.inventory.find((s) => s.itemId === itemId)?.quantity ?? 0;
        return [count('bitter-berries'), count('wild-berries') + count('bitter-berries')];
      });
    const dull = bitter(5);
    const sharp = bitter(100);
    const share = dull.reduce((sum, [b]) => sum + (b ?? 0), 0) / dull.reduce((sum, [, all]) => sum + (all ?? 0), 0);

    // Assert
    expect(sharp.map(([b]) => b)).toEqual(dull.map(([b]) => b));
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.15);
    expect(gainChance(createTestGame('forest'), 'obj:berry-bushes:pick', 'bitter-berries')).toBe(0.1);
  });
});

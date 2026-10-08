import { describe, expect, it } from 'vitest';
import { createActionContext } from './context';
import { findAction, performAction } from './game';
import { skilledMinutes } from './skills';
import { createTestGame, giveItem } from './testUtils';
import type { GameState, SkillId } from './types';

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

function withSkill(state: GameState, id: SkillId, level: number, points = 0): GameState {
  state.player.skills[id] = { level, points };
  return state;
}

const count = (state: GameState, itemId: string) =>
  state.player.inventory.filter((s) => s.itemId === itemId).reduce((sum, s) => sum + s.quantity, 0);

function crafter(level: number, items: Record<string, number>, seed = 1): GameState {
  const state = withSkill(createTestGame('beach', seed), 'crafting', level);
  for (const [itemId, quantity] of Object.entries(items)) {
    giveItem(state, itemId, quantity);
  }
  return state;
}

describe('skill training', () => {
  it('gives 2 Foraging points per foraging action and a new level every 100 points', () => {
    // Arrange
    const state = withSkill(createTestGame('forest'), 'foraging', 0, 98);

    // Act
    const next = performAction(state, 'obj:location:grass');

    // Assert
    expect(next.player.skills.foraging).toEqual({ level: 1, points: 0 });
    expect(next.log.map((e) => e.text)).toContain('Your Foraging skill has improved to 1.');
  });

  it('gives 10 Crafting points per craft, however many items it makes', () => {
    // Arrange
    const state = crafter(0, { stick: 1, knife: 1 });

    // Act
    const next = performAction(state, 'craft:bad-arrow');

    // Assert
    expect(count(next, 'bad-arrow')).toBe(5);
    expect(next.player.skills.crafting).toEqual({ level: 0, points: 10 });
  });

  it('gives 10 Building points per building step', () => {
    // Arrange
    const state = createTestGame('camp');
    giveItem(state, 'stick', 5);
    giveItem(state, 'grass', 3);

    // Act
    const next = performAction(state, 'build:campfire');

    // Assert
    expect(next.player.skills.building).toEqual({ level: 0, points: 10 });
  });

  it('stops at level 10 and leaves other skills alone', () => {
    // Arrange
    const state = crafter(10, { threads: 2 });

    // Act
    const next = performAction(state, 'craft:rope');
    const rested = performAction(next, 'rest');

    // Assert
    expect(next.player.skills.crafting).toEqual({ level: 10, points: 0 });
    expect(rested.player.skills).toEqual(next.player.skills);
  });
});

describe('Building and Crafting speed', () => {
  it('takes 5% off the time per level, half the time at level 10', () => {
    // Arrange
    const builder = withSkill(createTestGame('camp'), 'building', 10);
    const knifeMaker = crafter(5, { stick: 1, flint: 1 });

    // Act
    const step = findAction(builder, 'build:sleepingMat')?.minutes;
    const knife = findAction(knifeMaker, 'craft:knife')?.minutes;

    // Assert
    expect([skilledMinutes(15, 0), skilledMinutes(15, 1)]).toEqual([15, 14]);
    expect(skilledMinutes(20, 10)).toBe(10);
    expect(step).toBe(8);
    expect(knife).toBe(15);
  });
});

describe('Foraging', () => {
  it('raises find chances by 10% per level', () => {
    // Arrange
    const state = withSkill(createTestGame('forest'), 'foraging', 1);
    const ctx = createActionContext(state);
    const skilled = withSkill(createTestGame('forest'), 'foraging', 5);

    // Act
    const resin = findAction(skilled, 'obj:location:sticks')?.gains?.find((g) => g.itemId === 'resin')?.chance;

    // Assert
    expect(ctx.findChance(0.2, { perception: false })).toBeCloseTo(0.22);
    expect(ctx.findChance(0.2)).toBeCloseTo(0.22);
    expect(resin).toBeCloseTo(0.075);
  });

  it('gathers 5% more per level, a fraction turning into one more item by chance', () => {
    // Act
    const results = SEEDS.map((seed) => {
      const state = withSkill(createTestGame('beach', seed), 'foraging', 10);
      const ctx = createActionContext(state);
      return [ctx.gathered(2), ctx.gathered(3)];
    });

    // Assert
    expect(results.every(([two]) => two === 3)).toBe(true);
    expect(new Set(results.map(([, three]) => three))).toEqual(new Set([4, 5]));
  });

  it('never gathers more than is left', () => {
    // Arrange
    const state = withSkill(createTestGame('forest'), 'foraging', 10);
    state.locations.forest = {
      visited: true,
      constructions: {},
      groundItems: [],
      finds: {},
      buildings: {},
      stock: { 'location:sticks': { amount: 1, updatedAt: 0 } },
    };

    // Act
    const next = performAction(state, 'obj:location:sticks');

    // Assert
    expect(count(next, 'stick')).toBe(1);
  });

  it('changes nothing at level 0', () => {
    // Arrange
    const state = createTestGame();
    const ctx = createActionContext(state);
    const rng = state.rng;

    // Act
    const gathered = ctx.gathered(3);

    // Assert
    expect(gathered).toBe(3);
    expect(state.rng).toBe(rng);
  });
});

describe('getting resources back', () => {
  it('never happens below level 5', () => {
    // Act
    const results = SEEDS.map((seed) => performAction(crafter(4, { threads: 2 }, seed), 'craft:rope'));

    // Assert
    expect(results.every((s) => count(s, 'threads') === 0)).toBe(true);
  });

  it('always gives back one of an ingredient used twice at level 9', () => {
    // Act
    const next = performAction(crafter(9, { threads: 2 }), 'craft:rope');

    // Assert
    expect(count(next, 'rope')).toBe(1);
    expect(count(next, 'threads')).toBe(1);
    expect(next.log.map((e) => e.text)).toContain('Your Crafting skill saved some materials: Threads.');
  });

  it('never gives back an ingredient used only once', () => {
    // Act
    const next = performAction(crafter(10, { stick: 1, flint: 1 }), 'craft:knife');

    // Assert
    expect(next.player.inventory).toEqual([{ itemId: 'knife', quantity: 1, health: 50 }]);
  });

  it('gives back a second resource half the time at level 10, never the last one of an ingredient', () => {
    // Act
    const ropeArmor = SEEDS.map((seed) => performAction(crafter(10, { rope: 5, threads: 1 }, seed), 'craft:rope-armor'));
    const rope = SEEDS.map((seed) => performAction(crafter(10, { threads: 2 }, seed), 'craft:rope'));

    // Assert
    expect(new Set(ropeArmor.map((s) => count(s, 'rope')))).toEqual(new Set([1, 2]));
    expect(ropeArmor.every((s) => count(s, 'threads') === 0)).toBe(true);
    expect(rope.every((s) => count(s, 'threads') === 1)).toBe(true);
  });

  it('gives back building materials when the building is finished', () => {
    // Arrange
    const state = withSkill(createTestGame('camp'), 'building', 9);
    giveItem(state, 'stick', 5);
    giveItem(state, 'grass', 3);
    const started = structuredClone(state);
    started.player.inventory = [];
    started.locations.camp = {
      visited: true,
      constructions: { campfire: { stepsDone: 1 } },
      groundItems: [],
      stock: {},
      finds: {},
      buildings: {},
    };

    // Act
    const firstStep = performAction(state, 'build:campfire');
    const finished = performAction(firstStep, 'build:campfire');
    const finishedOld = performAction(started, 'build:campfire');

    // Assert
    expect(firstStep.player.inventory).toEqual([]);
    expect(finished.player.inventory).toHaveLength(1);
    expect(['stick', 'grass']).toContain(finished.player.inventory[0]?.itemId);
    expect(finishedOld.player.inventory).toHaveLength(1);
    expect(['stick', 'grass']).toContain(finishedOld.player.inventory[0]?.itemId);
  });
});

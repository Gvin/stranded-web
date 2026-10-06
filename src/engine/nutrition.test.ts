import { describe, expect, it } from 'vitest';
import { RECIPES } from '../data/recipes';
import { getActions } from './actions';
import { getCharacterSheet } from './character';
import { performAction } from './game';
import { createTestGame, giveItem } from './testUtils';
import type { GameState } from './types';

const hungryWith = (itemId: string, quantity = 1): GameState => {
  const state = createTestGame('beach');
  state.player.stats.hunger = 80;
  state.player.stats.thirst = 50;
  giveItem(state, itemId, quantity);
  return state;
};

describe('nutrition', () => {
  it('starts evenly split across vegetables, meat and fruits', () => {
    // Act
    const { nutrition } = createTestGame().player;

    // Assert
    expect(nutrition).toEqual({ vegetables: 33, meat: 33, fruits: 33 });
  });

  it('adds 2 to the eaten food group and takes 1 from each of the others', () => {
    // Arrange
    const state = hungryWith('wild-berries');

    // Act
    const next = performAction(state, 'eat:wild-berries');

    // Assert
    expect(next.player.nutrition).toEqual({ vegetables: 32, meat: 32, fruits: 35 });
  });

  it('never lets the food groups add up to more than 99', () => {
    // Arrange
    const state = hungryWith('raw-crab');
    state.player.nutrition = { vegetables: 0, meat: 50, fruits: 49 };

    // Act
    const next = performAction(state, 'eat:raw-crab');

    // Assert
    expect(next.player.nutrition).toEqual({ vegetables: 0, meat: 51, fruits: 48 });
  });

  it('leaves the food groups alone for water', () => {
    // Arrange
    const state = hungryWith('water-bottle');

    // Act
    const next = performAction(state, 'eat:water-bottle');

    // Assert
    expect(next.player.nutrition).toEqual({ vegetables: 33, meat: 33, fruits: 33 });
  });

  it('counts ship biscuits as vegetables', () => {
    // Arrange
    const state = hungryWith('ship-biscuit');

    // Act
    const next = performAction(state, 'eat:ship-biscuit');

    // Assert
    expect(next.player.nutrition).toEqual({ vegetables: 35, meat: 32, fruits: 32 });
  });
});

describe('malnutrition', () => {
  it('weakens every attribute by 15% while a food group is empty', () => {
    // Arrange
    const state = createTestGame();
    state.player.nutrition = { vegetables: 0, meat: 50, fruits: 49 };

    // Act
    const sheet = getCharacterSheet(state);

    // Assert
    expect(sheet.conditions.map((c) => c.name)).toEqual(['Malnutrition']);
    expect(sheet.conditions[0]?.description).toMatch(/missing vegetables/);
    expect(Object.values(sheet.attributes).map((a) => a.effective)).toEqual([17, 17, 17, 17]);
    expect(sheet.max.energy).toBe(97);
  });

  it('sets in when a food group runs out and ends once it is eaten again', () => {
    // Arrange
    const state = hungryWith('wild-berries');
    giveItem(state, 'seaweed');
    state.player.nutrition = { vegetables: 1, meat: 50, fruits: 48 };

    // Act
    const malnourished = performAction(state, 'eat:wild-berries');
    const recovered = performAction(malnourished, 'eat:seaweed');

    // Assert
    expect(getCharacterSheet(malnourished).conditions.map((c) => c.id)).toContain('malnutrition');
    expect(malnourished.log.map((e) => e.text)).toContain('Your body craves vegetables. You are suffering from malnutrition.');
    expect(getCharacterSheet(recovered).conditions.map((c) => c.id)).not.toContain('malnutrition');
    expect(recovered.log.map((e) => e.text)).toContain('Your diet is balanced again. The malnutrition is over.');
  });
});

describe('crafting energy', () => {
  it('costs 1 energy for every recipe', () => {
    // Arrange
    const state = createTestGame();
    giveItem(state, 'stick');
    giveItem(state, 'vine');
    giveItem(state, 'flint');

    // Act
    const energies = getActions(state)
      .filter((a) => a.category === 'craft')
      .map((a) => a.energy);
    const next = performAction(state, 'craft:axe');

    // Assert
    expect(energies).toHaveLength(RECIPES.length);
    expect(new Set(energies)).toEqual(new Set([1]));
    expect(next.player.stats.energy).toBe(99);
  });
});

import { describe, expect, it } from 'vitest';
import { getCharacterSheet } from './character';
import { applyBodyCondition } from './conditions';
import { createTestGame } from './testUtils';

describe('getCharacterSheet', () => {
  it('returns base attributes and derived maxima for a healthy player', () => {
    // Arrange
    const state = createTestGame();

    // Act
    const sheet = getCharacterSheet(state);

    // Assert
    expect(sheet.attributes.strength.effective).toBe(20);
    expect(sheet.max).toEqual({ health: 100, thirst: 100, hunger: 100, energy: 100 });
    expect(sheet.carryCapacity).toBe(20);
    expect(sheet.conditions).toEqual([]);
  });

  it('applies an injured arm as a percentage strength penalty', () => {
    // Arrange
    const state = createTestGame();
    applyBodyCondition(state.player, 'rightArm', 'injured');

    // Act
    const strength = getCharacterSheet(state).attributes.strength;

    // Assert
    expect(strength.percent).toBe(-10);
    expect(strength.effective).toBe(18);
    expect(strength.modifiers).toEqual([{ source: 'Right arm: Injured', percent: -10 }]);
  });

  it('penalises a bandaged wound less than an open one', () => {
    // Arrange
    const state = createTestGame();
    applyBodyCondition(state.player, 'head', 'injured');
    const injured = getCharacterSheet(state).attributes.perception.effective;
    applyBodyCondition(state.player, 'head', 'bandaged');

    // Act
    const bandaged = getCharacterSheet(state).attributes.perception.effective;

    // Assert
    expect(injured).toBe(18);
    expect(bandaged).toBeCloseTo(19.2);
  });

  it('stacks penalties additively from several sources', () => {
    // Arrange
    const state = createTestGame();
    applyBodyCondition(state.player, 'leftLeg', 'fractured');
    applyBodyCondition(state.player, 'rightLeg', 'injured');
    state.player.conditions.push({ id: 'dizzy', remaining: 90 });

    // Act
    const agility = getCharacterSheet(state).attributes.agility;

    // Assert
    expect(agility.percent).toBe(-55);
    expect(agility.effective).toBe(9);
  });

  it('derives thirsty and starving severities from how full the bars are', () => {
    // Arrange
    const state = createTestGame();
    state.player.stats.thirst = 80;
    state.player.stats.hunger = 55;

    // Act
    const sheet = getCharacterSheet(state);

    // Assert
    expect(sheet.conditions.map((c) => c.name)).toEqual(['Starving (light)', 'Thirsty (medium)']);
    expect(sheet.attributes.strength.percent).toBe(-30);
    expect(sheet.attributes.endurance.percent).toBe(0);
  });

  it('makes the player dizzy when energy is nearly gone', () => {
    // Arrange
    const state = createTestGame();
    state.player.stats.energy = 5;

    // Act
    const sheet = getCharacterSheet(state);

    // Assert
    expect(sheet.conditions.map((c) => c.id)).toEqual(['dizzy']);
    expect(sheet.attributes.perception.percent).toBe(-20);
  });

  it('raises maxima and carry capacity with higher attributes', () => {
    // Arrange
    const state = createTestGame();
    state.player.attributes.strength.base = 60;
    state.player.attributes.endurance.base = 40;

    // Act
    const sheet = getCharacterSheet(state);

    // Assert
    expect(sheet.max.health).toBe(140);
    expect(sheet.max.energy).toBe(120);
    expect(sheet.max.thirst).toBe(120);
    expect(sheet.carryCapacity).toBe(40);
  });

  it('never reduces an attribute below the minimum', () => {
    // Arrange
    const state = createTestGame();
    applyBodyCondition(state.player, 'leftLeg', 'missing');
    applyBodyCondition(state.player, 'rightLeg', 'missing');
    state.player.conditions.push({ id: 'dizzy', remaining: 90 });

    // Act
    const agility = getCharacterSheet(state).attributes.agility;

    // Assert
    expect(agility.percent).toBe(-90);
    expect(agility.effective).toBe(2);
  });

  it('scales dizziness penalties and names with its severity', () => {
    // Arrange
    const light = createTestGame();
    light.player.conditions.push({ id: 'dizzy', remaining: 30 });
    const heavy = createTestGame();
    heavy.player.conditions.push({ id: 'dizzy', remaining: 170 });

    // Act
    const lightSheet = getCharacterSheet(light);
    const heavySheet = getCharacterSheet(heavy);

    // Assert
    expect(lightSheet.conditions[0]?.name).toBe('Dizzy (light)');
    expect(lightSheet.attributes.agility.percent).toBe(-10);
    expect(heavySheet.conditions[0]?.name).toBe('Dizzy (heavy)');
    expect(heavySheet.attributes.agility.percent).toBe(-35);
  });

  it('keeps the worse dizziness when exhaustion and a stored dizziness overlap', () => {
    // Arrange
    const state = createTestGame();
    state.player.stats.energy = 5;
    state.player.conditions.push({ id: 'dizzy', remaining: 30 });

    // Act
    const dizzy = getCharacterSheet(state).conditions.filter((c) => c.id === 'dizzy');

    // Assert
    expect(dizzy.map((c) => c.severity)).toEqual(['medium']);
  });
});

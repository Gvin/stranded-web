import { describe, expect, it } from 'vitest';
import { applyBodyCondition, bodyConditionSeverity } from './conditions';
import { advanceTime } from './simulation';
import { createTestGame } from './testUtils';
import { days, hours, minutesUntilHour } from './time';
import { dropOnGround } from './world';

describe('advanceTime', () => {
  it('raises thirst and hunger over time', () => {
    // Arrange
    const state = createTestGame();

    // Act
    advanceTime(state, hours(4), 'awake');

    // Assert
    expect(state.time).toBe(hours(4));
    expect(state.player.stats.thirst).toBeCloseTo(16);
    expect(state.player.stats.hunger).toBeCloseTo(8);
  });

  it('raises thirst and hunger less while sleeping and restores energy, 7 an hour on the bare ground', () => {
    // Arrange
    const state = createTestGame();
    state.player.stats.energy = 10;

    // Act
    advanceTime(state, hours(4), 'sleeping');

    // Assert
    expect(state.player.stats.thirst).toBeCloseTo(9.6);
    expect(state.player.stats.energy).toBeCloseTo(38);
  });

  it('eases heavy bleeding through medium and light until it stops', () => {
    // Arrange
    const state = createTestGame();
    applyBodyCondition(state.player, 'leftLeg', 'bleeding', 'heavy');
    const severityAt = () => {
      const bleeding = state.player.body.leftLeg.find((c) => c.id === 'bleeding');
      return bleeding ? bodyConditionSeverity(bleeding) : 'stopped';
    };

    // Act
    const severities: string[] = [];
    for (let hour = 0; hour < 5; hour++) {
      advanceTime(state, hours(1), 'awake');
      severities.push(severityAt() ?? '');
    }

    // Assert
    expect(severities).toEqual(['heavy', 'medium', 'medium', 'light', 'stopped']);
    // why: bleeding takes the torso's health, whatever part bleeds: 2.4 an hour heavy, 1.2 medium, 0.45 light.
    expect(state.player.health.torso).toBeCloseTo(30 - 2.4 * 2 - 1.2 * 1.5 - 0.45, 0);
    // why: the leg is injured along with the bleeding, which takes a quarter off its max health.
    expect(state.player.health.leftLeg).toBe(11.25);
    expect(state.log.some((e) => e.text === 'The bleeding from your left leg is slowing down.')).toBe(true);
    expect(state.log.some((e) => e.text === 'The bleeding from your left leg has stopped.')).toBe(true);
  });

  it('kills the player and records the cause when health runs out', () => {
    // Arrange
    const state = createTestGame();
    state.player.health.torso = 1.1;
    applyBodyCondition(state.player, 'torso', 'bleeding', 'heavy');

    // Act
    advanceTime(state, hours(2), 'awake');

    // Assert
    expect(state.status).toBe('dead');
    expect(state.deathCause).toBe('You bled to death.');
    expect(state.time).toBe(30);
  });

  it('kills the player from dehydration when the thirst bar stays full', () => {
    // Arrange
    const state = createTestGame();
    state.player.stats.thirst = 100;
    state.player.health.torso = 4;

    // Act
    advanceTime(state, hours(3), 'awake');

    // Assert
    expect(state.status).toBe('dead');
    expect(state.deathCause).toBe('You died of dehydration.');
  });

  it('heals an untreated injury with time', () => {
    // Arrange
    const state = createTestGame();
    applyBodyCondition(state.player, 'rightArm', 'injured');

    // Act
    for (let half = 0; half < 6; half++) {
      state.player.stats = { thirst: 0, hunger: 0, energy: 100 };
      advanceTime(state, days(0.5), 'resting');
    }

    // Assert
    expect(state.status).toBe('alive');
    expect(state.player.body.rightArm).toEqual([]);
    expect(state.log.some((e) => e.text === 'The wound on your right arm has closed up.')).toBe(true);
  });

  it('heals a bandaged injury twice as fast', () => {
    // Arrange
    const state = createTestGame();
    applyBodyCondition(state.player, 'rightArm', 'injured');
    applyBodyCondition(state.player, 'leftArm', 'injured');
    applyBodyCondition(state.player, 'leftArm', 'bandaged');

    // Act
    advanceTime(state, days(1.5), 'resting');

    // Assert
    expect(state.player.body.leftArm).toEqual([]);
    expect(state.player.body.rightArm.map((c) => c.id)).toEqual(['injured']);
  });

  it('never heals a fracture that is not splinted', () => {
    // Arrange
    const state = createTestGame();
    applyBodyCondition(state.player, 'rightLeg', 'fractured');

    // Act
    advanceTime(state, days(10), 'resting');

    // Assert
    expect(state.player.body.rightLeg.map((c) => c.id)).toEqual(['fractured']);
  });

  it('lets poison ease and wear off with time', () => {
    // Arrange
    const state = createTestGame();
    state.player.conditions.push({ id: 'poisoned', remaining: hours(6) });

    // Act
    advanceTime(state, hours(3), 'awake');
    const halfway = state.player.conditions[0]?.remaining;
    advanceTime(state, hours(3), 'awake');

    // Assert
    expect(halfway).toBe(hours(3));
    expect(state.player.conditions).toEqual([]);
    // why: poison takes the torso's health: 1.8 an hour heavy, 0.9 medium, 0.3 light, two hours each.
    expect(state.player.health.torso).toBeCloseTo(30 - 1.8 * 2 - 0.9 * 2 - 0.3 * 2, 0);
    expect(state.log.some((e) => e.text === 'The nausea is easing a little.')).toBe(true);
  });

  it('removes dropped items once their ground lifetime has passed', () => {
    // Arrange
    const state = createTestGame();
    dropOnGround(state, 'beach', 'raw-fish', 1);
    dropOnGround(state, 'beach', 'stone', 2);

    // Act
    advanceTime(state, hours(9), 'awake');

    // Assert
    expect(state.locations.beach?.groundItems.map((g) => g.itemId)).toEqual(['stone']);
    expect(state.log.at(-1)?.text).toBe('The raw fish you left here has rotted away.');
  });
});

describe('minutesUntilHour', () => {
  it('counts the minutes until the clock next shows the hour', () => {
    // Act
    const fromStart = minutesUntilHour(0, 6);
    const fromEvening = minutesUntilHour(13 * 60, 6);
    const atSix = minutesUntilHour(23 * 60, 6);

    // Assert
    expect(fromStart).toBe(23 * 60);
    expect(fromEvening).toBe(10 * 60);
    expect(atSix).toBe(24 * 60);
  });
});

import { describe, expect, it } from 'vitest';
import { createNewGame, performAction } from './game';
import { damagePart, fullPartHealth, partMaxHealth } from './body';
import { getCharacterSheet } from './character';
import { applyBodyCondition } from './conditions';
import { advanceTime } from './simulation';
import { createTestGame, giveItem } from './testUtils';
import { hours } from './time';
import { BODY_PART_IDS, type GameState } from './types';

const fullHealth = (state: GameState) => Object.fromEntries(BODY_PART_IDS.map((part) => [part, fullPartHealth(state.player, part)]));

describe('body part health', () => {
  it('splits 80 + Strength between the parts: torso 30%, head 10%, each arm and leg 15%', () => {
    // Arrange
    const strong = createTestGame();
    strong.player.attributes.strength.base = 40;

    // Act
    const shares = [fullHealth(createTestGame()), fullHealth(strong)];

    // Assert
    expect(shares[0]).toEqual({ head: 10, torso: 30, leftArm: 15, rightArm: 15, leftLeg: 15, rightLeg: 15 });
    expect(shares[1]).toEqual({ head: 12, torso: 36, leftArm: 18, rightArm: 18, leftLeg: 18, rightLeg: 18 });
  });

  it('takes the max health from the Strength before modifiers, so being weaker for a while does not lower it', () => {
    // Arrange
    const state = createTestGame();
    state.player.conditions.push({ id: 'awfulSleep', remaining: hours(20) });

    // Act
    const sheet = getCharacterSheet(state);

    // Assert
    expect(sheet.attributes.strength.effective).toBeLessThan(20);
    expect(sheet.max.health).toBe(100);
    expect(sheet.health).toBe(100);
  });

  it("lowers a part's max health by its conditions, which add up: Injured 25%, Bandaged 10%, Fractured 50%, Splinted 25%", () => {
    // Arrange
    const state = createTestGame();
    applyBodyCondition(state.player, 'leftArm', 'injured');
    applyBodyCondition(state.player, 'rightArm', 'injured');
    applyBodyCondition(state.player, 'rightArm', 'fractured');
    applyBodyCondition(state.player, 'leftLeg', 'bandaged');
    applyBodyCondition(state.player, 'leftLeg', 'splinted');
    applyBodyCondition(state.player, 'rightLeg', 'missing');
    applyBodyCondition(state.player, 'torso', 'burnt');

    // Act
    const max = Object.fromEntries(BODY_PART_IDS.map((part) => [part, partMaxHealth(state.player, part)]));

    // Assert
    expect(max).toEqual({ head: 10, torso: 22.5, leftArm: 11.25, rightArm: 3.75, leftLeg: 9.75, rightLeg: 0 });
    expect(getCharacterSheet(state).max.health).toBeCloseTo(57.25);
  });

  it('starts a new game with every part at 90% of its health, and the injured left arm at its lower max', () => {
    // Act
    const { health } = createNewGame(1).player;

    // Assert
    expect(health).toEqual({ head: 9, torso: 27, leftArm: 11.25, rightArm: 13.5, leftLeg: 13.5, rightLeg: 13.5 });
  });
});

describe('damage to a body part', () => {
  it('injures a part that drops below half its health, and only once', () => {
    // Arrange
    const state = createTestGame();

    // Act
    const first = damagePart(state.player, 'torso', 14);
    const second = damagePart(state.player, 'torso', 2);
    const third = damagePart(state.player, 'torso', 2);

    // Assert
    expect([first.conditions, second.conditions, third.conditions]).toEqual([[], ['injured'], []]);
    expect(state.player.health.torso).toBe(12);
  });

  it('fractures an arm or a leg that drops below a quarter of its health, but never the torso or the head', () => {
    // Arrange
    const state = createTestGame();

    // Act
    const arm = damagePart(state.player, 'leftArm', 12);
    const head = damagePart(state.player, 'head', 8);

    // Assert
    expect(arm.conditions).toEqual(['injured', 'fractured']);
    expect(head.conditions).toEqual(['injured']);
    expect(state.player.health.leftArm).toBe(3);
  });

  it('injures a bandaged part again when it drops below half, taking the bandage off', () => {
    // Arrange
    const state = createTestGame();
    applyBodyCondition(state.player, 'leftLeg', 'bandaged');
    state.player.health.leftLeg = 13.5;

    // Act
    damagePart(state.player, 'leftLeg', 7);

    // Assert
    expect(state.player.body.leftLeg.map((c) => c.id)).toEqual(['injured']);
  });

  it('takes off an arm or a leg at 0 health, and the hand lets go of what it held', () => {
    // Arrange
    const state = createTestGame();
    state.player.equipment.leftHand = { itemId: 'knife' };

    // Act
    const result = damagePart(state.player, 'leftArm', 20);

    // Assert
    expect(result).toEqual({ conditions: ['missing'], released: ['knife'] });
    expect(state.player.body.leftArm).toEqual([{ id: 'missing' }]);
    expect(state.player.health.leftArm).toBe(0);
    expect(state.player.inventory).toEqual([{ itemId: 'knife', quantity: 1 }]);
  });

  it('leaves at least 1 health after a single hit on a part with 5 or more, but not on a part below 5', () => {
    // Arrange
    const state = createTestGame();
    state.player.health.rightArm = 4;

    // Act
    damagePart(state.player, 'leftArm', 50, { singleHit: true });
    damagePart(state.player, 'rightArm', 50, { singleHit: true });

    // Assert
    expect(state.player.health.leftArm).toBe(1);
    expect(state.player.body.rightArm).toEqual([{ id: 'missing' }]);
  });
});

describe('death and healing', () => {
  it('kills the player when the torso drops to 0, however healthy the other parts are', () => {
    // Arrange
    const state = createTestGame();
    state.player.health.torso = 0.5;
    applyBodyCondition(state.player, 'leftLeg', 'bleeding', 'heavy');

    // Act
    advanceTime(state, hours(1), 'awake');

    // Assert
    expect(state.status).toBe('dead');
    expect(state.deathCause).toBe('You bled to death.');
  });

  it('kills the player when the head drops to 0', () => {
    // Arrange
    const state = createTestGame();
    state.player.health.head = 0;
    giveItem(state, 'stick');

    // Act
    const next = performAction(state, 'drop:stick:one');

    // Assert
    expect(next.status).toBe('dead');
  });

  it('shares healing evenly between the parts, and loses the share of a part that needs none', () => {
    // Arrange
    const state = createTestGame();
    state.player.health.torso = 20;
    state.player.health.head = 9.9;

    // Act
    advanceTime(state, hours(6), 'resting');

    // Assert
    expect(state.player.health.torso).toBeCloseTo(20 + (6 * 0.5) / 6);
    expect(state.player.health.head).toBeCloseTo(10);
    expect(state.player.health.leftArm).toBe(15);
  });
});

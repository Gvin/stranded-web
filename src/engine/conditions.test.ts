import { describe, expect, it } from 'vitest';
import { applyBodyCondition, bodyConditionHealsIn, bodyConditionSeverity, canHoldWith } from './conditions';
import { createActionContext } from './context';
import { createTestGame } from './testUtils';
import { days, hours } from './time';

const ids = (conditions: { id: string }[]) => conditions.map((c) => c.id);

describe('applyBodyCondition', () => {
  it('replaces injured, burnt and bleeding with bandaged', () => {
    // Arrange
    const { player } = createTestGame();
    applyBodyCondition(player, 'torso', 'injured');
    applyBodyCondition(player, 'torso', 'burnt');
    applyBodyCondition(player, 'torso', 'bleeding');

    // Act
    applyBodyCondition(player, 'torso', 'bandaged');

    // Assert
    expect(ids(player.body.torso)).toEqual(['bandaged']);
  });

  it('lets a bandage carry on the healing of the wound at twice the speed', () => {
    // Arrange
    const { player } = createTestGame();
    applyBodyCondition(player, 'leftArm', 'injured');
    const bare = player.body.leftArm[0];
    const healsInBare = bare ? bodyConditionHealsIn(bare) : undefined;

    // Act
    applyBodyCondition(player, 'leftArm', 'bandaged');

    // Assert
    const bandaged = player.body.leftArm[0];
    expect(healsInBare).toBe(days(3));
    expect(bandaged && bodyConditionHealsIn(bandaged)).toBe(days(1.5));
  });

  it('replaces fractured with splinted but keeps other conditions', () => {
    // Arrange
    const { player } = createTestGame();
    applyBodyCondition(player, 'leftLeg', 'injured');
    applyBodyCondition(player, 'leftLeg', 'fractured');

    // Act
    applyBodyCondition(player, 'leftLeg', 'splinted');

    // Assert
    expect(ids(player.body.leftLeg)).toEqual(['injured', 'splinted']);
  });

  it('never gives a fracture a healing time', () => {
    // Arrange
    const { player } = createTestGame();

    // Act
    applyBodyCondition(player, 'rightLeg', 'fractured');

    // Assert
    expect(player.body.rightLeg).toEqual([{ id: 'fractured' }]);
  });

  it('replaces a bandage when the body part is injured again', () => {
    // Arrange
    const { player } = createTestGame();
    applyBodyCondition(player, 'head', 'bandaged');

    // Act
    applyBodyCondition(player, 'head', 'injured');

    // Assert
    expect(ids(player.body.head)).toEqual(['injured']);
  });

  it('rejects conditions that the body part cannot have', () => {
    // Arrange
    const { player } = createTestGame();

    // Act
    const fracturedHead = applyBodyCondition(player, 'head', 'fractured');
    const missingTorso = applyBodyCondition(player, 'torso', 'missing');

    // Assert
    expect(fracturedHead).toBe(false);
    expect(missingTorso).toBe(false);
    expect(player.body.head).toEqual([]);
    expect(player.body.torso).toEqual([]);
  });

  it('removes everything else from a missing limb and accepts nothing afterwards', () => {
    // Arrange
    const { player } = createTestGame();
    applyBodyCondition(player, 'rightArm', 'fractured');
    applyBodyCondition(player, 'rightArm', 'bleeding');
    applyBodyCondition(player, 'rightArm', 'missing');

    // Act
    const applied = applyBodyCondition(player, 'rightArm', 'injured');

    // Assert
    expect(applied).toBe(false);
    expect(ids(player.body.rightArm)).toEqual(['missing']);
  });

  it('restarts the healing of a wound that is injured again', () => {
    // Arrange
    const { player } = createTestGame();
    player.body.leftArm = [{ id: 'injured', remaining: 100 }];

    // Act
    applyBodyCondition(player, 'leftArm', 'injured');

    // Assert
    expect(player.body.leftArm).toEqual([{ id: 'injured', remaining: days(3) }]);
  });

  it('starts bleeding at the given severity', () => {
    // Arrange
    const { player } = createTestGame();

    // Act
    applyBodyCondition(player, 'leftLeg', 'bleeding', 'light');
    applyBodyCondition(player, 'rightLeg', 'bleeding', 'heavy');

    // Assert
    expect(player.body.leftLeg[0] && bodyConditionSeverity(player.body.leftLeg[0])).toBe('light');
    expect(player.body.rightLeg[0] && bodyConditionSeverity(player.body.rightLeg[0])).toBe('heavy');
  });

  it('makes existing bleeding worse instead of adding a second one', () => {
    // Arrange
    const { player } = createTestGame();
    applyBodyCondition(player, 'torso', 'bleeding', 'light');

    // Act
    applyBodyCondition(player, 'torso', 'bleeding', 'medium');

    // Assert
    expect(player.body.torso).toHaveLength(1);
    expect(player.body.torso[0] && bodyConditionSeverity(player.body.torso[0])).toBe('heavy');
    expect(player.body.torso[0]?.remaining).toBe(hours(1) + hours(2.5));
  });
});

describe('addBodyCondition', () => {
  it('puts away the item held by an arm that gets fractured', () => {
    // Arrange
    const state = createTestGame();
    state.player.equipment.rightHand = { itemId: 'knife' };
    const ctx = createActionContext(state);

    // Act
    ctx.addBodyCondition('rightArm', 'fractured');

    // Assert
    expect(state.player.equipment.rightHand).toBeUndefined();
    expect(state.player.inventory).toEqual([{ itemId: 'knife', quantity: 1 }]);
    expect(canHoldWith(state.player, 'rightArm')).toBe(false);
    expect(state.log.at(-1)?.text).toBe('You can no longer hold the knife with your right arm.');
  });
});

describe('addTimedCondition', () => {
  it('stacks poison up to the heavy maximum', () => {
    // Arrange
    const state = createTestGame();
    const ctx = createActionContext(state);

    // Act
    ctx.addTimedCondition('poisoned', 'heavy');
    ctx.addTimedCondition('poisoned', 'medium');

    // Assert
    expect(state.player.conditions).toEqual([{ id: 'poisoned', remaining: hours(6) }]);
  });
});

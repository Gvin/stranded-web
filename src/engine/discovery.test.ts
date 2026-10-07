import { describe, expect, it } from 'vitest';
import { createActionContext } from './context';
import { createNewGame, findAction, performAction } from './game';
import { addToInventory } from './inventory';
import type { GameState } from './types';

/** A brand-new game, knowing only the clothes the player washed ashore in. */
function newGame(locationId = 'beach'): GameState {
  const state = createNewGame(5);
  state.player.locationId = locationId;
  return state;
}

const gainLabels = (state: GameState, actionId: string) => findAction(state, actionId)?.gains?.map((g) => g.label);

describe('unknown finds', () => {
  it('show only their chance until the player has had the item', () => {
    // Act
    const gains = findAction(newGame(), 'obj:wreckage:search')?.gains ?? [];

    // Assert
    expect(gains.length).toBeGreaterThan(3);
    expect(gains.every((g) => g.unknown && g.label === 'Unknown find' && g.itemId === undefined)).toBe(true);
    expect(gains.every((g) => g.chance !== undefined && g.chance > 0)).toBe(true);
  });

  it('show by name once the player has had the item, even if it did not fit into the bag', () => {
    // Arrange
    const state = newGame();
    state.player.attributes.strength.base = 1;
    const ctx = createActionContext(state);

    // Act
    ctx.addItem('cloth');
    ctx.addItem('log', 20);

    // Assert
    expect(state.player.knownItems).toEqual(['clothes', 'cloth', 'log']);
    expect(gainLabels(state, 'obj:wreckage:search')?.slice(0, 2)).toEqual(['Cloth ×1–2', 'Log']);
  });

  it('never hide what an action certainly gives', () => {
    // Act
    const sticks = gainLabels(newGame('forest'), 'obj:location:sticks');

    // Assert
    expect(sticks?.[0]).toBe('Stick ×2–3');
  });
});

describe('untried food', () => {
  it('keeps what it does unknown until the player has eaten or drunk it once', () => {
    // Arrange
    const state = newGame();
    addToInventory(state.player, 'ship-biscuit', 2);
    addToInventory(state.player, 'water-bottle', 1);

    // Act
    const before = findAction(state, 'eat:ship-biscuit');
    const eaten = performAction(state, 'eat:ship-biscuit');
    const after = findAction(eaten, 'eat:ship-biscuit');

    // Assert
    expect(before?.gains?.map((g) => g.label)).toEqual(['Unknown until you eat it']);
    expect(gainLabels(state, 'eat:water-bottle')).toEqual(['Unknown until you drink it']);
    expect(eaten.player.triedFoods).toEqual(['ship-biscuit']);
    expect(after?.gains?.map((g) => g.label)).toEqual(['−18 hunger', '+3 thirst']);
  });

  it('keeps the risks unknown too', () => {
    // Arrange
    const state = newGame('forest');
    addToInventory(state.player, 'bitter-berries', 2);

    // Act
    const before = findAction(state, 'eat:bitter-berries')?.details;
    const after = findAction(performAction(state, 'eat:bitter-berries'), 'eat:bitter-berries')?.details;

    // Assert
    expect(before).toBeUndefined();
    expect(after).toBe('Risky: 50% chance of medium poisoned.');
  });
});

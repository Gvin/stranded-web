import { createNewGame } from './game';
import type { GameState } from './types';

/** A fresh game with a fixed seed and a healthy, rested player in the given location. */
export function createTestGame(locationId = 'beach', seed = 12345): GameState {
  const state = createNewGame(seed);
  state.player.locationId = locationId;
  state.player.stats = { health: 100, thirst: 0, hunger: 0, energy: 100 };
  state.player.body.leftArm = [];
  return state;
}

export function giveItem(state: GameState, itemId: string, quantity = 1): void {
  const stack = state.player.inventory.find((s) => s.itemId === itemId);
  if (stack) {
    stack.quantity += quantity;
  } else {
    state.player.inventory.push({ itemId, quantity });
  }
}

import { ITEMS } from '../data/items';
import { fullHealthByPart } from './body';
import { createNewGame } from './game';
import { addToInventory } from './inventory';
import { days } from './time';
import type { GameState } from './types';

/**
 * A fresh game with a fixed seed and a healthy (every body part at full health), rested player in the given location, who already knows every item and
 * has tried every food (so finds and food effects show; discovery is tested on `createNewGame`).
 * The sky stays cloudy for a year, so only the time of day changes the temperature.
 */
export function createTestGame(locationId = 'beach', seed = 12345): GameState {
  const state = createNewGame(seed);
  state.player.locationId = locationId;
  state.player.stats = { thirst: 0, hunger: 0, energy: 100 };
  state.player.body.leftArm = [];
  state.player.health = fullHealthByPart(state.player.attributes.strength.base);
  state.environment = { weather: 'cloudy', until: days(365) };
  state.player.knownItems = Object.keys(ITEMS);
  state.player.triedFoods = Object.values(ITEMS)
    .filter((def) => def.category === 'food')
    .map((def) => def.id);
  return state;
}

/** Puts items into the bag; items that wear out come at full health. */
export function giveItem(state: GameState, itemId: string, quantity = 1): void {
  addToInventory(state.player, itemId, quantity);
}

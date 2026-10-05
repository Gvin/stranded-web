import type { GameState } from '../engine/types';
import { deserializeGame, type LoadResult, serializeGame } from './saveFile';

const SAVE_KEY = 'stranded.save';

export type StoredGame = LoadResult | { status: 'none' };

export function loadGame(storage: Storage = window.localStorage): StoredGame {
  let json: string | null;
  try {
    json = storage.getItem(SAVE_KEY);
  } catch {
    return { status: 'corrupt', reason: 'Browser storage is not available.' };
  }
  return json === null ? { status: 'none' } : deserializeGame(json);
}

/** Writes the game to storage and returns whether it succeeded (storage can be full or disabled). */
export function saveGame(state: GameState, storage: Storage = window.localStorage): boolean {
  try {
    storage.setItem(SAVE_KEY, serializeGame(state));
    return true;
  } catch {
    return false;
  }
}

export function deleteSave(storage: Storage = window.localStorage): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

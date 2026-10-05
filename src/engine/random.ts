import type { GameState } from './types';

/** Returns a float in [0, 1) and advances the RNG stored in the state (mulberry32). */
export function nextRandom(state: GameState): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Returns an integer in [min, max], both inclusive. */
export function randomInt(state: GameState, min: number, max: number): number {
  return min + Math.floor(nextRandom(state) * (max - min + 1));
}

export function rollChance(state: GameState, probability: number): boolean {
  return nextRandom(state) < probability;
}

export function pickRandom<T>(state: GameState, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('Cannot pick from an empty list');
  }
  return items[Math.floor(nextRandom(state) * items.length)] as T;
}

export function createSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

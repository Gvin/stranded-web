import { BUILDINGS, SLEEP_IN_THE_OPEN } from '../data/buildings';
import type { SleepDef } from './definitions';
import { SLEEP_RULES, SURVIVAL_RULES } from './rules';
import { hours } from './time';
import type { GameState, TimedConditionId } from './types';
import { getLocationState } from './world';

// Where the player sleeps decides how well they rest; staying awake too long makes them Sleepy.

/** The conditions a night's sleep can leave; a new sleep replaces the old one. */
export const SLEEP_CONDITIONS: readonly TimedConditionId[] = ['awfulSleep', 'badSleep', 'goodSleep', 'perfectSleep'];

/** How the player sleeps where they are: on the house slot's building, or in the open. */
export function sleepAt(state: GameState): SleepDef {
  const house = getLocationState(state, state.player.locationId).buildings.house;
  return (house && BUILDINGS[house.id].sleep) ?? SLEEP_IN_THE_OPEN;
}

/** Whether the player has been awake long enough to be Sleepy. */
export function isSleepy(state: GameState): boolean {
  return state.time - state.player.awakeSince >= hours(SLEEP_RULES.sleepyAfterHours);
}

/** Sleep is offered when the player is tired, or Sleepy at any energy. */
export function canSleep(state: GameState): boolean {
  return state.player.stats.energy < SURVIVAL_RULES.sleepBelowEnergy || isSleepy(state);
}

/** Wakes the player up: Sleepy starts counting again, and the sleep's condition replaces the last one. */
export function wakeUp(state: GameState, sleep: SleepDef): void {
  const { player } = state;
  player.awakeSince = state.time;
  player.conditions = player.conditions.filter((c) => !SLEEP_CONDITIONS.includes(c.id));
  if (sleep.condition) {
    player.conditions.push({ id: sleep.condition, remaining: hours(SLEEP_RULES.conditionHours) });
  }
}

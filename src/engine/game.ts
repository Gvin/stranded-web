import { TRAVEL_LOCATION_ID } from '../data/locations';
import { createStartingState } from '../data/start';
import { type GameAction, getActions, getBlockedReason } from './actions';
import { appendLog, createActionContext, trainAttributes, trainSkill } from './context';
import { applyRain } from './environment';
import { createSeed } from './random';
import { advanceTime, clampStats, killPlayer, logWorsenedConditions, snapshotConditions } from './simulation';
import { changeStat } from './stats';
import type { GameState } from './types';

export function createNewGame(seed: number = createSeed()): GameState {
  return createStartingState(seed);
}

export function findAction(state: GameState, actionId: string): GameAction | undefined {
  return getActions(state).find((a) => a.id === actionId);
}

/**
 * Performs an action and returns the new state; the given state is never modified.
 * Energy is paid first (missing energy costs health), then time passes (the player can die meanwhile), then the outcome is applied.
 * Returns the same state object when the action is unknown or blocked.
 */
export function performAction(state: GameState, actionId: string): GameState {
  if (state.status !== 'alive') {
    return state;
  }
  const next = structuredClone(state);
  // why: actions are rebuilt from the copy, so their closures can only ever touch the new state.
  const action = findAction(next, actionId);
  if (!action || getBlockedReason(next, action) !== undefined) {
    return state;
  }
  const conditionsBefore = snapshotConditions(next);
  const ctx = createActionContext(next, action.object);

  const exertion = changeStat(next, 'energy', -action.energy);
  if (exertion.damage > 0) {
    appendLog(next, `You push yourself past exhaustion. (−${Math.round(exertion.damage)} health)`, 'bad');
    if (next.player.stats.health <= 0) {
      killPlayer(next, exertion.deathCause ?? 'You succumbed to exhaustion.');
      return next;
    }
  }
  if (action.travel) {
    // why: on the way the player is out in the open, away from the roof and fire they left behind.
    next.player.locationId = TRAVEL_LOCATION_ID;
  }
  advanceTime(next, action.minutes, action.timeMode);
  if (next.status !== 'alive') {
    return next;
  }

  action.run(ctx);
  if (action.trains) {
    trainAttributes(next, action.trains);
  }
  if (action.skill) {
    trainSkill(next, action.skill);
  }
  // why: the action may have lit a fire under the open sky in the rain.
  applyRain(next);
  clampStats(next);
  if (next.player.stats.health <= 0) {
    killPlayer(next, ctx.lastDamageCause ?? 'You succumbed to your injuries.');
  } else {
    logWorsenedConditions(next, conditionsBefore);
  }
  return next;
}

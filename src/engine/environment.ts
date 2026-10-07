import { BUILDINGS } from '../data/buildings';
import { WEATHERS } from '../data/weather';
import { hasTimedCondition, renewTimedCondition, TIMED_CONDITIONS } from './conditions';
import { type ActionContext, appendLog } from './context';
import type { WeatherDef } from './definitions';
import { putOutRainedFires, putOutRainedTorches } from './fire';
import { wornWith } from './inventory';
import { nextRandom, randomInt } from './random';
import { ENVIRONMENT_RULES, TEMPERATURE_IDS, type TemperatureId } from './rules';
import { toClock } from './time';
import { type GameState, type TimedConditionId, WEATHER_IDS, type WeatherId } from './types';
import { getLocationState, roofAt } from './world';

// The environment: island-wide weather, the temperature of the time of day, and the body temperature they give the player.

const MIN_TEMPERATURE = -2;
const MAX_TEMPERATURE = 2;

export interface BodyTemperature {
  /** Island temperature from the time of day and the weather, between -2 (Very Cold) and 2 (Very Hot). */
  environment: number;
  /** The player's own temperature after roof, heating, clothing and being wet. */
  value: number;
}

function clampTemperature(value: number): number {
  return Math.max(MIN_TEMPERATURE, Math.min(MAX_TEMPERATURE, value));
}

export function temperatureId(value: number): TemperatureId {
  return TEMPERATURE_IDS[clampTemperature(value) - MIN_TEMPERATURE] ?? 'normal';
}

export function getWeather(state: GameState): WeatherDef {
  return WEATHERS[state.environment.weather];
}

/** Sets a weather that begins at `from` and rolls how long it lasts. */
export function startWeather(state: GameState, weather: WeatherId, from: number): void {
  const [min, max] = WEATHERS[weather].hours;
  state.environment = { weather, until: from + randomInt(state, min * 60, max * 60) };
}

/** Picks the weather that follows by the weather chances and starts it at `from`. */
export function rollNextWeather(state: GameState, from: number): void {
  const roll = nextRandom(state);
  let total = 0;
  const next = WEATHER_IDS.find((id) => (total += WEATHERS[id].chance) > roll) ?? 'clear';
  startWeather(state, next, from);
}

/** Time-of-day part of the temperature, e.g. Midday +1. */
export function dayTemperature(time: number): { name: string; temperature: number } {
  const { hour } = toClock(time);
  const bands = ENVIRONMENT_RULES.dayTemperatures;
  const band = bands.find((b) => (b.from <= b.to ? hour >= b.from && hour <= b.to : hour >= b.from || hour <= b.to));
  return band ?? bands[bands.length - 1] ?? { name: 'Day', temperature: 0 };
}

export function isRaining(state: GameState): boolean {
  return (getWeather(state).rainfall ?? 0) > 0;
}

export function isStormy(state: GameState): boolean {
  return getWeather(state).storm === true;
}

/** The fire that warms the location right now (only while it burns), if any. */
export function heatingAt(state: GameState, locationId: string): string | undefined {
  const fire = getLocationState(state, locationId).buildings.fire;
  return fire?.lit ? BUILDINGS[fire.id].name : undefined;
}

export function getBodyTemperature(state: GameState): BodyTemperature {
  const day = dayTemperature(state.time);
  const weather = getWeather(state);
  const environment = clampTemperature(day.temperature + weather.temperature);
  const { player } = state;
  const locationId = player.locationId;
  let value = environment;
  // why: a roof and shading clothing are the same kind of protection, so they do not add up.
  if (environment > 0 && (roofAt(state, locationId) || wornWith(player, 'shade'))) {
    value = Math.max(0, value - 1);
  }
  if (environment < 0) {
    for (const warming of [heatingAt(state, locationId), wornWith(player, 'warmth')]) {
      if (warming) {
        value = Math.min(0, value + 1);
      }
    }
  }
  if (hasTimedCondition(player, 'wet')) {
    value -= 1;
  }
  return { environment, value: clampTemperature(value) };
}

/** Takes minutes off a timed condition, ending it (and saying so) when nothing is left. */
function shortenCondition(ctx: ActionContext, id: TimedConditionId, minutes: number): void {
  const { player } = ctx.state;
  const condition = player.conditions.find((c) => c.id === id);
  if (!condition) {
    return;
  }
  condition.remaining -= minutes;
  if (condition.remaining <= 0) {
    player.conditions = player.conditions.filter((c) => c !== condition);
    ctx.log(TIMED_CONDITIONS[id].endMessage, 'good');
  }
}

/** Cooling down helps while the island is Very Hot or the player is overheated. */
export function canCoolDown(state: GameState): boolean {
  return getBodyTemperature(state).environment >= MAX_TEMPERATURE || hasTimedCondition(state.player, 'overheated');
}

/** Starts the hour until overheating over and eases Overheated. */
export function coolDown(ctx: ActionContext): void {
  ctx.state.player.exposure.veryHot = 0;
  shortenCondition(ctx, 'overheated', ENVIRONMENT_RULES.recoveryMinutes);
}

/** Warming up helps while the island is Very Cold or the player is freezing or wet. */
export function canWarmUp(state: GameState): boolean {
  const { player } = state;
  return (
    getBodyTemperature(state).environment <= MIN_TEMPERATURE || hasTimedCondition(player, 'freezing') || hasTimedCondition(player, 'wet')
  );
}

/** Starts the hour until freezing over and eases Freezing and Wet. */
export function warmUp(ctx: ActionContext): void {
  ctx.state.player.exposure.veryCold = 0;
  shortenCondition(ctx, 'freezing', ENVIRONMENT_RULES.recoveryMinutes);
  shortenCondition(ctx, 'wet', ENVIRONMENT_RULES.recoveryMinutes);
}

/** Fills every rain collector on the island; a roof over its location does not matter. */
function fillRainCollectors(state: GameState, rainfall: number, minutes: number): void {
  if (rainfall <= 0) {
    return;
  }
  for (const location of Object.values(state.locations)) {
    const building = location.buildings.rainCollector;
    const collector = building && BUILDINGS[building.id].collector;
    if (building && collector) {
      building.water = Math.min(collector.capacity, building.water + (collector.bottlesPerHour * rainfall * minutes) / 60);
    }
  }
}

/** Puts out the fires and torches the rain falls on right now. */
export function applyRain(state: GameState): void {
  if (isRaining(state)) {
    putOutRainedFires(state);
    putOutRainedTorches(state);
  }
}

/** Whether the rain falls on the player: no roof where they are and no waterproof clothes. */
export function isOutInTheRain(state: GameState): boolean {
  const { player } = state;
  return isRaining(state) && !roofAt(state, player.locationId) && !wornWith(player, 'waterproof');
}

/**
 * Moves the environment on after time has passed: the next weather when the current one ends, the rain, and the time
 * spent in the rain, Very Hot or Very Cold. `bodyTemperature` is what the player had while those minutes passed.
 */
export function updateEnvironment(state: GameState, minutes: number, bodyTemperature: number): void {
  // why: the minutes that passed had the weather from before any change below.
  const rainedOn = isOutInTheRain(state);
  fillRainCollectors(state, getWeather(state).rainfall ?? 0, minutes);
  while (state.time >= state.environment.until) {
    const before = state.environment.weather;
    rollNextWeather(state, state.environment.until);
    if (state.environment.weather !== before) {
      appendLog(state, getWeather(state).message, 'info');
    }
  }
  applyRain(state);
  const { player } = state;
  const { exposure } = player;
  exposure.rain = rainedOn ? exposure.rain + minutes : 0;
  if (exposure.rain >= ENVIRONMENT_RULES.wetAfterMinutes) {
    renewTimedCondition(player, 'wet', ENVIRONMENT_RULES.wetMinutes);
  }
  exposure.veryHot = bodyTemperature >= MAX_TEMPERATURE ? exposure.veryHot + minutes : 0;
  exposure.veryCold = bodyTemperature <= MIN_TEMPERATURE ? exposure.veryCold + minutes : 0;
  if (exposure.veryHot > ENVIRONMENT_RULES.exposureMinutes) {
    renewTimedCondition(player, 'overheated', ENVIRONMENT_RULES.exposureConditionMinutes);
  }
  if (exposure.veryCold > ENVIRONMENT_RULES.exposureMinutes) {
    renewTimedCondition(player, 'freezing', ENVIRONMENT_RULES.exposureConditionMinutes);
  }
}

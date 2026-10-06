import type { LocationDef } from '../../engine/definitions';
import type { GameState } from '../../engine/types';
import { beach } from './beach';
import { camp } from './camp';
import { ROUTES } from './connections';
import { forest } from './forest';
import { path } from './path';
import { rocks } from './rocks';
import { spring } from './spring';

// The island: every location, the paths between them and lookups used by the engine.

export { ROUTES } from './connections';

export const START_LOCATION_ID = 'beach';

/** The places of the island, all reachable by paths. */
export const LOCATIONS: readonly LocationDef[] = [beach, forest, spring, rocks, camp];

/** Where the player is while time passes on a journey (see `path.ts`). */
export const TRAVEL_LOCATION_ID = path.id;

const LOCATION_MAP: Readonly<Record<string, LocationDef>> = Object.fromEntries([...LOCATIONS, path].map((l) => [l.id, l]));

export function isKnownLocation(locationId: string): boolean {
  return locationId in LOCATION_MAP;
}

export function getLocationDef(locationId: string): LocationDef {
  const def = LOCATION_MAP[locationId];
  if (!def) {
    throw new Error(`Unknown location: ${locationId}`);
  }
  return def;
}

export interface Connection {
  to: string;
  minutes: number;
  energy: number;
}

/** Routes leaving a location that the player currently knows about. */
export function getRoutesFrom(locationId: string, state: GameState): Connection[] {
  return ROUTES.filter((route) => route.between.includes(locationId))
    .filter((route) => !route.requiresFlag || state.flags[route.requiresFlag])
    .map((route) => ({
      to: route.between[0] === locationId ? route.between[1] : route.between[0],
      minutes: route.minutes,
      energy: route.energy,
    }));
}

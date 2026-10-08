import { ENEMIES } from '../data/enemies';
import { ITEMS } from '../data/items';
import { isKnownLocation } from '../data/locations';
import { BODY_PART_IDS, type GameState } from '../engine/types';
import { runMigrations } from './migrations';
import { GAME_VERSION, MIN_SUPPORTED_SAVE_VERSION, SAVE_VERSION } from './version';

/** What is written to storage: the state plus the versions needed to load it later. */
export interface SaveEnvelope {
  saveVersion: number;
  gameVersion: string;
  savedAt: string;
  state: unknown;
}

export type LoadResult =
  | { status: 'ok'; state: GameState; migratedFrom?: number }
  | { status: 'incompatible'; reason: string; saveGameVersion?: string }
  | { status: 'corrupt'; reason: string };

export function serializeGame(state: GameState, now: Date = new Date()): string {
  const envelope: SaveEnvelope = {
    saveVersion: SAVE_VERSION,
    gameVersion: GAME_VERSION,
    savedAt: now.toISOString(),
    state,
  };
  return JSON.stringify(envelope);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Item ids the state refers to, so saves pointing at removed content are rejected instead of crashing later. */
function referencedItemIds(value: Record<string, unknown>): unknown[] {
  const player = value.player as {
    inventory: { itemId?: unknown }[];
    equipment: Record<string, { itemId?: unknown } | undefined>;
    arrows?: { itemId?: unknown };
  };
  const locations = Object.values(value.locations as Record<string, { groundItems?: { itemId?: unknown }[]; buildings?: unknown }>);
  return [
    ...player.inventory.map((s) => s.itemId),
    ...Object.values(player.equipment).map((item) => item?.itemId),
    ...(player.arrows ? [player.arrows.itemId] : []),
    ...locations.flatMap((l) => (l.groundItems ?? []).map((g) => g.itemId)),
    ...locations.flatMap((l) =>
      ((l.buildings as { storage?: { items?: { itemId?: unknown }[] } })?.storage?.items ?? []).map((s) => s.itemId),
    ),
  ];
}

/** A fight in progress against a known enemy, with both on the field. */
function looksLikeFight(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.enemyId === 'string' &&
    value.enemyId in ENEMIES &&
    typeof value.enemyHealth === 'number' &&
    typeof value.playerAt === 'number' &&
    typeof value.enemyAt === 'number' &&
    typeof value.seen === 'boolean'
  );
}

/** Structural check, so a broken save is reported instead of crashing the game later. */
function looksLikeGameState(value: Record<string, unknown>): boolean {
  const player = value.player;
  const shapeOk =
    typeof value.time === 'number' &&
    typeof value.rng === 'number' &&
    (value.status === 'alive' || value.status === 'dead') &&
    isRecord(player) &&
    typeof player.locationId === 'string' &&
    isRecord(player.stats) &&
    isRecord(player.health) &&
    BODY_PART_IDS.every((part) => typeof (player.health as Record<string, unknown>)[part] === 'number') &&
    isRecord(player.nutrition) &&
    isRecord(player.attributes) &&
    isRecord(player.skills) &&
    isRecord(player.body) &&
    Array.isArray(player.inventory) &&
    isRecord(player.equipment) &&
    Object.values(player.equipment).every(isRecord) &&
    (player.arrows === undefined || (isRecord(player.arrows) && typeof player.arrows.quantity === 'number')) &&
    isRecord(player.exposure) &&
    isRecord(value.environment) &&
    typeof value.environment.weather === 'string' &&
    typeof value.environment.until === 'number' &&
    Array.isArray(player.craftedRecipes) &&
    typeof player.awakeSince === 'number' &&
    Array.isArray(player.knownItems) &&
    Array.isArray(player.triedFoods) &&
    isRecord(value.locations) &&
    (value.fight === undefined || looksLikeFight(value.fight)) &&
    Array.isArray(value.log);
  if (!shapeOk) {
    return false;
  }
  const knownLocation = isKnownLocation((player as { locationId: string }).locationId);
  return knownLocation && referencedItemIds(value).every((id) => typeof id === 'string' && id in ITEMS);
}

/** Parses a save, migrating older formats to the current one. */
export function deserializeGame(json: string): LoadResult {
  let envelope: unknown;
  try {
    envelope = JSON.parse(json);
  } catch {
    return { status: 'corrupt', reason: 'The save file is not valid JSON.' };
  }
  if (!isRecord(envelope) || typeof envelope.saveVersion !== 'number' || !isRecord(envelope.state)) {
    return { status: 'corrupt', reason: 'The save file is missing its version or game state.' };
  }
  const { saveVersion } = envelope;
  const saveGameVersion = typeof envelope.gameVersion === 'string' ? envelope.gameVersion : undefined;
  if (saveVersion > SAVE_VERSION) {
    return {
      status: 'incompatible',
      reason: `This save was made by a newer version of the game (${saveGameVersion ?? 'unknown'}).`,
      saveGameVersion,
    };
  }
  if (saveVersion < MIN_SUPPORTED_SAVE_VERSION) {
    return {
      status: 'incompatible',
      reason: `Saves from game version ${saveGameVersion ?? 'unknown'} are no longer supported.`,
      saveGameVersion,
    };
  }
  let state: Record<string, unknown>;
  try {
    state = runMigrations(envelope.state, saveVersion);
  } catch (error) {
    return { status: 'corrupt', reason: `The save could not be upgraded: ${(error as Error).message}` };
  }
  if (!looksLikeGameState(state)) {
    return { status: 'corrupt', reason: 'The save file does not contain a valid game.' };
  }
  return {
    status: 'ok',
    state: state as unknown as GameState,
    migratedFrom: saveVersion < SAVE_VERSION ? saveVersion : undefined,
  };
}

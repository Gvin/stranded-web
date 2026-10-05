import { BUILDINGS } from '../data/buildings';
import { getItemDef } from '../data/items';
import { getLocationDef, LOCATIONS } from '../data/locations';
import type { LocationInfo, ObjectDef, StockDef } from './definitions';
import { BUILDING_IDS, type BuildingId, type GameState, type GroundItem, type LocationState } from './types';

export function createLocationState(): LocationState {
  return { visited: false, groundItems: [], stock: {}, finds: {}, buildings: {}, constructions: {} };
}

/** Read-only access: returns a fresh default for locations that have no state yet. */
export function getLocationState(state: GameState, locationId: string): LocationState {
  return state.locations[locationId] ?? createLocationState();
}

/** Mutable access: creates the location state on first use. */
export function ensureLocationState(state: GameState, locationId: string): LocationState {
  let location = state.locations[locationId];
  if (!location) {
    location = createLocationState();
    state.locations[locationId] = location;
  }
  return location;
}

/** Definition and state key of an object's main stock, or of one of its named stocks. */
function stockRef(object: ObjectDef, stockName?: string): { key: string; def: StockDef | undefined } {
  return stockName ? { key: `${object.id}:${stockName}`, def: object.stocks?.[stockName] } : { key: object.id, def: object.stock };
}

/** Current stock of an object, including what has regrown since it was last touched. */
export function getStock(state: GameState, locationId: string, object: ObjectDef, stockName?: string): number {
  const { key, def } = stockRef(object, stockName);
  if (!def) {
    return Infinity;
  }
  const stored = getLocationState(state, locationId).stock[key];
  if (!stored) {
    return def.initial;
  }
  const regrown = Math.floor((state.time - stored.updatedAt) / def.regenMinutes);
  return Math.min(def.max, stored.amount + regrown);
}

/** Game minutes until the next unit of stock regrows, or undefined when full. */
export function getStockRegrowIn(state: GameState, locationId: string, object: ObjectDef, stockName?: string): number | undefined {
  const { key, def } = stockRef(object, stockName);
  const stored = getLocationState(state, locationId).stock[key];
  if (!def || !stored || getStock(state, locationId, object, stockName) >= def.max) {
    return undefined;
  }
  return def.regenMinutes - ((state.time - stored.updatedAt) % def.regenMinutes);
}

/** Takes up to the requested amount from the object's stock and returns how much was taken. */
export function takeStock(state: GameState, locationId: string, object: ObjectDef, amount: number, stockName?: string): number {
  const { key, def } = stockRef(object, stockName);
  if (!def) {
    return amount;
  }
  const current = getStock(state, locationId, object, stockName);
  const location = ensureLocationState(state, locationId);
  const stored = location.stock[key];
  // why: keep the partial regrowth progress, otherwise every harvest would reset the regrow timer.
  const progress = stored && current < def.max ? (state.time - stored.updatedAt) % def.regenMinutes : 0;
  const taken = Math.min(current, amount);
  location.stock[key] = { amount: current - taken, updatedAt: state.time - progress };
  return taken;
}

export function dropOnGround(state: GameState, locationId: string, itemId: string, quantity: number): void {
  if (quantity <= 0) {
    return;
  }
  const location = ensureLocationState(state, locationId);
  const sameDrop = location.groundItems.find((g) => g.itemId === itemId && g.droppedAt === state.time);
  if (sameDrop) {
    sameDrop.quantity += quantity;
    return;
  }
  location.groundItems.push({ id: state.nextId++, itemId, quantity, droppedAt: state.time });
}

export function groundItemExpiresAt(item: GroundItem): number {
  return item.droppedAt + getItemDef(item.itemId).groundLifetime;
}

/** Removes items lying on the ground longer than their lifetime; returns those that vanished where the player is. */
export function removeExpiredGroundItems(state: GameState): GroundItem[] {
  const removed: GroundItem[] = [];
  for (const [locationId, location] of Object.entries(state.locations)) {
    const kept = location.groundItems.filter((item) => {
      const expired = state.time >= groundItemExpiresAt(item);
      if (expired && locationId === state.player.locationId) {
        removed.push(item);
      }
      return !expired;
    });
    location.groundItems = kept;
  }
  return removed;
}

/** Whether the player has built, or started building, anything at the location. */
export function hasBuildings(location: LocationState): boolean {
  return BUILDING_IDS.some((id) => location.buildings[id] !== undefined || location.constructions[id] !== undefined);
}

/** Name, type and description of a location as the player currently knows it. */
export function getLocationInfo(state: GameState, locationId: string): LocationInfo {
  const def = getLocationDef(locationId);
  const info = def.whenBuilt && hasBuildings(getLocationState(state, locationId)) ? def.whenBuilt : def;
  return { name: info.name, type: info.type, description: info.description };
}

export function isCampfireLit(location: LocationState, time: number): boolean {
  const campfire = location.buildings.campfire;
  return campfire !== undefined && campfire.litUntil > time;
}

function isBuildingId(id: string): id is BuildingId {
  return (BUILDING_IDS as readonly string[]).includes(id);
}

/** Whether a crafting station (a building, or an object of the location) is present where the player is. */
export function isStationPresent(state: GameState, id: string): boolean {
  const locationId = state.player.locationId;
  const location = getLocationState(state, locationId);
  if (isBuildingId(id)) {
    return id === 'campfire' ? isCampfireLit(location, state.time) : location.buildings[id] !== undefined;
  }
  const object = getLocationDef(locationId).objects.find((o) => o.id === id);
  return object !== undefined && (object.visibleIf?.(state) ?? true);
}

export function stationName(id: string): string {
  if (isBuildingId(id)) {
    return id === 'campfire' ? 'A lit campfire' : BUILDINGS[id].name;
  }
  const object = LOCATIONS.flatMap((l) => l.objects).find((o) => o.id === id);
  return object?.name ?? id;
}

import { BUILDINGS } from '../data/buildings';
import { getItemDef } from '../data/items';
import { getLocationDef } from '../data/locations';
import { formatWater, isObjectPresent } from './actions';
import type { ItemDef, LocationInfo } from './definitions';
import { fireDef } from './fire';
import { stackWeight } from './inventory';
import { formatDuration } from './time';
import type { IconName } from '../icons/gameIcons';
import { BUILDING_IDS, BUILDING_SLOTS, type BuildingId, type GameState } from './types';
import { getLocationInfo, getLocationState, getStock, groundItemExpiresAt } from './world';

// Read-only projections of the state for the UI.

export interface ObjectView {
  id: string;
  name: string;
  description: string;
  status?: string;
  /** Built by the player rather than part of the location. */
  building?: boolean;
  icon?: IconName;
  /** Set for an unfinished building; its build actions continue the work. */
  construction?: BuildingId;
}

export interface GroundItemView {
  id: number;
  def: ItemDef;
  quantity: number;
  /** Game minutes until the item disappears. */
  expiresIn: number;
  /** Health left, for an item that wears out. */
  health?: number;
  /** A torch burning on the ground. */
  lit?: boolean;
}

export interface LocationView extends LocationInfo {
  id: string;
  /** Buildings, then visible objects (hidden objects are left out). */
  objects: ObjectView[];
  groundItems: GroundItemView[];
}

function constructionViews(state: GameState): ObjectView[] {
  const location = getLocationState(state, state.player.locationId);
  return BUILDING_IDS.filter((id) => location.constructions[id] !== undefined).map((id) => ({
    id: `construction:${id}`,
    name: `${BUILDINGS[id].name} (unfinished)`,
    description: `The ${BUILDINGS[id].name.toLowerCase()} is taking shape, but there is more work to do.`,
    status: `${location.constructions[id]?.stepsDone ?? 0} of ${BUILDINGS[id].steps} steps done`,
    building: true,
    icon: BUILDINGS[id].icon,
    construction: id,
  }));
}

/** Fuel for display, to a tenth: "3.5". */
export function formatFuel(fuel: number): string {
  return String(Math.round(fuel * 10) / 10);
}

/** What stands in each building slot here; the view's id is the slot, which the building's actions target. */
function buildingViews(state: GameState): ObjectView[] {
  const location = getLocationState(state, state.player.locationId);
  return BUILDING_SLOTS.flatMap((slot) => {
    const building = location.buildings[slot];
    if (!building) {
      return [];
    }
    const def = BUILDINGS[building.id];
    const view: ObjectView = { id: slot, name: def.name, description: def.description, building: true, icon: def.icon };
    const { fire, storage, rainCollector } = location.buildings;
    if (slot === 'fire' && fire) {
      const { capacity, burnPerHour } = fireDef(fire);
      const fuel = `${formatFuel(fire.fuel)} / ${capacity} fuel`;
      view.status = fire.lit
        ? `burning · ${fuel}, ${formatDuration((fire.fuel / burnPerHour) * 60)} left`
        : fire.fuel > 0
          ? `out · ${fuel}`
          : 'out · no fuel';
    }
    if (slot === 'storage' && storage) {
      view.status = `${stackWeight(storage.items).toFixed(1)} / ${def.storage?.capacity ?? 0} kg`;
    }
    if (slot === 'rainCollector' && rainCollector) {
      view.status = `${formatWater(rainCollector.water)} / ${def.collector?.capacity ?? 0} bottles of water`;
    }
    return [view];
  });
}

export function getLocationView(state: GameState): LocationView {
  const id = state.player.locationId;
  const def = getLocationDef(id);
  const location = getLocationState(state, id);
  const objects: ObjectView[] = def.objects
    .filter((object) => !object.hidden && isObjectPresent(state, object))
    .map((object) => ({
      id: object.id,
      name: object.name,
      description: object.description,
      status: object.stock && object.stockText ? object.stockText(getStock(state, id, object), object.stock.max) : undefined,
    }));
  return {
    id,
    ...getLocationInfo(state, id),
    objects: [...buildingViews(state), ...constructionViews(state), ...objects],
    groundItems: location.groundItems.map((g) => ({
      id: g.id,
      def: getItemDef(g.itemId),
      quantity: g.quantity,
      expiresIn: groundItemExpiresAt(g) - state.time,
      health: g.health,
      lit: g.lit,
    })),
  };
}

import { BUILDINGS, STORAGE_CAPACITY } from '../data/buildings';
import { getItemDef } from '../data/items';
import { getLocationDef } from '../data/locations';
import { formatWater, isObjectPresent } from './actions';
import type { ItemDef, LocationInfo } from './definitions';
import { stackWeight } from './inventory';
import { formatDuration } from './time';
import type { IconName } from '../icons/gameIcons';
import { BUILDING_IDS, type BuildingId, type GameState } from './types';
import { getLocationInfo, getLocationState, getStock, groundItemExpiresAt, isCampfireLit } from './world';

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

function buildingViews(state: GameState): ObjectView[] {
  const location = getLocationState(state, state.player.locationId);
  return BUILDING_IDS.filter((id) => location.buildings[id] !== undefined).map((id) => {
    const view: ObjectView = {
      id,
      name: BUILDINGS[id].name,
      description: BUILDINGS[id].description,
      building: true,
      icon: BUILDINGS[id].icon,
    };
    const { campfire, storage, rainCollector } = location.buildings;
    if (id === 'campfire' && campfire) {
      const lit = isCampfireLit(location, state.time);
      view.name = lit ? 'Campfire' : 'Cold campfire';
      view.description = lit ? 'A crackling fire. You can cook raw food here.' : 'A ring of stones around cold ashes.';
      view.status = lit ? `burns for ${formatDuration(campfire.litUntil - state.time)}` : 'out';
    }
    if (id === 'storage' && storage) {
      view.status = `${stackWeight(storage.items).toFixed(1)} / ${STORAGE_CAPACITY} kg`;
    }
    if (id === 'rainCollector' && rainCollector) {
      view.status = `${formatWater(rainCollector.water)} / ${BUILDINGS.rainCollector.collector?.capacity ?? 0} bottles of water`;
    }
    return view;
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
    })),
  };
}

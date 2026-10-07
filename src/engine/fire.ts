import { BUILDINGS } from '../data/buildings';
import { appendLog } from './context';
import type { BuildingDef } from './definitions';
import { TORCH_BURN_PER_HOUR } from './rules';
import { EQUIP_SLOTS, type GameState, type GroundItem, type InventoryStack, type LocationBuildings } from './types';
import { getLocationState, isFireLit, roofAt } from './world';

// Fires in the fire slot of a location, and torches: both burn down and both go out in the rain.

type Fire = NonNullable<LocationBuildings['fire']>;

/** Capacity, burn rate and rainproofing of the fire that stands in a location. */
export function fireDef(fire: Fire): NonNullable<BuildingDef['fire']> {
  const def = BUILDINGS[fire.id].fire;
  if (!def) {
    throw new Error(`Not a fire: ${fire.id}`);
  }
  return def;
}

/** Fuel the fire can still take. */
export function fireRoom(fire: Fire): number {
  return Math.max(0, fireDef(fire).capacity - fire.fuel);
}

/** Whether the rain puts this fire out (and keeps it from being lit). */
export function rainReaches(fire: Fire): boolean {
  return !fireDef(fire).rainproof;
}

/** Burns the fuel of every lit fire on the island; a fire that runs out of fuel goes out. */
export function burnFires(state: GameState, minutes: number): void {
  for (const [locationId, location] of Object.entries(state.locations)) {
    const fire = location.buildings.fire;
    if (!fire?.lit) {
      continue;
    }
    fire.fuel = Math.max(0, fire.fuel - (fireDef(fire).burnPerHour * minutes) / 60);
    if (fire.fuel <= 1e-9) {
      fire.fuel = 0;
      fire.lit = false;
      if (locationId === state.player.locationId) {
        appendLog(state, `The ${BUILDINGS[fire.id].name.toLowerCase()} has burnt down. It needs fuel.`, 'info');
      }
    }
  }
}

/** Puts out every fire the rain reaches, roof or not; its fuel stays for when it is lit again. */
export function putOutRainedFires(state: GameState): void {
  for (const [locationId, location] of Object.entries(state.locations)) {
    const fire = location.buildings.fire;
    if (!fire?.lit || !rainReaches(fire)) {
      continue;
    }
    fire.lit = false;
    if (locationId === state.player.locationId) {
      appendLog(state, `The rain puts out the ${BUILDINGS[fire.id].name.toLowerCase()}.`, 'bad');
    }
  }
}

/** Whether a torch can be lit or a fire started from a flame here: any lit torch carried or lying on the ground. */
export function hasLitTorch(state: GameState): boolean {
  const { player } = state;
  return (
    player.inventory.some((s) => s.lit) ||
    EQUIP_SLOTS.some((slot) => player.equipment[slot]?.lit) ||
    getLocationState(state, player.locationId).groundItems.some((g) => g.lit)
  );
}

/** Whether a flame is at hand to light a torch from: a burning fire here or another lit torch. */
export function hasFlame(state: GameState): boolean {
  return isFireLit(getLocationState(state, state.player.locationId)) || hasLitTorch(state);
}

/** Lit torches in a list lose health; one that reaches 0 burns out and is gone. Returns what is left and how many burnt out. */
function burnList<T extends InventoryStack | GroundItem>(items: T[], minutes: number): { kept: T[]; burntOut: number } {
  let burntOut = 0;
  const kept = items.filter((item) => {
    if (!item.lit || item.health === undefined) {
      return true;
    }
    item.health -= (TORCH_BURN_PER_HOUR * minutes) / 60;
    if (item.health > 0) {
      return true;
    }
    burntOut += 1;
    return false;
  });
  return { kept, burntOut };
}

/** Burns every lit torch on the island: in the bag, in hand and on the ground (storing a torch puts it out). */
export function burnTorches(state: GameState, minutes: number): void {
  const { player } = state;
  const bag = burnList(player.inventory, minutes);
  player.inventory = bag.kept;
  let burntOut = bag.burntOut;
  for (const slot of EQUIP_SLOTS) {
    const item = player.equipment[slot];
    if (item?.lit && item.health !== undefined) {
      item.health -= (TORCH_BURN_PER_HOUR * minutes) / 60;
      if (item.health <= 0) {
        delete player.equipment[slot];
        burntOut += 1;
      }
    }
  }
  if (burntOut > 0) {
    appendLog(state, burntOut === 1 ? 'Your torch has burnt out.' : 'Your torches have burnt out.', 'bad');
  }
  for (const [locationId, location] of Object.entries(state.locations)) {
    const ground = burnList(location.groundItems, minutes);
    location.groundItems = ground.kept;
    if (ground.burntOut > 0 && locationId === player.locationId) {
      appendLog(state, 'The torch on the ground has burnt out.', 'info');
    }
  }
}

function putOut(items: readonly (InventoryStack | GroundItem)[]): number {
  let count = 0;
  for (const item of items) {
    if (item.lit) {
      delete item.lit;
      count += 1;
    }
  }
  return count;
}

/** Puts out the torches the rain reaches: everywhere except in a location with a roof, whatever the player wears. */
export function putOutRainedTorches(state: GameState): void {
  const { player } = state;
  if (!roofAt(state, player.locationId)) {
    let count = putOut(player.inventory);
    for (const slot of EQUIP_SLOTS) {
      const item = player.equipment[slot];
      if (item?.lit) {
        delete item.lit;
        count += 1;
      }
    }
    if (count > 0) {
      appendLog(state, count === 1 ? 'The rain puts out your torch.' : 'The rain puts out your torches.', 'bad');
    }
  }
  for (const [locationId, location] of Object.entries(state.locations)) {
    if (roofAt(state, locationId)) {
      continue;
    }
    if (putOut(location.groundItems) > 0 && locationId === player.locationId) {
      appendLog(state, 'The rain puts out the torch on the ground.', 'info');
    }
  }
}

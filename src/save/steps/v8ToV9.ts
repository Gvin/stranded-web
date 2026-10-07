// Save format 8 → 9 (game 0.11.0 → 0.12.0). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - Buildings stand in slots, each holding one level of its chain: a Hut moves to the house slot (the sleeping mat and
//   the shelter below it count as built), the Small storage and the Workbench become level 1 of their slots.
// - The campfire holds fuel instead of a time it burns until: what was left to burn becomes fuel, one per hour, up to
//   the 5 a Campfire holds, and it stays lit if it was burning.
// - Unfinished buildings keep the steps already done under their new ids. A location with an unfinished Hut gets the
//   shelter it is built on.
// - The player gets the time they last woke up; existing games start counting from the moment they are loaded.

type Json = Record<string, unknown>;

/** What a Campfire holds, in fuel; a unit burns for an hour. */
const CAMPFIRE_CAPACITY = 5;

/** Old building ids and the new ids they keep their unfinished work under. */
const RENAMED_CONSTRUCTIONS: Record<string, string> = {
  campfire: 'campfire',
  hut: 'hut',
  storage: 'smallStorage',
  workbench: 'basicWorkbench',
  rainCollector: 'rainCollector',
};

function migrateBuildings(location: Json, time: number): Json {
  const old = (location.buildings ?? {}) as Record<string, Json | undefined>;
  const constructions = (location.constructions ?? {}) as Record<string, unknown>;
  const buildings: Json = {};
  const { hut, campfire, storage, workbench, rainCollector } = old;
  if (hut) {
    buildings.house = { id: 'hut', builtAt: hut.builtAt };
  } else if (constructions.hut) {
    buildings.house = { id: 'shelter', builtAt: time };
  }
  if (campfire) {
    const fuel = Math.min(CAMPFIRE_CAPACITY, Math.max(0, ((campfire.litUntil as number) - time) / 60));
    buildings.fire = { id: 'campfire', builtAt: campfire.builtAt, fuel, lit: fuel > 0 };
  }
  if (storage) {
    buildings.storage = { id: 'smallStorage', builtAt: storage.builtAt, items: storage.items ?? [] };
  }
  if (workbench) {
    buildings.workbench = { id: 'basicWorkbench', builtAt: workbench.builtAt };
  }
  if (rainCollector) {
    buildings.rainCollector = { id: 'rainCollector', builtAt: rainCollector.builtAt, water: rainCollector.water ?? 0 };
  }
  const renamed = Object.fromEntries(
    Object.entries(constructions).map(([id, construction]) => [RENAMED_CONSTRUCTIONS[id] ?? id, construction]),
  );
  return { ...location, buildings, constructions: renamed };
}

export function migrateV8ToV9(state: Json): Json {
  const time = state.time as number;
  const player = state.player as Json;
  const locations = Object.fromEntries(
    Object.entries(state.locations as Record<string, Json>).map(([id, location]) => [id, migrateBuildings(location, time)]),
  );
  return { ...state, locations, player: { ...player, awakeSince: player.awakeSince ?? time } };
}

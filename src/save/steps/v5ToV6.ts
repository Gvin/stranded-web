// Save format 5 → 6 (game 0.7.0 → 0.8.0). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - The island has weather: existing games get a clear sky for the next 4 hours.
// - The player tracks how long their body temperature has been Very Hot or Very Cold, and how long they have been out in the rain.
// - Equipment slots hold { itemId, health } instead of an item id.
// - Clothes wear out: they get health (60 of 100, like a new game) and no longer stack in the bag, storage or on the ground.

type Json = Record<string, unknown>;
type Stack = { itemId: string; quantity: number; health?: number };

/** Items of format 5 that wear out in format 6, with the health they start with. */
const HEALTH_BY_ITEM: Record<string, number> = { clothes: 60 };

function splitStacks(stacks: Stack[]): Stack[] {
  return stacks.flatMap((stack) => {
    const health = HEALTH_BY_ITEM[stack.itemId];
    return health === undefined ? [stack] : Array.from({ length: stack.quantity }, () => ({ itemId: stack.itemId, quantity: 1, health }));
  });
}

export function migrateV5ToV6(state: Json): Json {
  const player = state.player as Json;
  const equipment: Json = {};
  for (const [slot, itemId] of Object.entries(player.equipment as Record<string, string>)) {
    const health = HEALTH_BY_ITEM[itemId];
    equipment[slot] = health === undefined ? { itemId } : { itemId, health };
  }
  let nextId = state.nextId as number;
  const locations: Json = {};
  for (const [id, location] of Object.entries(state.locations as Record<string, Json>)) {
    const groundItems = (location.groundItems as (Stack & { id: number; droppedAt: number })[]).flatMap((item) => {
      const health = HEALTH_BY_ITEM[item.itemId];
      return health === undefined
        ? [item]
        : Array.from({ length: item.quantity }, (_, index) => ({ ...item, id: index === 0 ? item.id : nextId++, quantity: 1, health }));
    });
    const buildings = { ...(location.buildings as Json) };
    const storage = buildings.storage as (Json & { items: Stack[] }) | undefined;
    if (storage) {
      buildings.storage = { ...storage, items: splitStacks(storage.items) };
    }
    locations[id] = { ...location, groundItems, buildings };
  }
  return {
    ...state,
    nextId,
    environment: { weather: 'clear', until: (state.time as number) + 4 * 60 },
    player: {
      ...player,
      equipment,
      exposure: { veryHot: 0, veryCold: 0, rain: 0 },
      inventory: splitStacks(player.inventory as Stack[]),
    },
    locations,
  };
}

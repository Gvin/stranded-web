// Save format 1 → 2 (game 0.1.0 → 0.2.0). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - Items were replaced by the typed resource list; removed items are converted or dropped.
// - Body and timed conditions store the healing time left instead of start/end times.
// - Campfire and shelter became buildings (the lean-to shelter is now a hut); the back slot was removed.

type Json = Record<string, unknown>;
interface Stack {
  itemId: string;
  quantity: number;
}

/** New item id per removed or renamed v1 item; null means the item no longer exists. */
const ITEM_RENAMES: Readonly<Record<string, string | null>> = {
  rag: 'cloth',
  'dry-grass': 'grass',
  firewood: 'log',
  plank: 'log',
  'palm-leaf': 'grass',
  'sharp-stone': 'flint',
  'stone-axe': 'hammer',
  'wooden-spear': 'stick',
  'empty-bottle': null,
  'palm-backpack': null,
};

const HOLDABLE = new Set(['knife', 'hammer', 'bow']);

/** v1 healing times in game minutes per body condition. */
const V1_HEALS_AFTER: Readonly<Record<string, number>> = {
  injured: 4320,
  bleeding: 240,
  burnt: 5760,
  bandaged: 2160,
  splinted: 7200,
};

/** Bandages heal twice as fast in v2, so the stored healing time doubles for the same real time. */
const V2_BANDAGE_RATE = 2;
const V2_TIMED_MAX: Readonly<Record<string, number>> = { poisoned: 360, dizzy: 180 };

function renameItem(itemId: string): string | null {
  return itemId in ITEM_RENAMES ? (ITEM_RENAMES[itemId] ?? null) : itemId;
}

function addStack(stacks: Stack[], itemId: string, quantity: number): void {
  const existing = stacks.find((s) => s.itemId === itemId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    stacks.push({ itemId, quantity });
  }
}

function migrateStacks(stacks: Stack[]): Stack[] {
  const result: Stack[] = [];
  for (const stack of stacks) {
    const itemId = renameItem(stack.itemId);
    if (itemId) {
      addStack(result, itemId, stack.quantity);
    }
  }
  return result;
}

function migrateBody(body: Record<string, { id: string; since: number }[]>, time: number): Json {
  const result: Json = {};
  for (const [part, conditions] of Object.entries(body)) {
    result[part] = conditions.map((condition) => {
      const healsAfter = V1_HEALS_AFTER[condition.id];
      if (healsAfter === undefined) {
        return { id: condition.id };
      }
      const left = Math.max(1, condition.since + healsAfter - time);
      return { id: condition.id, remaining: condition.id === 'bandaged' ? left * V2_BANDAGE_RATE : left };
    });
  }
  return result;
}

function migrateLocation(location: Json): Json {
  const { campfire, shelter, ...rest } = location as Json & { campfire?: { litUntil: number }; shelter?: boolean };
  const buildings: Json = {};
  if (campfire) {
    buildings.campfire = { builtAt: 0, litUntil: campfire.litUntil };
  }
  if (shelter) {
    buildings.hut = { builtAt: 0 };
  }
  const groundItems = (rest.groundItems as (Stack & Json)[]).flatMap((ground) => {
    const itemId = renameItem(ground.itemId);
    return itemId ? [{ ...ground, itemId }] : [];
  });
  const finds: Record<string, number> = {};
  for (const [key, count] of Object.entries(rest.finds as Record<string, number>)) {
    const [objectId, itemId = ''] = key.split(':');
    const renamed = renameItem(itemId);
    if (renamed) {
      finds[`${objectId}:${renamed}`] = Math.max(finds[`${objectId}:${renamed}`] ?? 0, count);
    }
  }
  return { ...rest, groundItems, finds, buildings };
}

export function migrateV1ToV2(state: Json): Json {
  const time = state.time as number;
  const player = state.player as Json;
  const inventory = migrateStacks(player.inventory as Stack[]);
  const equipment: Json = {};
  for (const [slot, itemId] of Object.entries(player.equipment as Record<string, string>)) {
    const renamed = renameItem(itemId);
    if (renamed && slot !== 'back' && HOLDABLE.has(renamed)) {
      equipment[slot] = renamed;
    } else if (renamed) {
      addStack(inventory, renamed, 1);
    }
  }
  const conditions = (player.conditions as { id: string; until: number }[])
    .map((c) => ({ id: c.id, remaining: Math.min(V2_TIMED_MAX[c.id] ?? Infinity, c.until - time) }))
    .filter((c) => c.remaining > 0);
  const locations: Json = {};
  for (const [id, location] of Object.entries(state.locations as Record<string, Json>)) {
    locations[id] = migrateLocation(location);
  }
  return {
    ...state,
    player: {
      ...player,
      body: migrateBody(player.body as Record<string, { id: string; since: number }[]>, time),
      conditions,
      inventory,
      equipment,
    },
    locations,
  };
}

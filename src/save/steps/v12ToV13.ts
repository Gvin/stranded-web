// Save format 12 → 13 (game 0.15.0 → 0.16.0). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - Every body part has its own health, and the player's health is their sum. Existing games split the health they had
//   between the parts by the parts' shares (torso 30%, head 10%, each arm and leg 15%); a missing arm or leg gets none.
//   Health is no longer kept among the stats.
// - The knife, hammer, axe, spear and bow wear out in fights, so each one is its own entry now, like other items that
//   wear out. Existing ones, in the bag, in hand, in storage or on the ground, are split up at full durability.

type Json = Record<string, unknown>;

interface Stack {
  itemId: string;
  quantity: number;
  health?: number;
}

interface Location {
  groundItems?: (Stack & { id: number })[];
  buildings?: { storage?: Json & { items?: Stack[] } };
}

const SHARES: Record<string, number> = { head: 0.1, torso: 0.3, leftArm: 0.15, rightArm: 0.15, leftLeg: 0.15, rightLeg: 0.15 };
const WEAPON_DURABILITY: Record<string, number> = { knife: 50, hammer: 100, axe: 100, spear: 50, bow: 100 };

/** One entry per weapon at full durability; everything else is left as it is. */
function splitWeapons<T extends Stack>(stacks: T[], copy: (stack: T, index: number) => T = (stack) => stack): T[] {
  return stacks.flatMap((stack) => {
    const durability = WEAPON_DURABILITY[stack.itemId];
    if (durability === undefined || stack.health !== undefined) {
      return [stack];
    }
    return Array.from({ length: stack.quantity }, (_, index) => ({ ...copy(stack, index), quantity: 1, health: durability }));
  });
}

function splitHealth(player: Json & { stats: Json & { health?: number }; body: Record<string, { id?: unknown }[] | undefined> }): Json {
  if (player.health !== undefined) {
    return player;
  }
  const { health = 0, ...stats } = player.stats;
  const missing = (part: string) => (player.body[part] ?? []).some((condition) => condition.id === 'missing');
  const parts = Object.fromEntries(Object.entries(SHARES).map(([part, share]) => [part, missing(part) ? 0 : health * share]));
  return { ...player, stats, health: parts };
}

export function migrateV12ToV13(state: Json): Json {
  const player = state.player as Json & {
    stats: Json & { health?: number };
    body: Record<string, { id?: unknown }[] | undefined>;
    inventory: Stack[];
    equipment: Record<string, Stack | undefined>;
  };
  let nextId = state.nextId as number;
  const equipment = Object.fromEntries(
    Object.entries(player.equipment).map(([slot, item]) => {
      const durability = item ? WEAPON_DURABILITY[item.itemId] : undefined;
      return [slot, item && durability !== undefined && item.health === undefined ? { ...item, health: durability } : item];
    }),
  );
  const locations = Object.fromEntries(
    Object.entries(state.locations as Record<string, Location>).map(([id, location]) => {
      const storage = location.buildings?.storage;
      return [
        id,
        {
          ...location,
          // why: every ground item has its own id, so the extra weapons of a pile get new ones.
          groundItems: splitWeapons(location.groundItems ?? [], (item, index) => (index === 0 ? item : { ...item, id: nextId++ })),
          buildings: storage
            ? { ...location.buildings, storage: { ...storage, items: splitWeapons(storage.items ?? []) } }
            : location.buildings,
        },
      ];
    }),
  );
  return {
    ...state,
    nextId,
    locations,
    player: { ...splitHealth(player), inventory: splitWeapons(player.inventory), equipment },
  };
}

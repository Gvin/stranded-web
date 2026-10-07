// Save format 9 → 10 (game 0.12.0 → 0.12.1). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - The player remembers the items they have had, so possible finds of anything else show as unknown. Existing games
//   know what the player carries, wears, keeps in storage or left on the ground, every limited find already made and
//   everything already crafted.
// - The player remembers the foods they have tried, so only these show what they do. Existing games have tried none.

type Json = Record<string, unknown>;

interface Location {
  groundItems?: { itemId?: unknown }[];
  finds?: Record<string, unknown>;
  buildings?: { storage?: { items?: { itemId?: unknown }[] } };
}

function knownItems(state: Json): string[] {
  const player = state.player as {
    inventory: { itemId?: unknown }[];
    equipment: Record<string, { itemId?: unknown } | undefined>;
    craftedRecipes?: unknown[];
  };
  const locations = Object.values(state.locations as Record<string, Location>);
  const ids = [
    ...player.inventory.map((s) => s.itemId),
    ...Object.values(player.equipment).map((item) => item?.itemId),
    ...locations.flatMap((l) => (l.groundItems ?? []).map((g) => g.itemId)),
    ...locations.flatMap((l) => (l.buildings?.storage?.items ?? []).map((s) => s.itemId)),
    // why: a limited find is stored as "objectId:itemId", e.g. "wreckage:cloth".
    ...locations.flatMap((l) => Object.keys(l.finds ?? {}).map((key) => key.split(':')[1])),
    // why: every recipe is named after the item it makes.
    ...(player.craftedRecipes ?? []),
  ];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

export function migrateV9ToV10(state: Json): Json {
  const player = state.player as Json;
  return { ...state, player: { ...player, knownItems: player.knownItems ?? knownItems(state), triedFoods: player.triedFoods ?? [] } };
}

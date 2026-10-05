// Save format 2 → 3 (game 0.2.0 → 0.3.0). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - Thirst and hunger are now "lower is better": the stored values are flipped against their maximum.
// - Head and body equipment slots were added; the player has always been wearing clothes.
// - Crafted recipes are tracked; buildings that already exist count as crafted.
// - The hidden "fallen-coconuts" object became a named stock of the palms.

type Json = Record<string, unknown>;

const BUILDING_RECIPES: Readonly<Record<string, string>> = {
  campfire: 'build-campfire',
  hut: 'build-hut',
  storage: 'build-storage',
  workbench: 'build-workbench',
};

/** v2 maximum for thirst and hunger from base endurance (penalties are ignored; the game clamps it anyway). */
function maxFromEndurance(attributes: Json): number {
  const endurance = (attributes.endurance as { base?: number } | undefined)?.base ?? 20;
  return Math.round(80 + endurance);
}

export function migrateV2ToV3(state: Json): Json {
  const player = state.player as Json;
  const stats = player.stats as Record<string, number>;
  const max = maxFromEndurance(player.attributes as Json);
  const flip = (value: number | undefined) => Math.min(max, Math.max(0, max - (value ?? max)));

  const craftedRecipes = new Set<string>();
  const locations: Json = {};
  for (const [id, raw] of Object.entries(state.locations as Record<string, Json>)) {
    const buildings = (raw.buildings ?? {}) as Json;
    for (const building of Object.keys(buildings)) {
      const recipe = BUILDING_RECIPES[building];
      if (recipe) {
        craftedRecipes.add(recipe);
      }
    }
    const { 'fallen-coconuts': fallen, ...stock } = (raw.stock ?? {}) as Json;
    locations[id] = { ...raw, stock: fallen ? { ...stock, 'palms:fallen': fallen } : stock };
  }

  const equipment = { ...(player.equipment as Json) };
  if (!equipment.body) {
    equipment.body = 'clothes';
  }

  return {
    ...state,
    player: {
      ...player,
      stats: { ...stats, thirst: flip(stats.thirst), hunger: flip(stats.hunger) },
      equipment,
      craftedRecipes: [...craftedRecipes],
    },
    locations,
  };
}

// Save format 4 → 5 (game 0.6.0 → 0.7.0). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - The player tracks nutrition per food group; existing players start with the even split of a new game.

type Json = Record<string, unknown>;

export function migrateV4ToV5(state: Json): Json {
  const player = state.player as Json;
  return { ...state, player: { ...player, nutrition: player.nutrition ?? { vegetables: 33, meat: 33, fruits: 33 } } };
}

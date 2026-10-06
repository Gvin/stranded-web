// Save format 7 → 8 (game 0.10.0 → 0.11.0). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - The player has skills; existing games start every skill at level 0.
// - Unfinished buildings may record the materials they used (for giving some back); old ones simply have none recorded.

type Json = Record<string, unknown>;

const SKILLS = ['fighting', 'farming', 'building', 'foraging', 'crafting'];

export function migrateV7ToV8(state: Json): Json {
  const player = state.player as Json;
  const skills = Object.fromEntries(SKILLS.map((id) => [id, { level: 0, points: 0 }]));
  return { ...state, player: { ...player, skills: player.skills ?? skills } };
}

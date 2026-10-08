// Save format 12 → 13 (game 0.15.0 → 0.16.0). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - Every body part has its own health, and the player's health is their sum. Existing games split the health they had
//   between the parts by the parts' shares (torso 30%, head 10%, each arm and leg 15%); a missing arm or leg gets none.
//   Health is no longer kept among the stats.

type Json = Record<string, unknown>;

const SHARES: Record<string, number> = { head: 0.1, torso: 0.3, leftArm: 0.15, rightArm: 0.15, leftLeg: 0.15, rightLeg: 0.15 };

export function migrateV12ToV13(state: Json): Json {
  const player = state.player as Json & { stats: Json & { health?: number }; body: Record<string, { id?: unknown }[] | undefined> };
  if (player.health !== undefined) {
    return state;
  }
  const { health = 0, ...stats } = player.stats;
  const missing = (part: string) => (player.body[part] ?? []).some((condition) => condition.id === 'missing');
  const parts = Object.fromEntries(Object.entries(SHARES).map(([part, share]) => [part, missing(part) ? 0 : health * share]));
  return { ...state, player: { ...player, stats, health: parts } };
}

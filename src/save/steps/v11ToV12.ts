// Save format 11 → 12 (game 0.14.0 → 0.15.0). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - A fight in progress is saved, which old saves simply lack: existing games are not in a fight.

type Json = Record<string, unknown>;

export function migrateV11ToV12(state: Json): Json {
  return state;
}

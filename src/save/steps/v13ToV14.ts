// Save format 13 → 14 (game 0.16.0 → 0.17.0). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - A snare is a new building in a slot of its own, which old saves simply lack: existing games have none set.
// - The forest's animals, the beach's fish and the rocks' nests are new stocks of their locations; existing games
//   start them full, as a missing stock always does.

type Json = Record<string, unknown>;

export function migrateV13ToV14(state: Json): Json {
  return state;
}

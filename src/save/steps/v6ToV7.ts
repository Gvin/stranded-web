// Save format 6 → 7 (game 0.8.0 → 0.9.0). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - Locations can hold a rain collector (`buildings.rainCollector` with its water); old saves have none, so nothing changes.
// - Building steps all take 15 minutes now and buildings have more of them; unfinished buildings keep the steps already done.

type Json = Record<string, unknown>;

export function migrateV6ToV7(state: Json): Json {
  return state;
}

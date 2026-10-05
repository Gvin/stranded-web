// Save format 3 → 4 (game 0.5.0 → 0.6.0). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - Buildings are built in steps; every location gets an (empty) record of unfinished constructions.

type Json = Record<string, unknown>;

export function migrateV3ToV4(state: Json): Json {
  const locations: Json = {};
  for (const [id, location] of Object.entries(state.locations as Record<string, Json>)) {
    locations[id] = { ...location, constructions: location.constructions ?? {} };
  }
  return { ...state, locations };
}

---
name: save-migration
description: Change the save format of Stranded the safe way - bump SAVE_VERSION, add a self-contained migration step, register it, test loading the old format, and update the README save table. Use whenever a change touches the persisted state in src/engine/types.ts, renames or removes an item or location id, or renames an object whose stock or finds must carry over.
argument-hint: '[what changes in the saved state]'
---

# Save migration

Old saves must keep loading. Follow every step; a missed one breaks existing games without any test failing loudly.

## 1. Decide whether a migration is needed

A migration is needed when the change:

- edits `src/engine/types.ts` in any way (its header says so): adding, removing, renaming or reshaping anything in the `GameState` tree, even an optional field or a new id in a union such as `BuildingId` or `TimedConditionId`;
- renames or removes an item id or a location id (saves refer to them by id);
- renames an object whose stock or finds should carry over.

No migration: new content with new ids, balance numbers, UI, text. If unsure, compare the shape of `createNewGame()` before and after.

## 2. One step per release

Check `git status --short src/save/steps` and `git log --oneline -3 -- src/save/steps`.

- If the newest step is still uncommitted, it belongs to the release in progress: extend that step (and its test) instead of bumping again.
- A step that is in a commit is released: never edit it. Add a new one.

The release's target save format and game version are in the Roadmap table of `docs/feature-plan.md`.

## 3. Bump the versions

- `src/save/version.ts`: `SAVE_VERSION` from N to N+1. Leave `MIN_SUPPORTED_SAVE_VERSION` alone unless the user asks to drop old saves.
- `package.json` and `package-lock.json`: the game version (the top-level `"version"` and the root package entry under `"packages"` in the lock file) to the roadmap's version for this release.

## 4. Write the step

Create the step file, modelled on the latest step; for format 8 → 9 that is `src/save/steps/v8ToV9.ts` exporting `migrateV8ToV9`:

```ts
// Save format 8 → 9 (game 0.11.0 → 0.12.0). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - <one line per change, in plain words, with the default existing games get>

type Json = Record<string, unknown>;

export function migrateV8ToV9(state: Json): Json {
  const player = state.player as Json;
  return { ...state, player: { ...player, newField: player.newField ?? DEFAULT } };
}
```

- Never import from `src/engine` or `src/data`: copy any constants or ids the step needs into the file.
- Return new objects (spread), do not mutate the input.
- Use `??` so a step run on data that already has the field leaves it alone.
- Give existing games the value a new game would have, or the value the user decided (for example "existing games start counting when loaded").
- A step can be a no-op (`return state;`) when the change only adds an optional field that old saves simply lack; it still needs the bump and the test.

## 5. Register it and keep loading safe

- `src/save/migrations.ts`: import the step and add `8: migrateV8ToV9` (the old format as the key) to `MIGRATIONS`.
- `src/save/saveFile.ts`: if the new data holds item ids (inventories, equipment, storage, ground items, anything new), add them to `referencedItemIds` so saves with unknown items are still rejected; if `looksLikeGameState` checks the shape, extend it.
- New games: `createStartingState` in `src/data/start.ts` (called by `createNewGame` in `src/engine/game.ts`) must create the new fields, and `src/engine/testUtils.ts` too if tests need them.

## 6. Test loading the old format

In `src/save/saveFile.test.ts`, add `describe('migration from save format N', ...)` after the last one:

- Arrange: build a format-N state from `createNewGame(seed)` by deleting or reshaping what changed (see `format5Game` for a bigger reshape).
- Act: `deserializeGame(JSON.stringify({ saveVersion: N, gameVersion: '<old game version>', savedAt: '', state }))`.
- Assert: `toMatchObject({ status: 'ok', migratedFrom: N })`, the defaults existing games get, and that the game plays on (`findAction` / `performAction` on the migrated state) when the change affects actions.
- Keep the `// Arrange`, `// Act`, `// Assert` comments like every test in the repo.

## 7. Document it

- `README.md`, "Saves and versioning": add the row `| N+1 | c.d.0 | <what changed> |` to the save format table.
- `docs/feature-plan.md`: keep the Roadmap's save format column in step (use the `plan-sync` skill).

## 8. Check

Run `npm run typecheck`, `npm test` and `npm run format:check`. The test "has a migration for every supported save version below the current one" fails if the step is not registered.

Report: the new `SAVE_VERSION`, the step's file, what existing games get, and the test name.

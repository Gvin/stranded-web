# CLAUDE.md

Browser text RPG (Vite + React + TypeScript). See README.md for rules and layout.

- Checks before finishing: `npm run typecheck`, `npm test`, `npm run format:check`.
- **Save format rule:** changing the persisted shapes in `src/engine/types.ts`, renaming/removing an item or location id, or renaming an object whose stock/finds must carry over
  requires bumping `SAVE_VERSION` and adding a self-contained step in `src/save/steps/` registered in `src/save/migrations.ts`, plus a
  test loading the old format (see README "Saves and versioning"). Never edit a released migration.
- Engine code must stay pure: `performAction` clones the state; actions mutate only `ctx.state` via the `ActionContext`.
- Randomness goes through the seeded RNG in the state (`ctx.chance`, `ctx.randomInt`), never `Math.random`, so saves stay reproducible.
- Balance numbers belong in `src/engine/rules.ts` or the content files in `src/data/`.
- Locations live one per file in `src/data/locations/`; paths between them in `connections.ts`.
- Every item and building needs an icon: add the game-icons.net name to `scripts/build-icons.mjs` and run `npm run icons`.
- `tasks.json` at the root belongs to Intent Architect; leave it alone.

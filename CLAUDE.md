# CLAUDE.md

Browser text RPG (Vite + React + TypeScript). See README.md for rules and layout.

- Checks before finishing: `npm run typecheck`, `npm test`, `npm run format:check`.
- **Save format rule:** changing the persisted shapes in `src/engine/types.ts`, or renaming/removing an item, location or object id,
  requires bumping `SAVE_VERSION` and adding a self-contained step in `src/save/steps/` registered in `src/save/migrations.ts`, plus a
  test loading the old format (see README "Saves and versioning"). Never edit a released migration.
- Engine code must stay pure: `performAction` clones the state; actions mutate only `ctx.state` via the `ActionContext`.
- Randomness goes through the seeded RNG in the state (`ctx.chance`, `ctx.randomInt`), never `Math.random`, so saves stay reproducible.
- Balance numbers belong in `src/engine/rules.ts` or the content files in `src/data/`.
- `tasks.json` at the root belongs to Intent Architect; leave it alone.

---
name: release
description: Finish a Stranded release after its feature is implemented - content review, versions, save format, README and in-game help, feature plan cleanup, all checks, build and a browser check - then hand the user a summary to commit. Use when a feature from docs/feature-plan.md is implemented and should be wrapped up. Never commits.
argument-hint: '[release name from the roadmap]'
---

# Finishing a release

The user commits and pushes themselves. This skill never runs `git commit`, `git push` or any other command that changes git state (`git mv` is blocked here; ask the user to run such commands).

## 1. Scope

Read the release's row in the Roadmap of `docs/feature-plan.md` and its feature section. Everything in it should be built; anything built beyond it should not be there.

Dispatch the `content-guard` agent with the user's requests for this release (quoted) and the release name. Fix every "Must fix" finding before going on, or ask the user.

## 2. Versions and saves

- The game version in `package.json` and `package-lock.json` matches the roadmap's game version.
- If the persisted state changed, `SAVE_VERSION` matches the roadmap's save format and the migration is complete (use the `save-migration` skill to check every step).
- If nothing persisted changed, `SAVE_VERSION` stays as it is.

## 3. Documentation

- `README.md`, "Game rules": every new or changed rule, with the numbers. Update the tables (clothing, buildings, recipes) and the save format table, and "Code layout" when files or folders were added.
- `src/ui/components/MenuDialog.tsx` ("How to survive"): when a rule it explains changed.
- `docs/feature-plan.md`: use the `plan-sync` skill for a shipped release, which removes the feature, moves the Roadmap on and updates the Overview.

## 4. Checks

Run them in this order and fix what fails:

1. `npm run typecheck`
2. `npm test`
3. `npm run format:check` (or `npm run format` first)
4. `npm run build`

## 5. Browser check

Dispatch the `ui-verifier` agent. Tell it what the release changed on screen, and the game state that shows it (items, location, time, weather, buildings), so it can write a setup module. Fix real problems it reports and run it again.

## 6. Hand over

Report to the user:

- what the release contains, in a few bullets;
- versions: game `x.y.0`, save format `N` (or "unchanged");
- the checks run and their results, with any failure quoted;
- what the browser check looked at, and anything it could not check;
- a commit title in the style of the history (`git log --oneline -5`, for example "Weather and clothing").

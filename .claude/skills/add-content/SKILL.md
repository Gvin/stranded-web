---
name: add-content
description: Add game content to Stranded - items, recipes, buildings, location objects and actions, conditions, weather - with everything each one needs (data entry, icon, sources, tests, README) and only after checking the user decided it. Use whenever new game content goes into src/data or the engine.
argument-hint: '[the content to add]'
---

# Adding game content

## 1. Gate: is it decided?

List every piece of content the change adds: items, recipes, buildings, objects, actions, conditions, weather, events, and the numbers on them (amounts, chances, times, energy, capacities, and an item's `weight`, `groundLifetime`, `fuelMinutes` and `maxHealth`).

For each one, find its source:

- the user's words in this conversation, or
- a decided part of `docs/feature-plan.md`: not inside a "**Suggestion, not decided**" block and not marked "suggested:".

Anything without a source is not added. Name it to the user as a suggestion and wait (CLAUDE.md, "No invented content"). This also covers small "helpful" extras such as a second way to get an item, a new action on an existing object, or a hazard.

Numbers the user gave are used exactly as given. A number nobody gave, including the fields every item must have such as `weight`, goes to the user as a question or a labelled suggestion before it goes into the code. Ask for all the missing numbers of a release in one go.

## 2. Where each kind of content lives

| Content                                 | File                                                                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Items (resources, food, equipment)      | `src/data/items.ts`: `ResourceDef`, `FoodDef` or `EquipmentDef` from `src/engine/definitions.ts`; the list order (`ITEM_ORDER`) decides which items of a crafting type are used up first                              |
| Recipes                                 | `src/data/recipes.ts`                                                                                                                                                                                                 |
| Buildings                               | `src/data/buildings.ts`; a new id also goes into `BuildingId` / `BUILDING_IDS` and `LocationBuildings` in `src/engine/types.ts`                                                                                       |
| Location objects, actions, finds, stock | `src/data/locations/<location>.ts` (one file per location), registered in `LOCATIONS` in `src/data/locations/index.ts`; paths in `connections.ts`; which buildings can stand where is the location's `buildings` list |
| Weather                                 | `src/data/weather.ts`; a new id also goes into `WeatherId` / `WEATHER_IDS` in `src/engine/types.ts`                                                                                                                   |
| Conditions                              | `src/engine/conditions.ts`; the id also goes into `TimedConditionId` or `BodyConditionId` in `src/engine/types.ts`                                                                                                    |
| Balance numbers and formulas            | `src/engine/rules.ts`, or next to the content in `src/data/`; never inline in engine logic                                                                                                                            |

Start from the closest existing entry and copy its shape, not its values: every value comes from the user or the plan (step 1). Useful fields:

- `types` makes an item usable as a crafting type (`stick`, `rope`, `threads`, `glue`, `fuel`, ...); `fuelMinutes` is required for the `fuel` type.
- `maxHealth` makes an item wear out: one entry per item, never stacking.
- `foodGroup` puts food into a nutrition group.
- `clothing` holds the Warmth, Shade, Waterproof and Armor effects.

## 3. Icon

Every item and building needs an icon (CLAUDE.md).

1. Pick a game-icons.net name and check it exists: `node -e "console.log(Object.hasOwn(require('@iconify-json/game-icons/icons.json').icons, 'NAME'))"`.
2. Add it to `GAME_ICONS` in `scripts/build-icons.mjs`, in the matching group.
3. Run `npm run icons` to regenerate `src/icons/gameIcons.ts`.

The content test "has an icon for every item and building" catches a missing one.

## 4. Sources and uses

- Every new item needs a decided way to get it (a find, a recipe, an object action), or the plan saying its source comes later (as with leather). If neither exists, ask the user; never make up a source.
- Every new action shows its time, energy, requirements and gains in its popup: set `minutes`, `energy`, `requires` and `gains` to the decided values, in the same form as the neighbouring actions.
- Randomness only goes through `ctx.chance` / `ctx.randomInt` (the seeded RNG), and engine code mutates only `ctx.state`.

## 5. Saves

New content with new ids needs no migration. These do; use the `save-migration` skill:

- any edit to `src/engine/types.ts`, including a new id in one of its unions (`BuildingId`, `TimedConditionId`, `BodyConditionId`, `WeatherId`, `SkillId`) or a new persisted field;
- a renamed or removed item or location id;
- a renamed object whose stock or finds should carry over. A removed object needs nothing; its stock entries are ignored.

## 6. Tests

- `src/data/content.test.ts` checks references, icons, recipe ingredients and object ids. Its test "matches the resource types of the design" lists every item with `types`, so a new typed item is added to that list, with the decided types.
- Add behaviour tests for new actions and rules next to the engine code (`src/engine/*.test.ts`), using `createTestGame(location, seed)` and `giveItem` from `src/engine/testUtils.ts`, fixed seeds, and `// Arrange`, `// Act`, `// Assert` comments.

## 7. Documentation

- `README.md`, "Game rules": the matching bullet or table (Items, Clothing, Crafting, Buildings, Resin-style source notes, Objects).
- The in-game help in `src/ui/components/MenuDialog.tsx` when a rule it explains changes.
- `docs/feature-plan.md`: remove what is now built when the release is done (`plan-sync` skill).

## 8. Check

Run `npm run typecheck`, `npm test` and `npm run format:check`. For anything visible, ask the `ui-verifier` agent to look at it.

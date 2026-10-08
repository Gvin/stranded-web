# Stranded — feature plan

Last updated: 2026-10-08

## Overview

Environment and clothing protection shipped in game 0.8.0, the rain collector, resin and the 15-minute building steps in 0.9.0 (save format 7), the makeshift raincoat in 0.10.0, skills in 0.11.0 (save format 8), building upgrades in 0.12.0 (save format 9), unknown finds and untried food in 0.12.1 (save format 10), the attributes refactoring in 0.12.2, weapon stats in 0.13.0 (save format 11), tracking animals in 0.14.0, fighting in 0.15.0 (save format 12, with tracking now training Perception) and body part health in 0.16.0 (save format 13); the README describes how they work. Next comes the rest of hunting, and farming last; the Events System gets designed separately. Each release is its own game version with its own save migration, so the game stays playable between them.

Every section below is a suggestion, marked at the top of its section, and nothing in it gets built until you approve it, apart from the parts marked as decided.

Rules every feature follows, taken from how the engine works today:

- Effects on attributes and skills are percentages, listed per source in the Body tab, like wounds and Malnutrition.
- Randomness only goes through the seeded RNG in the state (`ctx.chance`, `ctx.randomInt`), so saves stay reproducible.
- Balance numbers live in `src/engine/rules.ts` or the content files in `src/data/`.
- Every change to the persisted state bumps `SAVE_VERSION`, with a migration step in `src/save/steps/` and a test loading the old format.
- Every new item, building, animal and plant gets a game-icons.net icon.
- Every new action shows its time, energy, requirements and possible gains in the popup, like the existing ones.

## Hunting

> **Suggestion, not decided.** Everything in this section, including every new item, action, building, object and recipe, waits for your approval.

More ways to get meat, and animals that can be hunted out for a while.

**Other ways to get meat**

- **Snare** (stick ×2, rope): set in the forest, checked hours later; may catch a small animal.
- **Spear fishing** at the sea while holding a spear; gives raw fish.
- **Look for nests** at the rocks; gives bird eggs, which have no source today.

**Engine and UI**

- Each location keeps an animal population as a named stock that regrows slowly, so over-hunting empties an area for a few days.
- Save change: none; animal stocks reuse the existing stock map.

## Farming

> **Suggestion, not decided.** Everything in this section, including every new item, action, building, object and recipe, waits for your approval.

A garden at the camp turns foraged seeds and roots into a steady supply of vegetables and fruit. Plants grow over days, need water (rain or carried), and train the Farming skill.

| Crop         | Planted from                                                      | Ripe after                 | Harvest                                 | Group      |
| ------------ | ----------------------------------------------------------------- | -------------------------- | --------------------------------------- | ---------- |
| Taro         | wild taro root (new forest find)                                  | 6 days                     | taro ×3 to cook, plus a root to replant | Vegetables |
| Berry bush   | berry seeds (left over 30% of the time after eating wild berries) | 8 days, then every 3 days  | wild berries ×4                         | Fruits     |
| Coconut palm | a whole coconut                                                   | 30 days, then every 3 days | a coconut                               | Fruits     |

Days are starting values.

**How it works**

- **Garden** is a new camp building with three plots (sticks ×6, stones ×4).
- Each plot moves through Planted, Sprouting, Growing and Ripe. A ripe annual crop rots if left for 3 days.
- Each plot has moisture that drops every hour. Rainy and Stormy weather refill it; **Water** uses a Bottle of water and leaves the empty bottle.
- A plot dry for a day stops growing; dry for two days, the plant dies. Stormy weather may damage young plants.
- Actions: Plant (one per seed you carry), Water, Harvest, Clear. Each trains Farming.

**Engine and UI**

- Crops live in `src/data/crops.ts` (stages, days, water needs, harvest); growth is updated during time ticks like stocks.
- Plots show among the camp's objects with their stage, the days left and a "needs water" note.
- New items: wild taro root, taro, cooked taro, berry seeds, each with an icon.
- Save change: `plots` in the location state of the camp, empty for existing games.

## Events System

Decided: one central system for game events, the things that happen to the player during actions, travel or rest, instead of each action rolling its own hazards. Some events start a fight, and in those fights who acts first depends on the event. Its design is still to come. Until then the game has no hazard events: the ones below were removed from the game and are kept here as candidates.

| Event               | When it could happen                                   | What it did before it was removed                              |
| ------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| Shark attack        | Diving at the reef (4%)                                | 25–40 damage, heavy bleeding on a limb, 35% chance to lose it  |
| Snake bite          | Picking berries (3%)                                   | heavy Poisoned, an injured arm                                 |
| Tripping            | Arriving in the forest (10%, unless agility saves you) | 3 damage, an injured leg, sometimes light bleeding             |
| Falling from a palm | A failed climb for coconuts (40%)                      | 5–12 damage, an injured limb, sometimes bleeding or a fracture |
| Burn while cooking  | Cooking at the campfire (8% at agility 20, up to 25%)  | a burnt arm                                                    |

> **Suggestion, not decided:** how the system could work.

- Every event is defined in one place (`src/data/events.ts`): when it can happen (an action, a location, travel, the time of day, the weather), its chance and what changes it (attributes, skills, clothing), and its outcome (damage, conditions, items, a log line).
- The engine checks for events after each action and while time passes, through the seeded RNG, so saves stay reproducible.
- An event that starts a fight could be an animal attacking you while you travel.

## Roadmap

Two releases take the game from 0.16.0 (save format 13) to 0.18.0 (save format 15), made of the sections above.

| Release | Game version | Save format | Contents                                                                                  |
| ------- | ------------ | ----------- | ----------------------------------------------------------------------------------------- |
| Hunting | 0.17.0       | 14          | Animal populations, snares, spear fishing, nests                                          |
| Farming | 0.18.0       | 15          | Garden with 3 plots, taro, berry bushes and palms, watering and rain, seeds from foraging |

Farming relies on the existing rain to water the garden.

**Why this order**

- The rest of hunting comes next: more ways to get meat, now that fights give it.
- Farming comes last: it leans on rain, the Farming skill and the nutrition groups.

**Testing each release**

- Engine rules as unit tests on fixed seeds, as today (for example: a plot left dry for two days loses its plant).
- A migration test that loads the previous save format.
- `npm run typecheck`, `npm test` and `npm run format:check`, then a browser check at phone size by day and at night.

## Open questions

- [ ] Events System: when are events checked (after actions, on the way, while resting or sleeping), and which of the removed hazards come back?
- [ ] Should the spear take both hands, like the bow?
- [ ] Can animals come to the camp (a boar raiding the garden), or do fights only happen away from it?
- [ ] Should planting need a tool, such as a digging stick?

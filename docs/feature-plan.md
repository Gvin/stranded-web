# Stranded — feature plan

Last updated: 2026-10-07

## Overview

Environment and clothing protection shipped in game 0.8.0, the rain collector, resin and the 15-minute building steps in 0.9.0 (save format 7), the makeshift raincoat in 0.10.0, skills in 0.11.0 (save format 8), building upgrades in 0.12.0 (save format 9), unknown finds and untried food in 0.12.1 (save format 10), the attributes refactoring in 0.12.2, weapon stats in 0.13.0 (save format 11) and tracking animals in 0.14.0; the README describes how they work. Next come the rest of hunting, then fighting, and farming last; the Events System gets designed separately. Each release is its own game version with its own save migration, so the game stays playable between them.

Every section below is a suggestion, marked at the top of its section, and nothing in it gets built until you approve it, apart from the parts marked as decided.

Rules every feature follows, taken from how the engine works today:

- Effects on attributes and skills are percentages, listed per source in the Body tab, like wounds and Malnutrition.
- Randomness only goes through the seeded RNG in the state (`ctx.chance`, `ctx.randomInt`), so saves stay reproducible.
- Balance numbers live in `src/engine/rules.ts` or the content files in `src/data/`.
- Every change to the persisted state bumps `SAVE_VERSION`, with a migration step in `src/save/steps/` and a test loading the old format.
- Every new item, building, animal and plant gets a game-icons.net icon.
- Every new action shows its time, energy, requirements and possible gains in the popup, like the existing ones.

## Hunting

Decided: hunting comes before fighting, as it is where fights come from. Its first step, Track animals in the forest, shipped in game 0.14.0 (see the README); a found trail only shows a popup so far.

> **Suggestion, not decided.** The rest of this section, apart from the parts marked as decided, including every new item, action, building, object and recipe, waits for your approval.

Hunting is its own activity, as decided when the forest boars were removed: track an animal, stalk it, then shoot or fight it. It becomes the main source of meat, hides, feathers and bones, and so feeds the Meat nutrition group and leather gear.

**Leather** (decided): leather, which already exists as a resource and is needed for the leather tunic, hat, jacket, the small rain collector and the makeshift raincoat, gets its source from hunting.

**The hunt**

1. **Track animals** (in the game, forest only): a found trail tells which animal made it.
2. **Stalk**: each try brings you closer. Agility against the animal's wariness; a failure scares it off, or makes an aggressive animal charge.
3. **Strike**: shoot from a distance with the bow, or close in. Either way it becomes an encounter (see Fighting) that starts at the current distance.
4. **Butcher** a large kill with something sharp (about 30 minutes). Small kills go straight into the bag.

| Animal       | Where        | Active        | Health | Danger                               | Loot                       |
| ------------ | ------------ | ------------- | ------ | ------------------------------------ | -------------------------- |
| Seabird      | Beach, Rocks | day           | 5      | flies off                            | feathers ×2–4, raw meat    |
| Coconut crab | Beach        | night         | 12     | pinches (Injured)                    | raw crab ×2                |
| Goat         | Rocks        | day           | 25     | flees; butts when cornered (Injured) | raw meat ×3, hide, bone    |
| Wild boar    | Forest       | dawn, evening | 40     | charges (Fracture, Bleeding)         | raw meat ×4, hide ×2, bone |

**Other ways to get meat**

- **Snare** (stick ×2, rope): set in the forest, checked hours later; may catch a small animal.
- **Spear fishing** at the sea while holding a spear; gives raw fish.
- **Look for nests** at the rocks; gives bird eggs, which have no source today.

**Engine and UI**

- Each location keeps an animal population as a named stock that regrows slowly, so over-hunting empties an area for a few days.
- New resources: hide, bone (for later recipes such as bone-tipped arrows and a needle).
- A found trail is stored in the state, so a hunt survives a reload.
- Save change: the found trail, with a version bump as the save rule requires; animal stocks reuse the existing stock map.

## Fighting

> **Suggestion, not decided.** Everything in this section, including every new item, action, building, object and recipe, waits for your approval.

There are no fights in the game today. Fighting becomes an encounter of short rounds, where each round you choose what to do, and wounds land on real body parts. Encounters start when you hunt, or when an animal attacks you while travelling or gathering (an event, see Events System).

**Actions in a round** (about 1 minute and 2 energy each)

- **Attack** with the held weapon (bare hands if nothing).
- **Shoot** with the bow while the animal is still at a distance; one arrow per shot, which may be lost.
- **Brace** to raise your defence for the round; a held spear also strikes a charging animal first.
- **Flee**, an agility check against the animal's speed. Failing gives the animal a free attack; succeeding takes you back along the path you came.

**How a round resolves**

1. The faster side acts first: agility against the animal's speed.
2. You hit with the chance of your melee or ranged accuracy (see Fighting stats in the README).
3. A hit takes your melee or ranged damage from the animal's health.
4. An animal hit picks a body part (arms and legs most often), loses one point of damage per Armor point worn (already in the engine: `hit` in `src/engine/outcomes.ts`), then applies its wound kind and health loss through the existing `injure` helper.
5. The encounter ends when the animal dies, the animal runs off at low health, you flee, or you die.

**Engine and UI**

- Animals live in `src/data/animals.ts` with health, damage, speed, defence, wound kind, aggression and loot (see Hunting).
- The state gets an optional `encounter: { animalId, health, distance, round }`; while it is set, only encounter actions and the Bag (equipping or bandaging costs a round) are available.
- The Explore tab turns into an encounter card: the animal's icon, a health bar, the distance, and large action buttons for phones.
- Each round is logged in one line ("You hit the boar with the spear. It gores your left leg: Bleeding.").
- Save change: the optional `encounter` field, with a version bump as the save rule requires.

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

Decided: one central system for game events, the things that happen to the player during actions, travel or rest, instead of each action rolling its own hazards. Its design is still to come. Until then the game has no hazard events: the ones below were removed from the game and are kept here as candidates.

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
- Later, an event could also start a fight (an animal attacks while you travel).

## Roadmap

Three releases take the game from 0.14.0 (save format 11) to 0.17.0 (save format 14), all made of the suggestions above.

| Release  | Game version | Save format | Contents                                                                                                 |
| -------- | ------------ | ----------- | -------------------------------------------------------------------------------------------------------- |
| Hunting  | 0.15.0       | 12          | Trails that lead to animals, stalking, 4 animals, hides and bones, leather, snares, spear fishing, nests |
| Fighting | 0.16.0       | 13          | Fight encounters                                                                                         |
| Farming  | 0.17.0       | 14          | Garden with 3 plots, taro, berry bushes and palms, watering and rain, seeds from foraging                |

Fighting gives the existing Armor and the Fighting skill their use, and farming relies on the existing rain to water the garden.

**Why this order**

- Hunting comes before fighting: it is where fights come from, and fighting then turns its strike into an encounter.
- Farming comes last: it leans on rain, the Farming skill and the nutrition groups.

**Testing each release**

- Engine rules as unit tests on fixed seeds, as today (for example: a stone tip arrow hits harder than a bad wooden arrow; a plot left dry for two days loses its plant).
- A migration test that loads the previous save format.
- `npm run typecheck`, `npm test` and `npm run format:check`, then a browser check at phone size by day and at night.

## Open questions

- [ ] Hunting before fighting: until fights exist, how should a hunt end? Recommendation: let the Hunting release give meat only where no fight is needed (snares, nests, spear fishing), and have trails lead to a strike once Fighting is in.
- [ ] Events System: when are events checked (after actions, on the way, while resting or sleeping), and which of the removed hazards come back?
- [ ] Should the spear take both hands, like the bow?
- [ ] Leather from hunting: straight from the kill, or hides that are made into leather?
- [ ] Can animals come to the camp (a boar raiding the garden), or do fights only happen away from it?
- [ ] Should planting need a tool, such as a digging stick?
- [ ] Fixed time per fight round (about 1 minute), or should encounters stop the clock?

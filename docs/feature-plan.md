# Stranded — feature plan

Last updated: 2026-10-07

## Overview

Environment and clothing protection shipped in game 0.8.0, the rain collector, resin and the 15-minute building steps in 0.9.0 (save format 7), the makeshift raincoat in 0.10.0, skills in 0.11.0 (save format 8), and building upgrades in 0.12.0 (save format 9); the README describes how they work. Next come weapon stats, then fighting and hunting, and farming last; the Events System gets designed separately. Each release is its own game version with its own save migration, so the game stays playable between them.

Everything below is a suggestion, marked at the top of its section, and nothing in it gets built until you approve it, apart from the parts marked as decided.

Rules every feature follows, taken from how the engine works today:

- Effects on attributes and skills are percentages, listed per source in the Body tab, like wounds and Malnutrition.
- Randomness only goes through the seeded RNG in the state (`ctx.chance`, `ctx.randomInt`), so saves stay reproducible.
- Balance numbers live in `src/engine/rules.ts` or the content files in `src/data/`.
- Every change to the persisted state bumps `SAVE_VERSION`, with a migration step in `src/save/steps/` and a test loading the old format.
- Every new item, building, animal and plant gets a game-icons.net icon.
- Every new action shows its time, energy, requirements and possible gains in the popup, like the existing ones.

## Weapon stats

> **Suggestion, not decided.** Everything in this section, including every new item, action, building, object and recipe, waits for your approval.

The single `combat` bonus on held items becomes a weapon profile: damage, accuracy, speed, hands and the kind of wound it makes. Fighting and hunting read these stats, and fighting with any weapon trains the Fighting skill.

| Weapon     | Damage         | Accuracy       | Speed  | Hands | Wounds                                      |
| ---------- | -------------- | -------------- | ------ | ----- | ------------------------------------------- |
| Bare hands | 2              | +0%            | fast   |       | bruises (Injured)                           |
| Knife      | 5              | +10%           | fast   | 1     | Bleeding                                    |
| Hammer     | 7              | +0%            | normal | 1     | can Fracture                                |
| Axe        | 9              | −5%            | slow   | 1     | Bleeding                                    |
| Spear      | 8              | +5%            | normal | 2     | Bleeding; strikes first (reach)             |
| Bow        | from the arrow | from the arrow | slow   | 2     | Bleeding; shoots before melee, needs arrows |

Arrows get a damage value next to their accuracy and loss chance (bad 4, wooden 6, stone tip 9). Numbers are starting values based on today's `combat` values.

- **Damage** is scaled by strength in percent; **accuracy** adds to the hit chance, which agility also raises.
- **Speed** decides who acts first in a fighting round: fast before normal before slow.
- **Two-handed** weapons (spear, bow) need both arms working and take both hand slots.
- With two one-handed weapons held, the better one attacks.
- The **wound kind** decides what a hit does to an animal, and the same table is used when animals hit you (claws: Bleeding, bites: Injured, charges: Fracture).

**Engine and UI**

- `EquipmentDef.combat` becomes `weapon?: { damage, accuracy, speed, hands, wound }`, and `bestWeapon` ranks by expected damage.
- The Bag shows "Damage 5 · Accuracy +10% · Fast" on weapons; the Body tab shows the weapon you would fight with.
- Save change: none for the stats. Two-handed holding changes how `equipment` is filled, which needs a small migration for saves holding a spear or bow in one hand.

## Fighting

> **Suggestion, not decided.** Everything in this section, including every new item, action, building, object and recipe, waits for your approval.

Today a fight is one dice roll (`fight` in `src/engine/outcomes.ts`). It becomes an encounter of short rounds, where each round you choose what to do, and wounds land on real body parts. Encounters start when you hunt, or when an animal attacks you while travelling or gathering (an event, see Events System).

**Actions in a round** (about 1 minute and 2 energy each)

- **Attack** with the held weapon (bare hands if nothing).
- **Shoot** with the bow while the animal is still at a distance; one arrow per shot, which may be lost.
- **Brace** to raise your defence for the round; a held spear also strikes a charging animal first.
- **Flee**, an agility check against the animal's speed. Failing gives the animal a free attack; succeeding takes you back along the path you came.

**How a round resolves**

1. The faster side acts first: weapon speed and agility against the animal's speed.
2. Hit chance = 50% + weapon accuracy + a Fighting skill bonus + agility difference, kept between 5% and 95%.
3. A hit deals the weapon's damage, scaled by strength and the Fighting skill, to the animal's health.
4. An animal hit picks a body part (arms and legs most often), loses one point of damage per Armor point worn (already in the engine: `hit` in `src/engine/outcomes.ts`), then applies its wound kind and health loss through the existing `injure` helper.
5. The encounter ends when the animal dies, the animal runs off at low health, you flee, or you die.

**Engine and UI**

- Animals live in `src/data/animals.ts` with health, damage, speed, defence, wound kind, aggression and loot (see Hunting).
- The state gets an optional `encounter: { animalId, health, distance, round }`; while it is set, only encounter actions and the Bag (equipping or bandaging costs a round) are available.
- The Explore tab turns into an encounter card: the animal's icon, a health bar, the distance, and large action buttons for phones.
- Each round is logged in one line ("You hit the boar with the spear. It gores your left leg: Bleeding.").
- Save change: the optional `encounter` field, with a version bump as the save rule requires.

## Hunting

> **Suggestion, not decided.** Everything in this section, including every new item, action, building, object and recipe, waits for your approval.

Hunting is its own activity, as decided when the forest boars were removed: track an animal, stalk it, then shoot or fight it. It becomes the main source of meat, hides, feathers and bones, and so feeds the Meat nutrition group and leather gear.

**Leather** (decided): leather, which already exists as a resource and is needed for the leather tunic, hat, jacket, the small rain collector and the makeshift raincoat, gets its source from hunting.

**The hunt**

1. **Look for tracks**, a location action (about 30 minutes). Perception decides whether you find a trail, and of which animal.
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
- A found trail is stored with the encounter, so a hunt survives a reload.
- Save change: covered by the `encounter` field from Fighting; animal stocks reuse the existing stock map.

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

Three releases take the game from 0.12.0 (save format 9) to 0.15.0 (save format 12), all made of the suggestions above.

| Release            | Game version | Save format | Contents                                                                                                   |
| ------------------ | ------------ | ----------- | ---------------------------------------------------------------------------------------------------------- |
| Weapon stats       | 0.13.0       | 10          | Weapon profiles, two-handed weapons                                                                        |
| Fighting + hunting | 0.14.0       | 11          | Fight encounters, tracking and stalking, 4 animals, hides and bones, leather, snares, spear fishing, nests |
| Farming            | 0.15.0       | 12          | Garden with 3 plots, taro, berry bushes and palms, watering and rain, seeds from foraging                  |

Fighting gives the existing Armor and the Fighting skill their use, and farming relies on the existing rain to water the garden.

**Why this order**

- Weapon stats come before fighting, which reads them.
- Hunting reuses the fight encounter.
- Farming comes last: it leans on rain, the Farming skill and the nutrition groups.

**Testing each release**

- Engine rules as unit tests on fixed seeds, as today (for example: a stone tip arrow hits harder than a bad wooden arrow; a plot left dry for two days loses its plant).
- A migration test that loads the previous save format.
- `npm run typecheck`, `npm test` and `npm run format:check`, then a browser check at phone size by day and at night.

## Open questions

- [ ] Events System: when are events checked (after actions, on the way, while resting or sleeping), and which of the removed hazards come back?
- [ ] Is it right that the spear and the bow take both hands?
- [ ] Leather from hunting: straight from the kill, or hides that are made into leather?
- [ ] Can animals come to the camp (a boar raiding the garden), or do fights only happen away from it?
- [ ] Should planting need a tool, such as a digging stick?
- [ ] Fixed time per fight round (about 1 minute), or should encounters stop the clock?

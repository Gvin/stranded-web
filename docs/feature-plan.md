# Stranded — feature plan

Last updated: 2026-10-06

## Overview

Environment and clothing protection shipped in game 0.8.0, the rain collector, resin and the 15-minute building steps in 0.9.0 (save format 7), the makeshift raincoat in 0.10.0, and skills in 0.11.0 (save format 8); the README describes how they work. Next come building upgrades, then weapon stats, fighting and hunting, and farming last; the Events System gets designed separately. Each release is its own game version with its own save migration, so the game stays playable between them.

"Building upgrades" is decided, apart from the open points marked in it. Everything after it is a suggestion, marked at the top of its section, and nothing in it gets built until you approve it, apart from the parts marked as decided.

Rules every feature follows, taken from how the engine works today:

- Effects on attributes and skills are percentages, listed per source in the Body tab, like wounds and Malnutrition.
- Randomness only goes through the seeded RNG in the state (`ctx.chance`, `ctx.randomInt`), so saves stay reproducible.
- Balance numbers live in `src/engine/rules.ts` or the content files in `src/data/`.
- Every change to the persisted state bumps `SAVE_VERSION`, with a migration step in `src/save/steps/` and a test loading the old format.
- Every new item, building, animal and plant gets a game-icons.net icon.
- Every new action shows its time, energy, requirements and possible gains in the popup, like the existing ones.

## Building upgrades

Decided: buildings come in chains of levels. Each level is built on top of the one before and improves it; a level can only be built, and only shows up under "Build here", once the level before it stands.

Each level's steps are in the Steps columns below; a step is 15 minutes and 2 energy (less time with the Building skill), and the levels that exist today keep their steps. Whole chains from nothing:

| Chain     | Steps | Time       | Energy |
| --------- | ----- | ---------- | ------ |
| House     | 38    | 9 h 30 min | 76     |
| Fireplace | 20    | 5 h        | 40     |
| Workbench | 13    | 3 h 15 min | 26     |
| Storage   | 25    | 6 h 15 min | 50     |

**House**

| Level | Building     | Materials                                         | Tools       | Where                         | Steps                   |
| ----- | ------------ | ------------------------------------------------- | ----------- | ----------------------------- | ----------------------- |
| 1     | Sleeping mat | cloth ×4, threads ×2                              |             | any location (not on the way) | 2 (30 min)              |
| 2     | Shelter      | stick ×7, threads ×4, leaves ×6, rope ×2, moss ×5 |             | any location (not on the way) | 6 (1 h 30 min)          |
| 3     | Hut          | log ×5, stick ×10, rope ×4, leaves ×10, moss ×10  | Hammer      | the clearing                  | 10 (2 h 30 min, as now) |
| 4     | House        | log ×10, stick ×20, rope ×6, leaves ×15, clay ×10 | Hammer, Axe | the clearing                  | 20 (5 h)                |

Shelter, Hut and House give their location a roof. Where you sleep decides how much energy and health you get back, and every sleep, short or till morning, gives a condition for 20 hours. The best level in the location counts:

| Sleeping on  | Energy per hour | Health per hour | Condition     | Effect                 |
| ------------ | --------------- | --------------- | ------------- | ---------------------- |
| nothing      | 7               | none            | Awful Sleep   | −20% to all attributes |
| Sleeping mat | 8               | none            | Bad Sleep     | −10% to all attributes |
| Shelter      | 10              | 1               | none          |                        |
| Hut          | 12              | 2               | Good Sleep    | +10% to all attributes |
| House        | 15              | 3               | Perfect Sleep | +20% to all attributes |

This replaces today's sleep, which gives 11 energy per hour (14 in a hut) and 2.5 health per hour anywhere. Thirst and hunger still grow slower while you sleep, and health still recovers 0.5 per hour while awake, as today. Resting heals at that same 0.5 per hour (down from 1.5) and restores 5 energy per hour (down from 8).

**Sleepy**: a new condition, −20% to all attributes, for as long as the player has not slept for at least 20 hours. Sleeping ends it, and while Sleepy the player can sleep at any energy (otherwise sleep still needs energy below 50).

**Fireplace** (only at the clearing)

| Level | Building  | Materials                                        | Holds fuel | Burns        | Steps              |
| ----- | --------- | ------------------------------------------------ | ---------- | ------------ | ------------------ |
| 1     | Campfire  | stick ×5, threads ×3                             | 5          | 1 per hour   | 2 (30 min, as now) |
| 2     | Fireplace | stone ×10, log ×3, stick ×3, threads ×3          | 15         | 1 per hour   | 6 (1 h 30 min)     |
| 3     | Furnace   | stone ×20, log ×6, stick ×6, threads ×5, clay ×5 | 20         | 0.7 per hour | 12 (3 h)           |

- Rain and storms put out the Campfire and the Fireplace, even under a roof, and they cannot be lit again until the rain stops. The fuel in them stays and burns again once the fire is relit. The Furnace is not affected.
- A fire burns only with fuel, and can be lit and put out.
- **Add fuel** is a separate action where you pick any fuel item; it takes no time and no energy. Fuel per item: log 3, stick 1, rope 0.7, vine 0.5, threads 0.3, cloth 0.3, bandage 0.3, moss 0.2, grass 0.1. The bow no longer burns, and leaves do not burn. An item can only be added when its fuel fits into what the fire can still hold (for example, no log while a Campfire has more than 2 fuel left).

Lighting any fire needs one of these:

| Way            | Needs                                                 | Time, energy     |
| -------------- | ----------------------------------------------------- | ---------------- |
| Bow drill      | a bow and a stick (the stick is used up)              | 15 min, 3 energy |
| Pair of flints | a pair of flints (it loses 1 of its 20 health a time) | 10 min, 1 energy |
| Friction       | 2 sticks (1 is used up)                               | 30 min, 5 energy |
| Torch          | a lit torch                                           | instant          |

**Torch**: a new craftable item from stick, cloth and glue, with 100 health, held in a hand. It is made unlit and can be lit from a burning fire, or from a lit torch on the ground or in hand. A lit torch loses 2 health per hour wherever it is (in hand, in the bag or on the ground), and it can be put out. Rain puts it out everywhere except in a location with a roof.

**Workbench**

| Level | Building        | Materials                            | Tools           | Steps                  |
| ----- | --------------- | ------------------------------------ | --------------- | ---------------------- |
| 1     | Basic workbench | log ×2, stick ×4, rope ×2 (as today) | something sharp | 5 (1 h 15 min, as now) |
| 2     | Workbench       | log ×4, stick ×8, rope ×4, stone ×4  | Hammer          | 8 (2 h)                |

The Workbench (level 2) will be needed for more advanced recipes, to come later.

**Storage**

| Level | Building       | Holds            | Materials                             | Tools       | Steps                  |
| ----- | -------------- | ---------------- | ------------------------------------- | ----------- | ---------------------- |
| 1     | Small storage  | 40 kg (as today) | log ×2, stick ×6, rope ×2 (as today)  | Hammer      | 5 (1 h 15 min, as now) |
| 2     | Medium storage | 80 kg            | log ×4, stick ×10, rope ×4, leaves ×8 | Hammer      | 8 (2 h)                |
| 3     | Big storage    | 150 kg           | log ×8, stick ×16, rope ×6, clay ×6   | Hammer, Axe | 12 (3 h)               |

**New items**

| Item           | Found or made                                                                 | Weight  | Lasts on the ground |
| -------------- | ----------------------------------------------------------------------------- | ------- | ------------------- |
| Leaves         | 2–4 at a 30% chance when gathering sticks; 20–30 every time you chop wood     | 0.05 kg | 1 day               |
| Moss           | 1–2 at a 20% chance, in the forest when gathering sticks or picking berries   | 0.1 kg  | 2 days              |
| Clay           | 1 at a 5% chance, when gathering stones                                       | 0.5 kg  | 60 days             |
| Pair of flints | crafted from flint ×2; 20 health, loses 1 each time it lights a fire          | 0.6 kg  | 60 days             |
| Torch          | crafted from stick, cloth, glue; 100 health, loses 2 per hour while it is lit | 0.5 kg  | 15 days             |

**Item names**

Every item, old and new, gets two names: one for a single item, with its article, and one for several. For example, Stick: "a stick" and "sticks"; Axe: "an axe" and "axes". Messages use them, so they read "You drop a stick on the ground." and "You leave 3 sticks on the ground." instead of "You drop stick on the ground." I write the names for all items, and you look over the list.

**Engine and UI**

- A chain is one building slot per location with a level; building the next level replaces the one before, and a bigger storage keeps what is stored in it.
- The fire changes from "lit until" to fuel left plus lit or not; the existing Campfire's remaining burn time becomes fuel.
- The pair of flints and the torch wear out like clothing: they have health and never stack. A torch also stores whether it is lit.
- The sleep conditions work like Overheated and Freezing (timed, with fixed penalties or bonuses); a new sleep replaces the old one.
- Sleepy needs the time the player last woke up in the state; existing games start counting from the moment they are loaded.
- Item names are two new fields on every item definition; they are not saved, so they need no save change.
- Save change: existing games keep what they built: a Hut stays a Hut (level 3, with the mat and shelter counted as built), the Small storage and the Workbench become level 1.

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

Four releases take the game from 0.11.0 (save format 8) to 0.15.0 (save format 12). The first is decided; the others are made of the suggestions above.

| Release            | Game version | Save format | Contents                                                                                                                                        |
| ------------------ | ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Building upgrades  | 0.12.0       | 9           | House, Fireplace, Workbench and Storage chains, sleep quality, Sleepy, fuel and lighting, torch, leaves, moss, clay, pair of flints, item names |
| Weapon stats       | 0.13.0       | 10          | Weapon profiles, two-handed weapons                                                                                                             |
| Fighting + hunting | 0.14.0       | 11          | Fight encounters, tracking and stalking, 4 animals, hides and bones, leather, snares, spear fishing, nests                                      |
| Farming            | 0.15.0       | 12          | Garden with 3 plots, taro, berry bushes and palms, watering and rain, seeds from foraging                                                       |

Fighting gives the existing Armor and the Fighting skill their use, and farming relies on the existing rain to water the garden.

**Why this order**

- Building upgrades come first: they build on what the game has today.
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

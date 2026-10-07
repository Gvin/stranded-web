# Stranded — feature plan

Last updated: 2026-10-07

## Overview

Environment and clothing protection shipped in game 0.8.0, the rain collector, resin and the 15-minute building steps in 0.9.0 (save format 7), the makeshift raincoat in 0.10.0, skills in 0.11.0 (save format 8), and building upgrades in 0.12.0 (save format 9); the README describes how they work. Next comes the attributes refactoring, whose changes are still to be designed (the Roadmap below follows once they are), then weapon stats, fighting and hunting, and farming last; the Events System gets designed separately. Each release is its own game version with its own save migration, so the game stays playable between them.

The Attributes Refactoring section only describes how the game works today, so far. Everything after it is a suggestion, marked at the top of its section, and nothing in it gets built until you approve it, apart from the parts marked as decided.

Rules every feature follows, taken from how the engine works today:

- Effects on attributes and skills are percentages, listed per source in the Body tab, like wounds and Malnutrition.
- Randomness only goes through the seeded RNG in the state (`ctx.chance`, `ctx.randomInt`), so saves stay reproducible.
- Balance numbers live in `src/engine/rules.ts` or the content files in `src/data/`.
- Every change to the persisted state bumps `SAVE_VERSION`, with a migration step in `src/save/steps/` and a test loading the old format.
- Every new item, building, animal and plant gets a game-icons.net icon.
- Every new action shows its time, energy, requirements and possible gains in the popup, like the existing ones.

## Attributes Refactoring

Partly decided. First what changes, then how attributes work today, as the starting point.

### Decided changes

- **20 is the basic value** of every attribute. Above 20 an attribute helps the actions it affects; below 20 it penalizes them.
- **Success chances**: three actions that roll an attribute check today get a success chance of 30% + (attribute − 20) / 2 instead. That is 30% at 20, 40% at 40, 70% at 100 and 25% at 10. At the start of a game this makes them harder than today (30% instead of 50–55%), on purpose:
  - Tear down vines: Strength (today 55% at 20).
  - Climb for coconuts: Agility (today 55% at 20).
  - Dive at the reef: Agility (today 50% at 20).
- **Perception** multiplies the base chance of every foraging find by 1 at 20, rising evenly to 2 at 100: 1 + (Perception − 20) / 80, so 1.5 at 60. The amounts found stay the same, and find chances stay capped at 95%. Today the multiplier is 0.5 + Perception / 40, which reaches 3 at 100.
- **Pick berries**: the check that leaves bitter berries on the bush goes away. A picked berry is bitter 10% of the time (today 30%), whatever the Perception: bitter berries are a resource of their own, for uses still to come. Perception still raises the chance of finding moss there, like every foraging find.
- **Travel time** keeps scaling with Agility as it does today.
- Not discussed yet, so unchanged: max health and carry capacity (Strength), max thirst, hunger and energy (Endurance), fighting, the modifiers and training.

### How attributes work today

**The four attributes**: Strength, Endurance, Perception and Agility. Each has a base value that starts at 20 and grows to at most 100 (`BASE_ATTRIBUTE` and `MAX_ATTRIBUTE` in `src/engine/rules.ts`). Everything below uses the effective value: the base changed by the modifiers further down, kept between 1 and 100. The player starts with an injured left arm, so their effective Strength is 18.

**What each attribute does** (formulas in `src/engine/rules.ts`; the value in brackets is at 20)

| Attribute  | Affects                                                  | How                                                                      |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| Strength   | Max health                                               | 80 + Strength (100)                                                      |
| Strength   | Carry capacity                                           | 10 + Strength / 2 kg (20 kg)                                             |
| Strength   | Tear down vines: whether a vine gives way                | check against 15 (55%)                                                   |
| Strength   | Fighting power, in the engine only: no action fights yet | (Strength + Agility) / 2 + the weapon's bonus                            |
| Endurance  | Max thirst, max hunger and max energy                    | 80 + Endurance each (100)                                                |
| Perception | The chance of every foraging find (not the amounts)      | × (0.5 + Perception / 40), at most 95% (×1 at 20, ×1.5 at 40, ×3 at 100) |
| Perception | Pick berries: leaving the bitter berries on the bush     | check against 25 (45%)                                                   |
| Agility    | Travel time between locations                            | × √(20 / Agility), between ×0.5 and ×3 (×1 at 20, ×0.5 at 80)            |
| Agility    | Climb for coconuts: whether you reach the top            | check against 15 (55%)                                                   |
| Agility    | Dive at the reef: whether the current lets you reach it  | check against 20 (50%)                                                   |
| Agility    | Fighting power, in the engine only                       | see Strength                                                             |

- A **check** succeeds with 50% + (attribute − difficulty)%, between 5% and 95%.
- **Foraging finds** that Perception improves:
  - Search the wreckage, Look for fallen coconuts and Comb the tideline.
  - Dive at the reef (mussels, fish and rope, once the Agility check lets you reach the reef).
  - Gather stones (flint and clay; the stones themselves always come).
  - Gather sticks (resin, leaves and moss), Pick berries (moss) and Chop wood (resin).
- Fixed amounts (sticks, grass, pebbles, mushrooms, logs) do not depend on any attribute.
- The engine can also scale an action's time by an attribute (`speedAttribute`), but no action uses it; only travel scales with Agility.
- The Body tab shows a short hint per attribute: "Max health, carry weight and fighting.", "Max energy, thirst and hunger.", "Finding things when searching or gathering." and "Travel speed, climbing and fighting."

**Modifiers**: percentages that add up, with all penalties together never lowering an attribute by more than 90%. They are listed per source in the Body tab.

| Source                                     | Strength            | Endurance           | Perception          | Agility             |
| ------------------------------------------ | ------------------- | ------------------- | ------------------- | ------------------- |
| Injured or Burnt arm                       | −10% (bandaged −4%) |                     |                     |                     |
| Injured or Burnt leg                       |                     |                     |                     | −10% (bandaged −4%) |
| Injured or Burnt torso                     | −10% (bandaged −4%) | −10% (bandaged −4%) |                     |                     |
| Injured or Burnt head                      |                     | −10% (bandaged −4%) | −10% (bandaged −4%) |                     |
| Fractured arm / leg                        | −20%                |                     |                     | −25%                |
| Splinted arm / leg                         | −8%                 |                     |                     | −10%                |
| Missing arm / leg                          | −30%                |                     |                     | −40%                |
| Dizzy light / medium / heavy               |                     |                     | −10/−20/−35%        | −10/−20/−35%        |
| Thirsty or Starving light / medium / heavy | −10/−20/−35%        |                     | −10/−20/−35%        | −10/−20/−35%        |
| Overheated, Freezing                       | −20%                | −20%                | −20%                | −20%                |
| Malnutrition                               | −15%                | −15%                | −15%                | −15%                |
| Sleepy                                     | −20%                | −20%                | −20%                | −20%                |
| Awful / Bad / Good / Perfect Sleep         | −20/−10/+10/+20%    | −20/−10/+10/+20%    | −20/−10/+10/+20%    | −20/−10/+10/+20%    |

- Exhaustion (energy below 10% of its maximum) makes you Dizzy (medium).
- Thirsty and Starving begin when their bar is over 50% full, medium over 75%, heavy over 90%.
- Bleeding, Poisoned and Wet change no attribute.
- Max thirst, hunger and energy leave out Thirsty, Starving and Dizzy, so those conditions never shrink the bars that cause them. Max health and carry capacity count every modifier.

**How attributes are trained**

- An action lists training points for some attributes. Each time it is performed, those points are added, whether it succeeds or not.
- A base point costs 10 + the current base in points: 30 at 20, 60 at 50, 109 at 99. Each new point is logged, and training stops at 100.
- Only the base grows; modifiers have nothing to do with training.

| Action                   | Time, energy             | Strength | Endurance | Perception | Agility |
| ------------------------ | ------------------------ | -------- | --------- | ---------- | ------- |
| Search the wreckage      | 30 min, 5                |          |           | 2          |         |
| Climb for coconuts       | 30 min, 10               | 1        |           |            | 2       |
| Look for fallen coconuts | 20 min, 2                |          |           | 1          |         |
| Comb the tideline        | 20 min, 3                |          |           | 1          |         |
| Dive at the reef         | 45 min, 12               |          | 2         |            | 1       |
| Pick berries             | 20 min, 2                |          |           | 1          |         |
| Cut vines                | 15 min, 3                | 1        |           |            |         |
| Tear down vines          | 30 min, 6                | 2        |           |            |         |
| Chop wood                | 2 h, 25                  | 3        | 2         |            |         |
| Gather stones            | 15 min, 4                | 2        |           | 1          |         |
| Travel (every journey)   | by the route and Agility |          | 1         |            | 1       |
| Cook (every item)        | 15 min, 0                |          |           | 1          |         |
| Bandage                  | 10 min, 0                |          |           | 1          |         |
| Splint                   | 20 min, 3                |          | 1         | 1          |         |
| Every building step      | 15 min, 2                | 1        |           |            |         |

Nothing else trains attributes:

- crafting (any recipe), resting, sleeping, eating and drinking;
- gathering grass, sticks and pebbles, and picking mushrooms;
- the spring and the rain collector;
- feeding, lighting or sitting by the fire, and the torch;
- equipping, dropping, picking up and storing items.

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

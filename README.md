# stranded-web

Text-based browser game about survival on an island. Works on desktop and mobile screens.

## Running

Requires Node.js 20+.

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # type-check + production build into dist/
npm run format     # format with Prettier
```

The build uses relative paths, so `dist/` can be hosted from any static web server or sub-path.

## Game rules

- **Stats** — Health, Thirst, Hunger, Energy. Health and energy: higher is better. Thirst and hunger: lower is better — they grow
  as time passes and drop when you drink or eat (the spring quenches thirst completely). Energy is spent by actions and restored by
  resting (5 an hour) and sleeping (see Sleep). Sleep is only offered below 50 energy, or at any energy once you are Sleepy (hidden
  otherwise): either for 8 hours, or — in the evening and at night — until 06:00.
  Health reaching 0 kills the player.
- **Overflow damage** — an action never needs enough energy: whatever energy you lack, and any thirst or hunger pushed past the
  maximum (also while time passes), is taken from health instead (rates in `overflowDamage` in `src/engine/rules.ts`).
- **Attributes** — Strength, Endurance, Perception, Agility. They start at 20 (max 100) and slowly improve with use. Every
  building step trains a little Strength; crafting trains no attributes, only the Crafting skill.
  - 20 is the basic value: above it an attribute helps the actions it affects, below it penalizes them (`ATTRIBUTE_RULES` in
    `src/engine/rules.ts`).
  - Strength: max health (80 + Strength), carry capacity (10 + Strength / 2 kg), tearing down vines, melee damage.
  - Endurance: max energy, thirst and hunger (80 + Endurance each).
  - Perception: multiplies the chance of every foraging find (not the amounts) by 1 at 20, rising evenly to 2 at 100,
    and the chance of finding a trail when tracking animals by 1 at 20, rising evenly to 3 at 100 (30% to 90%); these
    chances stay capped at 95%.
  - Agility: travel time (×√(20 / Agility), between ×0.5 and ×3), climbing for coconuts, diving at the reef, melee and
    ranged accuracy.
  - Tearing down vines (Strength), climbing for coconuts and diving at the reef (Agility) succeed 30% of the time at 20,
    half a percent more for every point above (70% at 100) and less below (25% at 10).
  - Picking berries: every berry picked has a 10% chance to be a bitter one, whatever the Perception.
- **Skills** — Fighting, Farming, Building, Foraging and Crafting, each from level 0 to 10 (`SKILL_RULES` in
  `src/engine/rules.ts`, shown in the Body tab, where a "?" next to each skill tells what its level gives). 100 points of practice take a skill to its next level; a new level is logged.
  - Building: 10 points per building step. Crafting: 10 points per craft, however many items it makes. Both take 5% off the
    time per level (level 10 takes half the time). From level 5, finishing a building or a craft may give back
    one used resource: 10% at level 5, 30% at 6, 50% at 7, 70% at 8, 100% at 9, and at level 10 also a 50% chance of a second.
    Only an ingredient used 2 or more times can give one back, and never its last unit.
  - Foraging: 2 points per foraging action (searching the wreckage, climbing for and looking for coconuts, combing the
    tideline, diving at the reef, picking berries and mushrooms, cutting and tearing down vines, gathering grass, sticks,
    stones and pebbles, chopping wood). Each level adds 10% to every find chance (20% becomes 22% at level 1) and 5% to the
    gathered items, a fraction becoming one more item by chance, never more than is left.
  - Fighting: +2% accuracy per level, and +1 damage from level 4, +2 from 7, +3 at 10, in melee and with the bow. Nothing
    trains it yet, as there are no fights.
  - Farming has no effect yet.
- **Modifiers** — all bonuses and penalties to attributes are percentages. They add up and are shown per source in the Body tab.
- **Body parts** — head, torso, two arms, two legs. Conditions: Injured, Bleeding, Fractured, Burnt, Missing, Bandaged and Splinted
  (a set fracture). Bandaged replaces Injured, Burnt and Bleeding; Splinted replaces Fractured. A fractured, splinted or missing arm
  cannot hold items.
- **Healing** — injuries and burns heal with time; a bandage keeps the healing going at twice the speed. Fractures only heal once
  splinted. Bleeding, Poisoned and Dizzy have a severity (light, medium, heavy) that eases over time until they wear off; getting
  hurt again makes them worse.
- **Player conditions** — Poisoned and Dizzy as above; Starving and Thirsty (light/medium/heavy) follow the hunger and thirst bars;
  exhaustion makes you dizzy too; Malnutrition while a food group is empty (see Nutrition); Wet, Overheated and Freezing come from
  the environment; Awful, Bad, Good and Perfect Sleep and Sleepy come from sleeping (see Sleep).
- **Environment** — island-wide weather plus a temperature from the time of day (numbers in `ENVIRONMENT_RULES` in
  `src/engine/rules.ts`, weather in `src/data/weather.ts`). The header shows the weather and the island temperature; the Body tab
  shows the weather with your body temperature ("Rainy, Very Cold") and what that temperature does to thirst and hunger.
  - Temperature steps: Very Cold, Cold, Normal, Hot, Very Hot. Morning (07–10) and evening (17–21) are Normal, midday (11–16) is
    Hot, night (22–06) is Cold. The weather shifts that, never past Very Cold or Very Hot.
  - Weather: when one ends, the next is picked by chance and lasts a random time: Clear 30% (1–16 h, +1), Cloudy 20% (1–16 h),
    Windy 20% (1–10 h, −1), Rainy 20% (1–4 h, −1), Stormy 10% (1–3 h, −2).
  - Body temperature: a roof (a shelter, hut or house) or a hat with Shade takes Hot and Very Hot one step down (they do not add
    up); heating (a burning fire) and clothes with Warmth each take Cold and Very Cold one step up, never above Normal; being Wet
    is −1.
  - Hot makes thirst grow 25% faster, Very Hot 50%. Cold makes thirst grow 10% slower and hunger 25% faster, Very Cold 50%. More
    than an hour of Very Hot or Very Cold without a break makes you Overheated or Freezing (−20% to all attributes), renewed
    while it lasts and gone 30 minutes later.
  - After 10 minutes out in rain or storm with neither a roof nor waterproof clothes you get Wet (getting under a roof or putting
    on waterproof clothes starts the 10 minutes over). Wet dries 2 hours after the rain (twice as fast while the island is Hot or
    Very Hot). Rain also puts out fires and torches (see Fire and torches). Storms make the sea too rough to dive.
  - Travelling: while a journey's time passes the player is "On the way" (`src/data/locations/path.ts`), a location with nothing
    in it: out in the open, with no roof or fire, under the island's weather. It has no paths and is never a destination.
  - Recovering: "Wash your face" at the spring pool (5 min, 1 energy; offered only while the island is Very Hot or you are overheated)
    starts the hour until overheating over and takes 15 minutes off Overheated. "Sit next to the fire" at a burning fire
    (5 min, no energy; offered only while the island is Very Cold or you are freezing or wet) starts the hour until freezing over and
    takes 15 minutes off Freezing and Wet.
  - The page background takes on a grey tint when it is cloudy or windy and a darker one in rain and storms.
- **Nutrition** — three food groups shown as bars in the Body tab: Vegetables (mushrooms, seaweed, ship biscuits), Meat (crab, mussels, fish,
  meat, eggs) and Fruits (berries, coconut). They start at 33 each and never add up to more than 99. Every meal adds 2 to its
  group and takes 1 from each of the others; water belongs to no group. While any group is at 0, Malnutrition
  lowers every attribute by 15%. Numbers in `NUTRITION_RULES` in `src/engine/rules.ts`.
- **Sleep** — what you sleep on (the house slot where you are, see Buildings) decides what you get back for every hour asleep,
  and every sleep, short or till morning, leaves a condition for 20 hours that changes all attributes and replaces the one before
  (`sleep` in `src/data/buildings.ts`, `SLEEP_RULES` in `src/engine/rules.ts`):

  | Sleeping on     | Energy per hour | Health per hour | Condition after waking |
  | --------------- | --------------- | --------------- | ---------------------- |
  | the bare ground | 7               | none            | Awful Sleep (−20%)     |
  | Sleeping mat    | 8               | none            | Bad Sleep (−10%)       |
  | Shelter         | 10              | 1               | none                   |
  | Hut             | 12              | 2               | Good Sleep (+10%)      |
  | House           | 15              | 3               | Perfect Sleep (+20%)   |

  Thirst and hunger grow slower while you sleep. Awake or resting, health recovers 0.5 an hour. Health only comes back while
  thirst and hunger are at most half full and nothing drains it. After 20 hours without sleep you are **Sleepy** (−20% to all
  attributes): you can sleep at any energy, and the next sleep ends it.

- **Time** — every action shows its duration and energy cost (instant actions show no time). While time passes, stats change, wounds bleed or heal, and dropped items
  decay (food in hours, stone in weeks). Dropping an item takes no time. The interface follows the time of day: light by day, dark
  at night, with dusky colours at dawn and in the evening.
- **Action details** — hovering an action (long-pressing it on a touch screen) shows a popup with a detailed explanation, every
  requirement (met or not) and the possible gains with their current chances. Requirements name what is needed ("Something
  sharp"), not every item that would do. Climbing a palm needs both arms and both legs unbroken. A possible find of an item
  you have never had shows as "Unknown find" with a question mark and its chance; once you have had the item, by any means,
  it shows by name.
- **Body tab indicators** — a red dot while wounds need treatment, and a "!" badge when a new condition appears on the body or
  one of its parts, until you open the Body tab.
- **Items** — resources, food and equipment, each with an icon. Equipment is worn on the head or body (you start in your
  Clothes) or held in a hand: Knife, Hammer, Axe, Spear and Bow work as tools and weapons when held, and a Torch carries fire and works as a weapon too. The Bow takes both hands: holding it puts away what the other hand held, that hand stays empty ("taken by the bow") while it is held, it cannot be held with a fractured, splinted or missing arm, and it goes into the bag when either arm breaks. Messages
  name items in plain words ("a stick", "3 sticks", "an axe"). Every resource has crafting
  **types** (e.g. Vine is `fuel, rope`, Flint is `stone, sharp, knife`). A whole coconut has to be opened before it can be eaten;
  an opened coconut leaves a shell behind 30% of the time. What a food or drink does (hunger, thirst, energy, food group, risks
  and leftovers) stays unknown until you have eaten or drunk it once.
- **Clothing** — worn items can have Warmth, Shade, Waterproof (no Wet in the rain) and Armor (each point stops one point of
  damage from every hit, once there are fights). Clothing wears out: each piece has health, never stacks, and loses 1 health
  per 24 hours worn (kept as a fraction). At 10% health a warning shows next to it; at 0 it is destroyed and a popup says so.
  Crafted clothing starts at full health.

  | Item               | Slot | Health | Effects            | How to get it                      |
  | ------------------ | ---- | ------ | ------------------ | ---------------------------------- |
  | Clothes            | body | 60/100 | Warmth             | worn at the start                  |
  | Baseball hat       | head | 30/100 | Shade              | the wreckage                       |
  | Makeshift clothes  | body | 60     | Warmth             | cloth ×2, threads, rope            |
  | Makeshift hat      | head | 30     | Shade              | cloth, threads                     |
  | Rope armor         | body | 100    | Armor 1            | rope ×5, threads                   |
  | Leather tunic      | body | 100    | Warmth, Armor 1    | Leather ×3, threads, rope          |
  | Leather hat        | head | 100    | Shade, Armor 1     | Leather ×2, threads                |
  | Leather jacket     | body | 200    | Warmth, Armor 2    | Leather ×5, threads ×2, rope       |
  | Makeshift raincoat | body | 100    | Warmth, Waterproof | Leather ×3, glue ×2, threads, rope |

  Leather has no source yet, so the leather items and the raincoat cannot be made yet.

- **Fighting stats** — shown in the Fighting section of the Bag tab, with a "?" that shows how each one adds up. There are no
  fights yet; these are the stats they will use (`FIGHTING_RULES` in `src/engine/rules.ts`, `src/engine/fighting.ts`).
  - The **weapon hand** is the right hand, or the left one when the right arm cannot hold anything; it is marked "weapon" in
    "Worn and held". Only the item in it counts; clothes add nothing.
  - **Melee**: accuracy = (50% + the weapon's bonus + the Fighting skill's) × the Agility factor (0.75 at 0, 1 at 20, 2 at 100),
    at most 95%. Damage = 1 + the weapon's bonus + the Fighting skill's + the Strength bonus: −1 below 10, 0 from 10 to 39,
    +1 from 40, +2 from 60, +3 from 80, +4 at 100.

    | Weapon | Damage | Accuracy |
    | ------ | ------ | -------- |
    | Knife  | +1     | +10%     |
    | Hammer | +2     | −10%     |
    | Axe    | +3     | −5%      |
    | Spear  | +3     | +5%      |
    | Torch  | +1     | +10%     |

  - **Ranged**: only while holding the Bow (in both hands) with arrows in the arrow slot. Accuracy = (30% +
    the arrow's bonus + the Fighting skill's) × the ranged Agility factor (0.5 at 0, rising evenly to 1.5 at 100, so 0.7 at
    20), at most 95%. Damage = 1 + the arrow's bonus + the Fighting skill's; Strength does not count.
- **Arrows** — equipped in the arrow slot of "Worn and held": Equip moves all arrows of that kind there, one kind at a time
  (arrows of another kind go back into the bag), and Put away returns them. Arrows made or found later go into the bag. They
  weigh the same in the slot. Bad wooden arrows add nothing and are lost half the time, wooden arrows add 15% accuracy and are
  lost 30% of the time, stone tip arrows add 2 damage and 15% accuracy and are lost 20% of the time (losing arrows comes
  with fighting).
- **Crafting** — every recipe costs 1 energy (`CRAFT_ENERGY` in `src/engine/rules.ts`) and trains the Crafting skill, no attributes. Recipes ask for types, so "any rope" accepts a vine or a rope; the cheapest matching items are used first. Some tools
  are needed but not used up (the heavy item that opens a coconut, the knife that whittles arrows). A recipe can also require a
  building or a location object nearby (`stations` in `src/data/recipes.ts`); Hammer and Bow need a workbench of any level. The Craft tab only
  shows what you can make right now; a toggle adds the recipes you have made before. A dot on the tab and a "New" badge mark
  recipes you can make but never have.

  | Recipe           | Ingredients               | Time    | Tools (kept) | Station   |
  | ---------------- | ------------------------- | ------- | ------------ | --------- |
  | Opened coconut   | Coconut                   | 5 min   | heavy        |           |
  | Threads          | rope                      | 10 min  | sharp        |           |
  | Rope             | threads ×2                | 15 min  |              |           |
  | Knife            | stick, sharp              | 20 min  |              |           |
  | Pair of flints   | Flint ×2                  | instant |              |           |
  | Bandage          | cloth, rope               | 10 min  |              |           |
  | Torch            | stick, cloth, glue        | 15 min  |              |           |
  | Spear            | stick, sharp, rope        | 30 min  |              |           |
  | Bad wooden arrow | stick (makes 5)           | 30 min  | knife        |           |
  | Wooden arrow     | Bad wooden arrow, feather | 10 min  |              |           |
  | Stone tip arrow  | Wooden arrow, pebble      | 10 min  |              |           |
  | Axe              | stick, rope, sharp        | 40 min  |              |           |
  | Hammer           | stick, stone, rope        | 30 min  |              | Workbench |
  | Bow              | stick, rope               | 30 min  |              | Workbench |

  The clothing recipes are in the Clothing table above.

- **Buildings** — a separate thing from crafting. Every location has building slots, each holding one building at a time
  (`src/data/buildings.ts`). The buildings of a slot are levels: a level is offered under "Build here" only once the level below
  it stands, is built on top of it, and replaces it when finished (until then the one below keeps working). Each location lists
  what can be built there (`buildings` in its file): a sleeping mat and a shelter anywhere you can stay, everything at the
  Clearing, which becomes your Camp as soon as building starts, and nothing on the way. Buildings are built in steps of 15
  minutes and 2 energy each (`BUILDING_STEP_MINUTES` and `BUILDING_STEP_ENERGY` in `src/engine/rules.ts`); the materials
  are used up by the first step, tools are needed for every step, and an unfinished building waits among the location's
  objects until you continue. "Build here" on the Explore screen is collapsed until opened.

  | Slot      | Level | Building             | Steps | Materials (first step)                            | Tools (every step) | What it does                           |
  | --------- | ----- | -------------------- | ----- | ------------------------------------------------- | ------------------ | -------------------------------------- |
  | House     | 1     | Sleeping mat         | 2     | cloth ×4, threads ×2                              |                    | better sleep than the ground           |
  | House     | 2     | Shelter              | 6     | stick ×7, threads ×4, Leaves ×6, rope ×2, Moss ×5 |                    | a roof; better sleep                   |
  | House     | 3     | Hut                  | 10    | Log ×5, stick ×10, rope ×4, Leaves ×10, Moss ×10  | Hammer             | a roof; restful sleep (camp only)      |
  | House     | 4     | House                | 20    | Log ×10, stick ×20, rope ×6, Leaves ×15, Clay ×10 | Hammer, Axe        | a roof; the best sleep (camp only)     |
  | Fire      | 1     | Campfire             | 2     | stick ×5, threads ×3                              |                    | holds 5 fuel, burns 1 an hour          |
  | Fire      | 2     | Fireplace            | 6     | stone ×10, Log ×3, stick ×3, threads ×3           |                    | holds 15 fuel, burns 1 an hour         |
  | Fire      | 3     | Furnace              | 12    | stone ×20, Log ×6, stick ×6, threads ×5, Clay ×5  |                    | holds 20, burns 0.7 an hour, rainproof |
  | Workbench | 1     | Basic workbench      | 5     | Log ×2, stick ×4, rope ×2                         | something sharp    | needed for some recipes                |
  | Workbench | 2     | Workbench            | 8     | Log ×4, stick ×8, rope ×4, stone ×4               | Hammer             | for advanced recipes, still to come    |
  | Storage   | 1     | Small storage        | 5     | Log ×2, stick ×6, rope ×2                         | Hammer             | holds 40 kg; items never rot           |
  | Storage   | 2     | Medium storage       | 8     | Log ×4, stick ×10, rope ×4, Leaves ×8             | Hammer             | holds 80 kg, keeps what was stored     |
  | Storage   | 3     | Big storage          | 12    | Log ×8, stick ×16, rope ×6, Clay ×6               | Hammer, Axe        | holds 150 kg, keeps what was stored    |
  | Collector | 1     | Small rain collector | 5     | Log ×5, rope ×4, threads ×3, glue ×2, Leather ×3  | Hammer, Axe        | collects rainwater                     |

  The fire slot only exists at the Camp; so do the workbench, storage and collector.

  The **Small rain collector** fills while it rains, whatever roof the camp has: 10 bottles of water per hour of Rainy weather,
  15 per hour of Stormy weather, up to 2 bottles. The camp shows what it holds ("1.5 / 2 bottles of water"). Drink (1 bottle,
  like a Bottle of water) and Fill a bottle (1 bottle, turns an Empty bottle into a Bottle of water) use its water, and so does
  Wash your face (0.5 bottles; offered only while the island is Very Hot or you are overheated). It needs Leather, which has no
  source yet, so it cannot be built yet.

- **Fire and torches** — a fire burns only while it has fuel and is lit (`fire` in `src/data/buildings.ts`). A new Campfire is
  built full of fuel but unlit; upgrading a fire keeps its fuel (up to what the new level holds) and its flame. **Add to the fire**
  takes no time or energy and only offers an item whose fuel still fits: Log 3, stick 1, rope 0.7, vine 0.5, threads 0.3, cloth
  0.3, bandage 0.3, Moss 0.2, Grass 0.1 (leaves and the bow do not burn). Putting a fire out is instant and keeps its fuel. A fire
  that runs out of fuel goes out. Lighting it needs fuel in it and one of these ("Light the fire"):

  | Way            | Needs                                                 | Time, energy     |
  | -------------- | ----------------------------------------------------- | ---------------- |
  | Bow drill      | a Bow and a stick (the stick is used up)              | 15 min, 3 energy |
  | Pair of flints | a Pair of flints (it loses 1 of its 20 health a time) | 10 min, 1 energy |
  | Friction       | 2 sticks (1 is used up)                               | 30 min, 5 energy |
  | Torch          | a lit torch: carried, or on the ground here           | instant          |

  Rain and storms put out a Campfire or Fireplace, roof or not, and it cannot be lit again until the rain stops; the fuel stays.
  A Furnace is never put out by rain. Only a burning fire cooks and warms.

  A **Torch** (100 health, held in a hand) is made unlit. It is lit, instantly, from a burning fire or another lit torch (carried
  or on the ground here), and can be put out again. Lit, it loses 2 health an hour wherever it is — in hand, in the bag or on the ground (`TORCH_BURN_PER_HOUR` in `src/engine/rules.ts`) — and burns out at 0; putting it into storage puts it out. Rain puts it out everywhere except in a location with a roof. Held items do not wear out by themselves. A Pair of flints is made from two flints in no time.

- **Resin** (`glue`) — a 5% chance of one while gathering sticks in the forest, 30% while chopping wood.
- **Leaves, moss and clay** — Leaves: 2–4 at a 30% chance while gathering sticks, and 20–30 from every felled tree. Moss: 1–2 at
  a 20% chance while gathering sticks or picking berries in the forest. Clay: 1 at a 5% chance while gathering stones. Like every foraging find (resin too), the chances grow with Perception and the Foraging skill; the amounts only with Foraging.

- **Island** — the Forest connects to all the other places. Locations can have objects with actions, and actions of their own
  (listed under "Around you").

  | Location        | What is there                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
  | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | Beach (start)   | Wreckage (gone for good once everything is found, including a worn baseball hat), coconut palms (a coconut grows every 3 days, one falls every 6 days), the sea (comb the tideline — a few finds at a time, renewed every 8 hours — dive at the reef except in storms, drink seawater)                                                                                                                                                                                                                 |
  | Forest          | Berry bushes, vines, mushrooms (one regrows every 3 days); gather grass (unlimited), gather sticks (30 lying around, 10 more every day; sometimes resin, leaves, moss), chop wood (needs an axe; 2 h: 8–10 logs, 15–20 sticks, up to 3 vines, 20–30 leaves, sometimes resin; what you cannot carry is left on the ground); track animals (3 h, 10 energy: a fresh animal trail 30% of the time at 20 Perception and 90% at 100, with no Foraging bonus, shown in a popup; nothing follows a trail yet) |
  | Spring          | The pool: clean water, wash your face                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | Rocks           | The rocky interior: gather stones (sometimes flint or clay) and pebbles, both unlimited                                                                                                                                                                                                                                                                                                                                                                                                                |
  | Clearing / Camp | Building site: every building, with all its levels                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

- **Objects** — each location has objects that provide actions. Hidden objects are not listed but still offer actions
  (shown under "Around you").

## Code layout

| Path                  | Contents                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/engine/`         | Game rules: state types, attributes, conditions, time simulation, actions. No UI code.                                                 |
| `src/engine/rules.ts` | Balance constants and formulas in one place.                                                                                           |
| `src/data/`           | Content: items, recipes, buildings, start state.                                                                                       |
| `src/data/locations/` | One file per location (plus `path.ts`, where the player is while travelling), `connections.ts` for the paths, `index.ts` joining them. |
| `src/icons/`          | Generated icon data (`npm run icons`, list in `scripts/build-icons.mjs`).                                                              |
| `src/save/`           | Versioned saving to `localStorage` and save migrations.                                                                                |
| `src/ui/`             | React UI. Mobile shows a bottom tab bar; screens 900px and wider show two columns.                                                     |
| `.claude/`            | Claude Code skills and agents for this repo, and the browser check script they use (`.claude/scripts/verify-ui.mjs`).                  |

`performAction(state, actionId)` in `src/engine/game.ts` is the single entry point that changes the game: it never mutates its input
and returns the next state. The UI saves after every successful action.

## Saves and versioning

A save stores the state together with the game version that wrote it (`package.json` version) and the save format version
(`SAVE_VERSION` in `src/save/version.ts`). Each game version declares `MIN_SUPPORTED_SAVE_VERSION`, the oldest format it can still
load. Older saves are upgraded step by step through `MIGRATIONS` in `src/save/migrations.ts` (one file per step in `src/save/steps/`)
and re-saved in the current format; saves that are too old, from a newer game, or referring to unknown items are reported on the start
screen instead of being loaded.

| Save format | Game version | Change                                                                                                |
| ----------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| 1           | 0.1.0        | First version.                                                                                        |
| 2           | 0.2.0        | Typed resources replace old items, conditions store healing time left, buildings, no back slot.       |
| 3           | 0.3.0        | Thirst and hunger count up, head and body slots (clothes), crafted recipes, palm stocks.              |
| 4           | 0.6.0        | Unfinished buildings are stored per location (buildings are built in steps).                          |
| 5           | 0.7.0        | Nutrition per food group (vegetables, meat, fruits).                                                  |
| 6           | 0.8.0        | Weather, Very Hot / Very Cold exposure, equipment with health, clothes that wear out.                 |
| 7           | 0.9.0        | Small rain collector with its water; building steps all take 15 minutes (more steps per building).    |
| 8           | 0.11.0       | Skills; unfinished buildings record the materials they used.                                          |
| 9           | 0.12.0       | Buildings stand in slots with levels; fires hold fuel; lit torches; the time the player last woke up. |
| 10          | 0.12.1       | The items the player has had and the foods they have tried.                                           |
| 11          | 0.13.0       | The arrow slot; a held bow takes both hands (kept in the right hand, the left one empty).             |

A migration is needed when you:

- change anything in `src/engine/types.ts` (the persisted state), or
- rename or remove an item or location id (saves refer to them by id), or
- rename an object whose stock or finds should carry over. (A removed object only leaves unused stock entries, which are ignored.)

Then:

1. Increment `SAVE_VERSION` (and the game version in `package.json`).
2. Add a step in `src/save/steps/` that converts the previous format, and register it in `MIGRATIONS[oldVersion]`. Keep the step
   self-contained (copy any old constants it needs) and never change it once released.
3. Add a test that loads a save of the previous format.
4. Raise `MIN_SUPPORTED_SAVE_VERSION` only when dropping support for old saves on purpose.

Adding new content or changing balance numbers needs no migration.

## Credits

Icons by Lorc, Delapouite and other contributors from [game-icons.net](https://game-icons.net), licensed under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The opened coconut and coconut shell icons were drawn for this game.

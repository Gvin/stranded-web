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
  resting and sleeping. Sleep is only possible below 50 energy: either for 8 hours, or — in the evening and at night — until 06:00.
  Health reaching 0 kills the player.
- **Overflow damage** — an action never needs enough energy: whatever energy you lack, and any thirst or hunger pushed past the
  maximum (also while time passes), is taken from health instead (rates in `overflowDamage` in `src/engine/rules.ts`).
- **Attributes** — Strength, Endurance, Perception, Agility. They start at 20 (max 100) and slowly improve with use.
  - Strength: max health, carry weight, fighting.
  - Endurance: max energy, thirst and hunger.
  - Perception: chance of finding things.
  - Agility: travel time, climbing, fighting.
- **Skills** — Fighting, Farming, Building, Foraging and Crafting, each from level 0 to 10 (`SKILL_RULES` in
  `src/engine/rules.ts`, shown in the Body tab). 100 points of practice take a skill to its next level; a new level is logged.
  - Building: 10 points per building step. Crafting: 10 points per craft, however many items it makes. Both take 5% off the
    time per level (level 10 takes half the time). From level 5, finishing a building or a craft may give back
    one used resource: 10% at level 5, 30% at 6, 50% at 7, 70% at 8, 100% at 9, and at level 10 also a 50% chance of a second.
    Only an ingredient used 2 or more times can give one back, and never its last unit.
  - Foraging: 2 points per foraging action (searching the wreckage, climbing for and looking for coconuts, combing the
    tideline, diving at the reef, picking berries and mushrooms, cutting and tearing down vines, gathering grass, sticks,
    stones and pebbles, chopping wood). Each level adds 10% to every find chance (20% becomes 22% at level 1) and 5% to the
    gathered items, a fraction becoming one more item by chance, never more than is left.
  - Fighting and Farming have no effect yet.
- **Modifiers** — all bonuses and penalties to attributes are percentages. They add up and are shown per source in the Body tab.
- **Body parts** — head, torso, two arms, two legs. Conditions: Injured, Bleeding, Fractured, Burnt, Missing, Bandaged and Splinted
  (a set fracture). Bandaged replaces Injured, Burnt and Bleeding; Splinted replaces Fractured. A fractured, splinted or missing arm
  cannot hold items.
- **Healing** — injuries and burns heal with time; a bandage keeps the healing going at twice the speed. Fractures only heal once
  splinted. Bleeding, Poisoned and Dizzy have a severity (light, medium, heavy) that eases over time until they wear off; getting
  hurt again makes them worse.
- **Player conditions** — Poisoned and Dizzy as above; Starving and Thirsty (light/medium/heavy) follow the hunger and thirst bars;
  exhaustion makes you dizzy too; Malnutrition while a food group is empty (see Nutrition); Wet, Overheated and Freezing come from
  the environment.
- **Environment** — island-wide weather plus a temperature from the time of day (numbers in `ENVIRONMENT_RULES` in
  `src/engine/rules.ts`, weather in `src/data/weather.ts`). The header shows the weather and the island temperature; the Body tab
  shows your body temperature and each step that led to it, by name: "Evening Normal", "Clear → Hot", "Hut roof → Normal".
  - Temperature steps: Very Cold, Cold, Normal, Hot, Very Hot. Morning (07–10) and evening (17–21) are Normal, midday (11–16) is
    Hot, night (22–06) is Cold. The weather shifts that, never past Very Cold or Very Hot.
  - Weather: when one ends, the next is picked by chance and lasts a random time: Clear 30% (1–16 h, +1), Cloudy 20% (1–16 h),
    Windy 20% (1–10 h, −1), Rainy 20% (1–4 h, −1), Stormy 10% (1–3 h, −2).
  - Body temperature: a roof (the hut) or a hat with Shade takes Hot and Very Hot one step down (they do not add up); heating (a
    burning campfire) and clothes with Warmth each take Cold and Very Cold one step up, never above Normal; being Wet is −1.
  - Hot makes thirst grow 25% faster, Very Hot 50%. Cold makes thirst grow 10% slower and hunger 25% faster, Very Cold 50%. More
    than an hour of Very Hot or Very Cold without a break makes you Overheated or Freezing (−20% to all attributes), renewed
    while it lasts and gone 30 minutes later.
  - After 10 minutes out in rain or storm with neither a roof nor waterproof clothes you get Wet (getting under a roof or putting
    on waterproof clothes starts the 10 minutes over). Wet dries 2 hours after the rain (twice as fast while the island is Hot or
    Very Hot), and puts out a campfire that cannot be lit again until the rain stops. Storms make the sea too rough to dive.
  - Travelling: while a journey's time passes the player is "On the way" (`src/data/locations/path.ts`), a location with nothing
    in it: out in the open, with no roof or fire, under the island's weather. It has no paths and is never a destination.
  - Recovering: "Wash your face" at the spring pool (5 min, 1 energy; offered only while the island is Very Hot or you are overheated)
    starts the hour until overheating over and takes 15 minutes off Overheated. "Sit next to the fire" at a burning campfire
    (5 min, no energy; offered only while the island is Very Cold or you are freezing or wet) starts the hour until freezing over and
    takes 15 minutes off Freezing and Wet.
  - The page background takes on a grey tint when it is cloudy or windy and a darker one in rain and storms.
- **Nutrition** — three food groups shown as bars in the Body tab: Vegetables (mushrooms, seaweed, ship biscuits), Meat (crab, mussels, fish,
  meat, eggs) and Fruits (berries, coconut). They start at 33 each and never add up to more than 99. Every meal adds 2 to its
  group and takes 1 from each of the others; water belongs to no group. While any group is at 0, Malnutrition
  lowers every attribute by 15%. Numbers in `NUTRITION_RULES` in `src/engine/rules.ts`.
- **Time** — every action shows its duration and energy cost (instant actions show no time). While time passes, stats change, wounds bleed or heal, and dropped items
  decay (food in hours, stone in weeks). Dropping an item takes no time. The interface follows the time of day: light by day, dark
  at night, with dusky colours at dawn and in the evening.
- **Action details** — hovering an action (long-pressing it on a touch screen) shows a popup with a detailed explanation, every
  requirement (met or not) and the possible gains with their current chances. Requirements name what is needed ("Something
  sharp"), not every item that would do. Climbing a palm needs both arms and both legs unbroken.
- **Body tab indicators** — a red dot while wounds need treatment, and a "!" badge when a new condition appears on the body or
  one of its parts, until you open the Body tab.
- **Items** — resources, food and equipment, each with an icon. Equipment is worn on the head or body (you start in your
  Clothes) or held in a hand: Knife, Hammer, Spear and Bow work as tools and weapons when held. Every resource has crafting
  **types** (e.g. Vine is `fuel, rope`, Flint is `stone, sharp, knife`). A whole coconut has to be opened before it can be eaten;
  an opened coconut leaves a shell behind 30% of the time.
- **Clothing** — worn items can have Warmth, Shade, Waterproof (no Wet in the rain) and Armor (each point stops one point of
  damage from every hit in a fight). Clothing wears out: each piece has health, never stacks, and loses 1 health
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

- **Arrows** — the bow needs arrows to shoot. The best arrow in the bag is used automatically: bad
  wooden arrows add no accuracy and are lost half the time, wooden arrows add 5 and are lost 30% of the time, stone tip arrows add
  10 and are lost 20% of the time. With arrows, the bow is also the best weapon. No location offers shooting or hunting yet —
  hunting will come as its own feature; the engine already supports it (`fight` and `fireArrow` in `src/engine/outcomes.ts`).
- **Crafting** — every recipe costs 1 energy (`CRAFT_ENERGY` in `src/engine/rules.ts`). Recipes ask for types, so "any rope" accepts a vine or a rope; the cheapest matching items are used first. Some tools
  are needed but not used up (the heavy item that opens a coconut, the knife that whittles arrows). A recipe can also require a
  building or a location object nearby (`stations` in `src/data/recipes.ts`); Hammer and Bow need a Workbench. The Craft tab only
  shows what you can make right now; a toggle adds the recipes you have made before. A dot on the tab and a "New" badge mark
  recipes you can make but never have.

  | Recipe           | Ingredients               | Tools (kept) | Station   |
  | ---------------- | ------------------------- | ------------ | --------- |
  | Opened coconut   | Coconut                   | heavy        |           |
  | Threads          | rope                      | sharp        |           |
  | Rope             | threads ×2                |              |           |
  | Knife            | stick, sharp              |              |           |
  | Bandage          | cloth, rope               |              |           |
  | Spear            | stick, sharp, rope        |              |           |
  | Bad wooden arrow | stick (makes 5)           | knife        |           |
  | Wooden arrow     | Bad wooden arrow, feather |              |           |
  | Stone tip arrow  | Wooden arrow, pebble      |              |           |
  | Axe              | stick, rope, sharp        |              |           |
  | Hammer           | stick, stone, rope        |              | Workbench |
  | Bow              | stick, rope               |              | Workbench |

  The clothing recipes are in the Clothing table above.

- **Buildings** — a separate thing from crafting: Campfire (cooks food, burns any fuel item, heats the location while lit),
  Workbench, Small storage (40 kg, items never rot), Hut (restful sleep, a roof over the location) and Small rain collector. Each location lists which buildings can be built there (`buildings` in its file);
  for now only the Clearing does, and it becomes your Camp as soon as building starts. Buildings are built in steps of 15 minutes and 2 energy
  each (`BUILDING_STEP_MINUTES` and `BUILDING_STEP_ENERGY` in `src/engine/rules.ts`); the materials are used up by the first step, and an unfinished building waits among the location's objects
  until you continue. "Build here" on the Explore screen is collapsed until opened. Costs and steps live in `src/data/buildings.ts`:

  | Building             | Steps | Materials (first step)                           | Tools (every step) |
  | -------------------- | ----- | ------------------------------------------------ | ------------------ |
  | Campfire             | 2     | stick ×4, threads, stone ×3                      |                    |
  | Workbench            | 5     | Log ×2, stick ×4, rope ×2                        | something sharp    |
  | Small storage        | 5     | Log ×2, stick ×6, rope ×2                        | Hammer             |
  | Hut                  | 10    | Log ×4, stick ×8, rope ×4, Grass ×6              | Hammer             |
  | Small rain collector | 5     | Log ×5, rope ×4, threads ×3, glue ×2, Leather ×3 | Hammer, Axe        |

  The **Small rain collector** fills while it rains, whatever roof the camp has: 10 bottles of water per hour of Rainy weather,
  15 per hour of Stormy weather, up to 2 bottles. The camp shows what it holds ("1.5 / 2 bottles of water"). Drink (1 bottle,
  like a Bottle of water) and Fill a bottle (1 bottle, turns an Empty bottle into a Bottle of water) use its water, and so does
  Wash your face (0.5 bottles; offered only while the island is Very Hot or you are overheated). It needs Leather, which has no
  source yet, so it cannot be built yet.

- **Resin** (`glue`) — a 5% chance of one while gathering sticks in the forest, 30% while chopping wood.

- **Island** — the Forest connects to all the other places. Locations can have objects with actions, and actions of their own
  (listed under "Around you").

  | Location        | What is there                                                                                                                                                                                                                                                                                 |
  | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Beach (start)   | Wreckage (gone for good once everything is found, including a worn baseball hat), coconut palms (a coconut grows every 3 days, one falls every 6 days), the sea (comb the tideline — a few finds at a time, renewed every 8 hours — dive at the reef except in storms, drink seawater)        |
  | Forest          | Berry bushes, vines, mushrooms (one regrows every 3 days); gather grass (unlimited), gather sticks (30 lying around, 10 more every day; sometimes resin), chop wood (needs an axe; 2 h: 8–10 logs, 15–20 sticks, up to 3 vines, sometimes resin; what you cannot carry is left on the ground) |
  | Spring          | The pool: clean water, wash your face                                                                                                                                                                                                                                                         |
  | Rocks           | The rocky interior: gather stones (sometimes flint) and pebbles, both unlimited                                                                                                                                                                                                               |
  | Clearing / Camp | Building site: campfire, workbench, small storage, hut, small rain collector                                                                                                                                                                                                                  |

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

| Save format | Game version | Change                                                                                             |
| ----------- | ------------ | -------------------------------------------------------------------------------------------------- |
| 1           | 0.1.0        | First version.                                                                                     |
| 2           | 0.2.0        | Typed resources replace old items, conditions store healing time left, buildings, no back slot.    |
| 3           | 0.3.0        | Thirst and hunger count up, head and body slots (clothes), crafted recipes, palm stocks.           |
| 4           | 0.6.0        | Unfinished buildings are stored per location (buildings are built in steps).                       |
| 5           | 0.7.0        | Nutrition per food group (vegetables, meat, fruits).                                               |
| 6           | 0.8.0        | Weather, Very Hot / Very Cold exposure, equipment with health, clothes that wear out.              |
| 7           | 0.9.0        | Small rain collector with its water; building steps all take 15 minutes (more steps per building). |
| 8           | 0.11.0       | Skills; unfinished buildings record the materials they used.                                       |

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

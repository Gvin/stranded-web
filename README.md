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
  as time passes and drop when you drink or eat. Energy is spent by actions and restored by resting and sleeping (sleep is only
  possible below 50 energy). Health reaching 0 kills the player.
- **Overflow damage** — an action never needs enough energy: whatever energy you lack, and any thirst or hunger pushed past the
  maximum (also while time passes), is taken from health instead (rates in `overflowDamage` in `src/engine/rules.ts`).
- **Attributes** — Strength, Endurance, Perception, Agility. They start at 20 (max 100) and slowly improve with use.
  - Strength: max health, carry weight, fighting.
  - Endurance: max energy, thirst and hunger.
  - Perception: chance of finding things.
  - Agility: travel time, climbing, fighting.
- **Modifiers** — all bonuses and penalties to attributes are percentages. They add up and are shown per source in the Body tab.
- **Body parts** — head, torso, two arms, two legs. Conditions: Injured, Bleeding, Fractured, Burnt, Missing, Bandaged and Splinted
  (a set fracture). Bandaged replaces Injured, Burnt and Bleeding; Splinted replaces Fractured. A fractured, splinted or missing arm
  cannot hold items.
- **Healing** — injuries and burns heal with time; a bandage keeps the healing going at twice the speed. Fractures only heal once
  splinted. Bleeding, Poisoned and Dizzy have a severity (light, medium, heavy) that eases over time until they wear off; getting
  hurt again makes them worse.
- **Player conditions** — Poisoned and Dizzy as above; Starving and Thirsty (light/medium/heavy) follow the hunger and thirst bars;
  exhaustion makes you dizzy too.
- **Time** — every action shows its duration and energy cost. While time passes, stats change, wounds bleed or heal, and dropped items
  decay (food in hours, stone in weeks). Dropping an item takes no time. The interface follows the time of day: light by day, dark
  at night, with dusky colours at dawn and in the evening.
- **Action details** — hovering an action (long-pressing it on a touch screen) shows a popup with a detailed explanation, every
  requirement (met or not) and the possible gains with their current chances.
- **Items** — resources, food and equipment. Equipment is worn on the head or body (you start in your Clothes) or held in a hand:
  Knife, Hammer and Bow work as tools and weapons when held. Every resource has crafting **types** (e.g. Vine is `fuel, rope`, Flint is `stone, sharp, knife`).
- **Crafting** — recipes ask for types, so "any rope" accepts a vine or a rope; the cheapest matching items are used first. Some tools
  are needed but not used up. A recipe can also require a building or a location object nearby (`stations` in
  `src/data/recipes.ts`); Hammer and Bow need a Workbench. The Craft tab only shows what you can make right now; a toggle adds the
  recipes you have made before. A dot on the tab and a "New" badge mark recipes you can make but never have.
- **Buildings** — Campfire (lit with a bow, cooks food, burns any fuel item), Hut (restful sleep), Small storage (40 kg, items never
  rot) and Workbench. They can only be built at the Clearing, which then becomes your Camp.
- **Island** — Beach (start), Forest, Spring, Rocks and the Clearing. The Forest connects to all the others.
- **Objects** — each location has objects that provide actions. Hidden objects are not listed but still offer actions
  (shown under "Around you").

## Code layout

| Path                  | Contents                                                                               |
| --------------------- | -------------------------------------------------------------------------------------- |
| `src/engine/`         | Game rules: state types, attributes, conditions, time simulation, actions. No UI code. |
| `src/engine/rules.ts` | Balance constants and formulas in one place.                                           |
| `src/data/`           | Content: items, locations (objects, actions, routes), recipes, buildings, start state. |
| `src/save/`           | Versioned saving to `localStorage` and save migrations.                                |
| `src/ui/`             | React UI. Mobile shows a bottom tab bar; screens 900px and wider show two columns.     |

`performAction(state, actionId)` in `src/engine/game.ts` is the single entry point that changes the game: it never mutates its input
and returns the next state. The UI saves after every successful action.

## Saves and versioning

A save stores the state together with the game version that wrote it (`package.json` version) and the save format version
(`SAVE_VERSION` in `src/save/version.ts`). Each game version declares `MIN_SUPPORTED_SAVE_VERSION`, the oldest format it can still
load. Older saves are upgraded step by step through `MIGRATIONS` in `src/save/migrations.ts` (one file per step in `src/save/steps/`)
and re-saved in the current format; saves that are too old, from a newer game, or referring to unknown items are reported on the start
screen instead of being loaded.

| Save format | Game version | Change                                                                                          |
| ----------- | ------------ | ----------------------------------------------------------------------------------------------- |
| 1           | 0.1.0        | First version.                                                                                  |
| 2           | 0.2.0        | Typed resources replace old items, conditions store healing time left, buildings, no back slot. |
| 3           | 0.3.0        | Thirst and hunger count up, head and body slots (clothes), crafted recipes, palm stocks.        |

A migration is needed when you:

- change anything in `src/engine/types.ts` (the persisted state), or
- rename or remove an item, location or object id (saves refer to them by id).

Then:

1. Increment `SAVE_VERSION` (and the game version in `package.json`).
2. Add a step in `src/save/steps/` that converts the previous format, and register it in `MIGRATIONS[oldVersion]`. Keep the step
   self-contained (copy any old constants it needs) and never change it once released.
3. Add a test that loads a save of the previous format.
4. Raise `MIN_SUPPORTED_SAVE_VERSION` only when dropping support for old saves on purpose.

Adding new content or changing balance numbers needs no migration.

import { getCharacterSheet } from '../engine/character';
import { hasBodyCondition } from '../engine/conditions';
import type { LocationDef, ObjectDef, RouteDef } from '../engine/definitions';
import { checkGainChance } from '../engine/gains';
import { combatBonus } from '../engine/inventory';
import { ARMS, fall, type FindDef, findGains, fight, hasLimitedFindsLeft, injure, LEGS, LIMBS, rollFinds } from '../engine/outcomes';
import { holding, holdingThe } from '../engine/requirements';
import { fightPower, fightWinChance } from '../engine/rules';
import { days, hours } from '../engine/time';
import { BODY_PART_IDS, type GameState } from '../engine/types';

export const START_LOCATION_ID = 'beach';

const plentyText = (amount: number, max: number): string => {
  if (amount <= 0) {
    return 'none left';
  }
  if (amount >= max * 0.66) {
    return 'plenty';
  }
  return amount <= 2 ? 'only a few left' : 'some left';
};

const hasBrokenLimb = (state: GameState): boolean => BODY_PART_IDS.some((part) => hasBodyCondition(state.player, part, 'fractured'));

// --- Beach ------------------------------------------------------------------------------------

const WRECKAGE_FINDS: FindDef[] = [
  { itemId: 'cloth', chance: 0.45, quantity: [1, 2], limit: 8 },
  { itemId: 'log', chance: 0.2, limit: 4 },
  { itemId: 'rope', chance: 0.2, limit: 3 },
  { itemId: 'ship-biscuit', chance: 0.3, quantity: [1, 2], limit: 6 },
  { itemId: 'water-bottle', chance: 0.2, limit: 2 },
  { itemId: 'knife', chance: 0.12, limit: 1 },
];

const TIDELINE_FINDS: FindDef[] = [
  { itemId: 'stick', chance: 0.7, quantity: [1, 3] },
  { itemId: 'stone', chance: 0.5, quantity: [1, 2] },
  { itemId: 'cloth', chance: 0.1 },
  { itemId: 'raw-crab', chance: 0.1 },
];

const REEF_FINDS: FindDef[] = [
  { itemId: 'raw-mussels', chance: 0.5, quantity: [1, 3] },
  { itemId: 'raw-fish', chance: 0.3 },
  { itemId: 'rope', chance: 0.15, limit: 2 },
];

const wreckage: ObjectDef = {
  id: 'wreckage',
  name: 'Wreckage',
  description: 'Broken crates, tangled rigging and torn sailcloth from your ship, strewn along the tideline.',
  stock: { initial: 10, max: 10, regenMinutes: days(1) },
  stockText: (amount) => (amount <= 0 ? 'picked over' : amount >= 7 ? 'barely touched' : 'partly searched'),
  actions: [
    {
      id: 'search',
      label: 'Search the wreckage',
      description: 'Dig through the debris for anything useful. Perception helps.',
      details:
        'Every search uses up part of the wreckage, and the tide washes up a little more each day. ' +
        'The ship held only so much: once something is found often enough, it is gone for good.',
      gains: (state) => findGains(state, 'beach', 'wreckage', WRECKAGE_FINDS),
      minutes: 30,
      energy: 5,
      usesStock: true,
      block: (state) => (hasLimitedFindsLeft(state, 'beach', 'wreckage', WRECKAGE_FINDS) ? undefined : 'There is nothing useful left'),
      trains: { perception: 2 },
      run: (ctx) => {
        ctx.takeStock(1);
        ctx.log('You dig through splintered crates and sodden sailcloth.');
        if (!rollFinds(ctx, 'wreckage', WRECKAGE_FINDS)) {
          ctx.log('You find nothing useful this time.');
        }
      },
    },
  ],
};

const palms: ObjectDef = {
  id: 'palms',
  name: 'Coconut palms',
  description: 'Tall palms lean over the sand, heavy with green coconuts far above your head. A few have dropped into the sand.',
  stock: { initial: 6, max: 6, regenMinutes: hours(12) },
  stocks: { fallen: { initial: 2, max: 2, regenMinutes: days(1) } },
  stockText: plentyText,
  actions: [
    {
      id: 'climb',
      label: 'Climb for coconuts',
      description: 'Shimmy up a trunk. Agility helps; falling hurts.',
      details:
        'Agility decides whether you make it to the top. If you slip, you may fall: that means damage, ' +
        'an injured limb, sometimes bleeding or a fracture.',
      gains: (state) => [{ itemId: 'coconut', quantity: [1, 3], chance: checkGainChance(state, 'agility', 15) }],
      minutes: 30,
      energy: 10,
      usesStock: true,
      trains: { agility: 2, strength: 1 },
      run: (ctx) => {
        if (ctx.check('agility', 15)) {
          const taken = ctx.takeStock(ctx.randomInt(1, 3));
          ctx.log('You shimmy up the trunk and twist the coconuts free.');
          ctx.addItem('coconut', taken);
          return;
        }
        if (ctx.chance(0.4)) {
          ctx.log('Halfway up, your grip slips and you crash down onto the sand!', 'bad');
          fall(ctx, [5, 12], 'You fell from a palm tree and never got up.', 0.25);
        } else {
          ctx.log('The trunk is too smooth. You slide back down, empty-handed.');
        }
      },
    },
    {
      id: 'fallen',
      label: 'Look for fallen coconuts',
      description: 'Search the sand under the palms. Safe, but only a few fall each day.',
      details: 'Perception helps you spot intact coconuts among the empty husks.',
      gains: [{ itemId: 'coconut', chance: 0.6, perception: true }],
      minutes: 20,
      energy: 2,
      usesStock: 'fallen',
      trains: { perception: 1 },
      run: (ctx) => {
        if (ctx.chance(ctx.findChance(0.6))) {
          ctx.log('Half buried in the sand under the palms, you find an intact coconut.');
          ctx.addItem('coconut', ctx.takeStock(1, 'fallen'));
        } else {
          ctx.log('You find only cracked, empty husks.');
        }
      },
    },
  ],
};

const tideline: ObjectDef = {
  id: 'tideline',
  name: 'Tideline',
  description: 'Whatever the sea washes up.',
  hidden: true,
  actions: [
    {
      id: 'comb',
      label: 'Comb the tideline',
      description: 'Walk along the waterline looking for driftwood and stones.',
      details: 'The sea never stops washing things up, so there is always something to find. Perception helps.',
      gains: (state) => findGains(state, 'beach', 'tideline', TIDELINE_FINDS),
      minutes: 20,
      energy: 3,
      trains: { perception: 1 },
      run: (ctx) => {
        ctx.log('You walk the waterline, turning over seaweed and driftwood.');
        if (!rollFinds(ctx, 'tideline', TIDELINE_FINDS)) {
          ctx.log('The tide has left nothing but seaweed.');
        }
      },
    },
  ],
};

const sea: ObjectDef = {
  id: 'sea',
  name: 'Sea',
  description: 'The bay and the reef beyond it.',
  hidden: true,
  actions: [
    {
      id: 'drink',
      label: 'Drink seawater',
      description: 'Desperate times...',
      details: 'Salt water makes you thirstier, not less, and leaves you dizzy for a while.',
      minutes: 2,
      run: (ctx) => {
        ctx.changeStat('thirst', 8);
        ctx.addTimedCondition('dizzy', 'light');
        ctx.log('You gulp down the salty water. It burns your throat and only makes your thirst worse.', 'bad');
      },
    },
    {
      id: 'dive',
      label: 'Dive at the reef',
      description: 'Swim out to the reef for fish and shellfish. The water is deep and you are not alone in it.',
      details:
        'Agility decides whether the current lets you reach the reef. Rarely, a shark attacks: heavy damage, ' +
        'heavy bleeding, and it may take a limb. You cannot swim with a broken bone.',
      gains: (state) =>
        findGains(state, 'beach', 'reef', REEF_FINDS).map((g) =>
          'itemId' in g ? { ...g, chance: (g.chance ?? 1) * checkGainChance(state, 'agility', 20) } : g,
        ),
      minutes: 45,
      energy: 12,
      block: (state) => (hasBrokenLimb(state) ? 'You cannot swim with a broken limb' : undefined),
      trains: { endurance: 2, agility: 1 },
      run: (ctx) => {
        if (ctx.chance(0.04)) {
          ctx.log('A grey shape rises from the deep. A shark! It strikes before you can react.', 'bad');
          ctx.damage(ctx.randomInt(25, 40), 'You were killed by a shark.');
          injure(ctx, { parts: LIMBS, bleedingChance: 1, bleedingSeverity: 'heavy', lossChance: 0.35 });
          return;
        }
        if (!ctx.check('agility', 20)) {
          ctx.log('The current fights you all the way. You come back exhausted and empty-handed.');
          return;
        }
        ctx.log('You dive among the coral, holding your breath as long as you can.');
        if (!rollFinds(ctx, 'reef', REEF_FINDS)) {
          ctx.log('You see plenty of life down there, but catch none of it.');
        }
      },
    },
  ],
};

const beach: LocationDef = {
  id: 'beach',
  name: 'Beach',
  type: 'beach',
  description:
    'Pale sand curves around a turquoise bay. The wreck of your ship lies broken on the reef, and the tide keeps washing ' +
    'timber and torn cloth ashore. Tall palms lean over the sand, and behind them rises the dark wall of a forest.',
  objects: [wreckage, palms, tideline, sea],
};

// --- Forest -----------------------------------------------------------------------------------

const berryBushes: ObjectDef = {
  id: 'berry-bushes',
  name: 'Berry bushes',
  description: 'Thick bushes dotted with red berries — and some darker, purple ones.',
  stock: { initial: 8, max: 8, regenMinutes: hours(8) },
  stockText: plentyText,
  actions: [
    {
      id: 'pick',
      label: 'Pick berries',
      description: 'A sharp eye helps to tell the good berries from the bad.',
      details:
        'About a third of what you pick may be bitter, poisonous berries; with good perception you leave those on the bush. ' +
        'Snakes sometimes hide in the leaves.',
      gains: (state) => [
        { itemId: 'wild-berries', quantity: [1, 4] },
        { itemId: 'bitter-berries', quantity: [1, 4], chance: 1 - checkGainChance(state, 'perception', 25) },
      ],
      minutes: 20,
      energy: 2,
      usesStock: true,
      trains: { perception: 1 },
      run: (ctx) => {
        if (ctx.chance(0.03)) {
          ctx.log('A snake strikes from the leaves and sinks its fangs into your arm!', 'bad');
          ctx.addTimedCondition('poisoned', 'heavy');
          injure(ctx, { parts: ARMS });
          return;
        }
        const picked = ctx.takeStock(ctx.randomInt(2, 4));
        const bitter = Array.from({ length: picked }).filter(() => ctx.chance(0.3)).length;
        ctx.log('You pick berries from the bushes.');
        if (bitter > 0 && ctx.check('perception', 25)) {
          ctx.log('You notice some of them smell bitter and leave those on the bush.');
          ctx.addItem('wild-berries', picked - bitter);
          return;
        }
        ctx.addItem('wild-berries', picked - bitter);
        ctx.addItem('bitter-berries', bitter);
      },
    },
  ],
};

const vines: ObjectDef = {
  id: 'vines',
  name: 'Hanging vines',
  description: 'Long, tough vines hang from the canopy like ropes.',
  actions: [
    {
      id: 'cut',
      label: 'Cut vines',
      description: 'Quick work with a knife.',
      gains: [{ itemId: 'vine', quantity: [2, 3] }],
      minutes: 15,
      energy: 3,
      requires: [holding('knife')],
      trains: { strength: 1 },
      run: (ctx) => {
        ctx.log('You saw through a few lengths of vine.');
        ctx.addItem('vine', ctx.randomInt(2, 3));
      },
    },
    {
      id: 'tear',
      label: 'Tear down vines',
      description: 'Without a blade, it takes brute strength.',
      details: 'Strength decides whether a vine gives way.',
      gains: (state) => [{ itemId: 'vine', chance: checkGainChance(state, 'strength', 15) }],
      minutes: 30,
      energy: 6,
      trains: { strength: 2 },
      run: (ctx) => {
        if (ctx.check('strength', 15)) {
          ctx.log('You twist and pull until a length of vine snaps free.');
          ctx.addItem('vine');
        } else {
          ctx.log('You strain until your hands are raw, but the vines hold.');
        }
      },
    },
  ],
};

const BOAR = { name: 'boar', difficulty: 35, damage: [10, 25] as const, deathCause: 'You were gored to death by a wild boar.' };

const boars: ObjectDef = {
  id: 'boars',
  name: 'Boar tracks',
  description: 'Churned earth and hoofprints. Wild boars root around here — big, bad-tempered ones.',
  stock: { initial: 2, max: 2, regenMinutes: days(2) },
  stockText: (amount) => (amount > 0 ? 'fresh tracks' : 'only old tracks'),
  actions: [
    {
      id: 'hunt',
      label: 'Hunt wild boar',
      description: 'Track down a boar and fight it. Strength, agility and a good weapon matter.',
      details:
        'The fight is decided by your strength, agility and the best weapon in your hands (a bow is best). ' +
        'Losing means heavy damage and an injury that may bleed or break a bone.',
      gains: (state) => {
        const sheet = getCharacterSheet(state);
        const power = fightPower(sheet.attributes.strength.effective, sheet.attributes.agility.effective, combatBonus(state.player));
        return [{ itemId: 'raw-meat', quantity: [2, 3], chance: fightWinChance(power, BOAR.difficulty) }];
      },
      minutes: 60,
      energy: 15,
      usesStock: true,
      trains: { strength: 3, agility: 2 },
      run: (ctx) => {
        ctx.log('You follow the tracks until a boar bursts out of the undergrowth, tusks lowered.');
        if (fight(ctx, BOAR)) {
          ctx.takeStock(1);
          ctx.log('After a desperate struggle, the boar lies still.', 'good');
          ctx.addItem('raw-meat', ctx.randomInt(2, 3));
        } else {
          ctx.log('The boar crashes away into the forest.');
        }
      },
    },
  ],
};

const mushrooms: ObjectDef = {
  id: 'mushrooms',
  name: 'Mushroom patch',
  description: 'Pale mushrooms sprout from a rotting log.',
  stock: { initial: 5, max: 5, regenMinutes: days(1) },
  stockText: plentyText,
  actions: [
    {
      id: 'pick',
      label: 'Pick mushrooms',
      description: 'Easy to gather. Eating them is another matter.',
      gains: [{ itemId: 'mushroom', quantity: [1, 3] }],
      minutes: 15,
      energy: 2,
      usesStock: true,
      run: (ctx) => {
        ctx.log('You gather a few of the mushrooms.');
        ctx.addItem('mushroom', ctx.takeStock(ctx.randomInt(1, 3)));
      },
    },
  ],
};

const fallenTrees: ObjectDef = {
  id: 'fallen-trees',
  name: 'Fallen trees',
  description: 'Storm-felled trunks lie among the living ones, their wood dry and heavy.',
  actions: [
    {
      id: 'log',
      label: 'Break off a log',
      description: 'Wrench a length of dry wood free. Hard work.',
      details: 'Logs weigh 3 kg each — mind your carrying capacity.',
      gains: [{ itemId: 'log' }],
      minutes: 40,
      energy: 10,
      trains: { strength: 3 },
      run: (ctx) => {
        ctx.log('You lever and kick a dry length of trunk until it breaks free.');
        ctx.addItem('log');
      },
    },
  ],
};

const undergrowth: ObjectDef = {
  id: 'undergrowth',
  name: 'Undergrowth',
  description: 'Fallen branches and dead wood on the forest floor.',
  hidden: true,
  actions: [
    {
      id: 'sticks',
      label: 'Gather sticks',
      description: 'Pick straight sticks off the forest floor.',
      gains: [{ itemId: 'stick', quantity: [2, 4] }],
      minutes: 15,
      energy: 2,
      run: (ctx) => {
        ctx.log('You pick straight sticks out of the undergrowth.');
        ctx.addItem('stick', ctx.randomInt(2, 4));
      },
    },
  ],
};

const forest: LocationDef = {
  id: 'forest',
  name: 'Forest',
  type: 'forest',
  description:
    'Beyond the beach the palms give way to a dense, humid forest. Vines hang from the canopy and narrow animal trails ' +
    'wind between the trunks in every direction. Something large has been rooting in the undergrowth.',
  objects: [berryBushes, vines, boars, mushrooms, fallenTrees, undergrowth],
  onArrive: (ctx) => {
    if (ctx.chance(0.1) && !ctx.check('agility', 10)) {
      ctx.log('You catch your foot on a root and go down hard.', 'bad');
      ctx.damage(3, 'You fell in the forest and never got up.');
      injure(ctx, { parts: LEGS, bleedingChance: 0.3, bleedingSeverity: 'light' });
    }
  },
};

// --- Spring -----------------------------------------------------------------------------------

const BOULDER_FINDS: FindDef[] = [
  { itemId: 'stone', chance: 0.9, quantity: [1, 2], fixedChance: true },
  { itemId: 'flint', chance: 0.35 },
];

const springPool: ObjectDef = {
  id: 'pool',
  name: 'Spring pool',
  description: 'Cold, clean water gathers in a basin of mossy stone. The best thing you have seen since the wreck.',
  actions: [
    {
      id: 'drink',
      label: 'Drink from the spring',
      description: 'Clean, safe water.',
      gains: [{ text: '−60 thirst' }],
      minutes: 5,
      block: (state) => (state.player.stats.thirst <= 0 ? 'You are not thirsty' : undefined),
      run: (ctx) => {
        const change = ctx.changeStat('thirst', -60);
        ctx.log(`You drink deeply from the cold spring.${change < 0 ? ` (−${Math.round(-change)} thirst)` : ''}`, 'good');
      },
    },
  ],
};

const boulders: ObjectDef = {
  id: 'boulders',
  name: 'Mossy boulders',
  description: 'Smooth stones lie around the spring, and sharp flakes of flint glint among the moss.',
  actions: [
    {
      id: 'collect',
      label: 'Collect stones',
      description: 'A sharp eye might spot some flint.',
      gains: (state) => findGains(state, 'spring', 'boulders', BOULDER_FINDS),
      minutes: 15,
      energy: 3,
      trains: { strength: 1, perception: 1 },
      run: (ctx) => {
        ctx.log('You pick through the stones around the spring.');
        rollFinds(ctx, 'boulders', BOULDER_FINDS);
      },
    },
  ],
};

const animalTrail: ObjectDef = {
  id: 'animal-trail',
  name: 'Animal trail',
  description: 'Small animals come here to drink.',
  hidden: true,
  stock: { initial: 2, max: 2, regenMinutes: days(1) },
  actions: [
    {
      id: 'ambush',
      label: 'Ambush animals at the water',
      description: 'Wait motionless by the trail with an arrow on the string.',
      details: 'Perception lets you notice an animal in time; agility decides whether your shot hits.',
      gains: (state) => [{ itemId: 'raw-meat', chance: checkGainChance(state, 'perception', 25) * checkGainChance(state, 'agility', 15) }],
      minutes: 60,
      energy: 5,
      usesStock: true,
      requires: [holdingThe('bow')],
      trains: { perception: 2, agility: 1 },
      run: (ctx) => {
        if (ctx.check('perception', 25) && ctx.check('agility', 15)) {
          ctx.takeStock(1);
          ctx.log('A small deer-like animal creeps up to drink. Your shot finds its mark.', 'good');
          ctx.addItem('raw-meat');
        } else {
          ctx.log('Something rustles in the ferns and bolts before you can strike.');
        }
      },
    },
  ],
};

const spring: LocationDef = {
  id: 'spring',
  name: 'Spring',
  type: 'spring',
  description:
    'Cold, clear water bubbles up between mossy boulders and gathers in a small pool before trickling away into the ferns. ' +
    'The air here is cool and smells of wet stone.',
  objects: [springPool, boulders, animalTrail],
};

// --- Rocks ------------------------------------------------------------------------------------

const LOOSE_ROCK_FINDS: FindDef[] = [
  { itemId: 'stone', chance: 1, quantity: [1, 3], fixedChance: true },
  { itemId: 'flint', chance: 0.4 },
];

const tidePools: ObjectDef = {
  id: 'tide-pools',
  name: 'Tide pools',
  description: 'Shallow pools between the rocks, full of scuttling crabs.',
  stock: { initial: 6, max: 6, regenMinutes: hours(6) },
  stockText: plentyText,
  actions: [
    {
      id: 'crabs',
      label: 'Catch crabs',
      description: 'Quick hands needed.',
      details: 'Agility decides whether you catch them. A crab might pinch you.',
      gains: (state) => [{ itemId: 'raw-crab', quantity: [1, 2], chance: checkGainChance(state, 'agility', 20) }],
      minutes: 30,
      energy: 5,
      usesStock: true,
      trains: { agility: 2 },
      run: (ctx) => {
        if (ctx.check('agility', 20)) {
          ctx.log('You pin down a couple of crabs before they can scuttle away.');
          ctx.addItem('raw-crab', ctx.takeStock(ctx.randomInt(1, 2)));
        } else if (ctx.chance(0.3)) {
          ctx.damage(2, 'A crab got the better of you.');
          ctx.log('A crab clamps onto your finger. You shake it off, cursing.', 'bad');
        } else {
          ctx.log('The crabs vanish into the cracks faster than you can grab them.');
        }
      },
    },
  ],
};

const musselBeds: ObjectDef = {
  id: 'mussel-beds',
  name: 'Mussel beds',
  description: 'Black mussels cling to the rocks at the waterline.',
  stock: { initial: 8, max: 8, regenMinutes: hours(8) },
  stockText: plentyText,
  actions: [
    {
      id: 'pry',
      label: 'Pry off mussels',
      description: 'Easy pickings, but eating them raw is a gamble.',
      gains: [{ itemId: 'raw-mussels', quantity: [2, 3] }],
      minutes: 20,
      energy: 3,
      usesStock: true,
      trains: { strength: 1 },
      run: (ctx) => {
        ctx.log('You pry mussels off the wet rocks.');
        ctx.addItem('raw-mussels', ctx.takeStock(ctx.randomInt(2, 3)));
      },
    },
  ],
};

const looseRocks: ObjectDef = {
  id: 'loose-rocks',
  name: 'Loose rocks',
  description: 'Fist-sized stones and veins of flint in the black rock.',
  actions: [
    {
      id: 'gather',
      label: 'Gather stones',
      description: 'A sharp eye might spot some flint.',
      gains: (state) => findGains(state, 'rocks', 'loose-rocks', LOOSE_ROCK_FINDS),
      minutes: 15,
      energy: 4,
      trains: { strength: 2 },
      run: (ctx) => {
        ctx.log('You pick through the loose rocks.');
        rollFinds(ctx, 'loose-rocks', LOOSE_ROCK_FINDS);
      },
    },
  ],
};

const ledges: ObjectDef = {
  id: 'ledges',
  name: 'Seabird ledges',
  description: 'Seabirds nest on narrow ledges high above the surf.',
  stock: { initial: 6, max: 6, regenMinutes: days(1) },
  stockText: plentyText,
  actions: [
    {
      id: 'climb',
      label: 'Climb for eggs',
      description: 'A dangerous climb over wet rock. Agility helps; falling hurts a lot.',
      details: 'Agility decides whether you reach the nests. A fall onto the rocks deals heavy damage and often breaks a bone.',
      gains: (state) => [{ itemId: 'bird-egg', quantity: [1, 3], chance: checkGainChance(state, 'agility', 25) }],
      minutes: 40,
      energy: 12,
      usesStock: true,
      trains: { agility: 2, strength: 1 },
      run: (ctx) => {
        if (ctx.check('agility', 25)) {
          ctx.log('You inch along the ledges, fending off furious birds, and raid their nests.');
          ctx.addItem('bird-egg', ctx.takeStock(ctx.randomInt(1, 3)));
          return;
        }
        if (ctx.chance(0.5)) {
          ctx.log('A screaming bird dives at your face. You lose your footing and fall onto the rocks below!', 'bad');
          fall(ctx, [8, 18], 'You fell from the rocks.', 0.4);
        } else {
          ctx.log('The rock is too slick. You climb back down empty-handed.');
        }
      },
    },
  ],
};

const shallows: ObjectDef = {
  id: 'shallows',
  name: 'Shallows',
  description: 'Clear water where fish dart between the rocks.',
  hidden: true,
  actions: [
    {
      id: 'fish',
      label: 'Shoot fish',
      description: 'Stand still on a rock and shoot at the fish below.',
      details: 'Agility decides whether you hit. Sometimes you get two.',
      gains: (state) => [{ itemId: 'raw-fish', quantity: [1, 2], chance: checkGainChance(state, 'agility', 30) }],
      minutes: 45,
      energy: 8,
      requires: [holdingThe('bow')],
      trains: { agility: 2, perception: 1 },
      run: (ctx) => {
        if (ctx.check('agility', 30)) {
          ctx.log('A flash of silver — your arrow pins a wriggling fish.', 'good');
          ctx.addItem('raw-fish', ctx.chance(0.2) ? 2 : 1);
        } else {
          ctx.log('The fish dart away every time you shoot.');
        }
      },
    },
  ],
};

const rocks: LocationDef = {
  id: 'rocks',
  name: 'Rocks',
  type: 'rocks',
  description:
    'A jumble of black volcanic rocks juts into the surf at the end of a forest trail. Waves boom against the boulders, ' +
    'tide pools glitter between them, and seabirds wheel above their nests on the ledges.',
  objects: [tidePools, musselBeds, looseRocks, ledges, shallows],
};

// --- Clearing / Camp --------------------------------------------------------------------------

const tallGrass: ObjectDef = {
  id: 'tall-grass',
  name: 'Tall dry grass',
  description: 'Brittle, sun-bleached grass that would catch a spark easily.',
  actions: [
    {
      id: 'gather',
      label: 'Gather dry grass',
      description: 'Tinder, and fibre for cord.',
      gains: [{ itemId: 'grass', quantity: [2, 3] }],
      minutes: 10,
      energy: 1,
      run: (ctx) => {
        ctx.log('You pull up a few bundles of dry grass.');
        ctx.addItem('grass', ctx.randomInt(2, 3));
      },
    },
  ],
};

const fallenLogs: ObjectDef = {
  id: 'fallen-logs',
  name: 'Fallen logs',
  description: 'Old dead trees lie across the clearing, dry and brittle.',
  actions: [
    {
      id: 'branches',
      label: 'Break off dry branches',
      description: 'Snap sticks off the dead trunks.',
      gains: [{ itemId: 'stick', quantity: [2, 4] }],
      minutes: 20,
      energy: 4,
      trains: { strength: 1 },
      run: (ctx) => {
        ctx.log('You snap dry branches off the fallen trunks.');
        ctx.addItem('stick', ctx.randomInt(2, 4));
      },
    },
    {
      id: 'log',
      label: 'Drag over a log',
      description: 'Break a dry log off a fallen trunk.',
      details: 'Logs weigh 3 kg each — mind your carrying capacity.',
      gains: [{ itemId: 'log' }],
      minutes: 30,
      energy: 8,
      trains: { strength: 2 },
      run: (ctx) => {
        ctx.log('You break a dry log off one of the trunks and drag it over.');
        ctx.addItem('log');
      },
    },
  ],
};

const camp: LocationDef = {
  id: 'camp',
  name: 'Clearing',
  type: 'clearing',
  description:
    'A sunny clearing opens up in the forest, sheltered from the sea wind. The ground is flat and dry, with fallen logs ' +
    'and tall dry grass. It would make a good place to set up camp.',
  whenBuilt: {
    name: 'Camp',
    type: 'camp',
    description:
      'Your camp in the forest clearing. Flat, dry ground sheltered from the sea wind, fallen logs and tall dry grass — ' +
      'the closest thing to home on this island.',
  },
  buildable: true,
  objects: [tallGrass, fallenLogs],
};

// --- Map --------------------------------------------------------------------------------------

export const LOCATIONS: readonly LocationDef[] = [beach, forest, spring, rocks, camp];

export const ROUTES: readonly RouteDef[] = [
  { between: ['beach', 'forest'], minutes: 20, energy: 4 },
  { between: ['forest', 'spring'], minutes: 25, energy: 5 },
  { between: ['forest', 'rocks'], minutes: 30, energy: 6 },
  { between: ['forest', 'camp'], minutes: 15, energy: 3 },
];

const LOCATION_MAP: Readonly<Record<string, LocationDef>> = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));

export function getLocationDef(locationId: string): LocationDef {
  const def = LOCATION_MAP[locationId];
  if (!def) {
    throw new Error(`Unknown location: ${locationId}`);
  }
  return def;
}

export interface Connection {
  to: string;
  minutes: number;
  energy: number;
}

/** Routes leaving a location that the player currently knows about. */
export function getRoutesFrom(locationId: string, state: GameState): Connection[] {
  return ROUTES.filter((route) => route.between.includes(locationId))
    .filter((route) => !route.requiresFlag || state.flags[route.requiresFlag])
    .map((route) => ({
      to: route.between[0] === locationId ? route.between[1] : route.between[0],
      minutes: route.minutes,
      energy: route.energy,
    }));
}

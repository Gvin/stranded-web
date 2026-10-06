import type { LocationDef, ObjectDef } from '../../engine/definitions';
import { isStormy } from '../../engine/environment';
import { checkGainChance } from '../../engine/gains';
import { type FindDef, findGains, hasLimitedFindsLeft, rollFinds } from '../../engine/outcomes';
import { unbrokenLimbs } from '../../engine/requirements';
import { days, hours } from '../../engine/time';
import { hasBrokenLimb, plentyText } from './shared';

const WRECKAGE_FINDS: FindDef[] = [
  { itemId: 'cloth', chance: 0.45, quantity: [1, 2], limit: 8 },
  { itemId: 'log', chance: 0.2, limit: 4 },
  { itemId: 'rope', chance: 0.2, limit: 3 },
  { itemId: 'ship-biscuit', chance: 0.3, quantity: [1, 2], limit: 6 },
  { itemId: 'water-bottle', chance: 0.2, limit: 2 },
  { itemId: 'knife', chance: 0.12, limit: 1 },
  { itemId: 'baseball-hat', chance: 0.15, limit: 1, health: 30 },
];

const TIDELINE_FINDS: FindDef[] = [
  { itemId: 'seaweed', chance: 0.6, quantity: [1, 2] },
  { itemId: 'stick', chance: 0.5, quantity: [1, 2] },
  { itemId: 'pebble', chance: 0.4, quantity: [1, 2] },
  { itemId: 'feather', chance: 0.25 },
  { itemId: 'raw-crab', chance: 0.1 },
  { itemId: 'cloth', chance: 0.08 },
  { itemId: 'empty-bottle', chance: 0.05 },
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
  // why: the ship held only so much; once everything useful is found, the wreckage is gone for good.
  visibleIf: (state) => hasLimitedFindsLeft(state, 'beach', 'wreckage', WRECKAGE_FINDS),
  actions: [
    {
      id: 'search',
      label: 'Search the wreckage',
      description: 'Dig through the debris for anything useful. Perception helps.',
      details:
        'The ship held only so much, and nothing new washes in. Once everything useful has been found, ' + 'the wreckage is gone for good.',
      gains: (state) => findGains(state, 'beach', 'wreckage', WRECKAGE_FINDS),
      minutes: 30,
      energy: 5,
      trains: { perception: 2 },
      skill: 'foraging',
      run: (ctx) => {
        ctx.log('You dig through splintered crates and sodden sailcloth.');
        if (!rollFinds(ctx, 'wreckage', WRECKAGE_FINDS)) {
          ctx.log('You find nothing useful this time.');
        }
        if (!hasLimitedFindsLeft(ctx.state, 'beach', 'wreckage', WRECKAGE_FINDS)) {
          ctx.log('You have taken everything worth taking. The rest is splintered junk, and the tide carries it away.', 'info');
        }
      },
    },
  ],
};

const palms: ObjectDef = {
  id: 'palms',
  name: 'Coconut palms',
  description: 'Tall palms lean over the sand, heavy with green coconuts far above your head. A few have dropped into the sand.',
  stock: { initial: 6, max: 6, regenMinutes: days(3) },
  stocks: { fallen: { initial: 2, max: 2, regenMinutes: days(6) } },
  stockText: plentyText,
  actions: [
    {
      id: 'climb',
      label: 'Climb for coconuts',
      description: 'Shimmy up a trunk. Agility helps.',
      details: 'Agility decides whether you make it to the top.',
      gains: (state) => [{ itemId: 'coconut', quantity: [1, 3], chance: checkGainChance(state, 'agility', 15) }],
      minutes: 30,
      energy: 10,
      usesStock: true,
      requires: [unbrokenLimbs()],
      trains: { agility: 2, strength: 1 },
      skill: 'foraging',
      run: (ctx) => {
        if (ctx.check('agility', 15)) {
          const taken = ctx.takeStock(ctx.gathered(ctx.randomInt(1, 3)));
          ctx.log('You shimmy up the trunk and twist the coconuts free.');
          ctx.addItem('coconut', taken);
          return;
        }
        ctx.log('The trunk is too smooth. You slide back down, empty-handed.');
      },
    },
    {
      id: 'fallen',
      label: 'Look for fallen coconuts',
      description: 'Search the sand under the palms. Safe, but only a few fall each day.',
      details: 'Perception helps you spot intact coconuts among the empty husks.',
      gains: [{ itemId: 'coconut', chance: 0.6, perception: true, find: true }],
      minutes: 20,
      energy: 2,
      usesStock: 'fallen',
      trains: { perception: 1 },
      skill: 'foraging',
      run: (ctx) => {
        if (ctx.chance(ctx.findChance(0.6))) {
          ctx.log('Half buried in the sand under the palms, you find an intact coconut.');
          ctx.addItem('coconut', ctx.takeStock(ctx.gathered(1), 'fallen'));
        } else {
          ctx.log('You find only cracked, empty husks.');
        }
      },
    },
  ],
};

const sea: ObjectDef = {
  id: 'sea',
  name: 'Sea',
  description: 'The bay, the tideline and the reef beyond it.',
  hidden: true,
  stocks: { tideline: { initial: 6, max: 6, regenMinutes: hours(8) } },
  actions: [
    {
      id: 'comb',
      label: 'Comb the tideline',
      description: 'Walk along the waterline looking for whatever the sea has washed up.',
      details: 'There is only so much on the tideline at a time; the tide brings a little more every few hours. Perception helps.',
      gains: (state) => findGains(state, 'beach', 'tideline', TIDELINE_FINDS),
      minutes: 20,
      energy: 3,
      usesStock: 'tideline',
      trains: { perception: 1 },
      skill: 'foraging',
      run: (ctx) => {
        ctx.takeStock(1, 'tideline');
        ctx.log('You walk the waterline, turning over seaweed and driftwood.');
        if (!rollFinds(ctx, 'tideline', TIDELINE_FINDS)) {
          ctx.log('The tide has left nothing useful this time.');
        }
      },
    },
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
      description: 'Swim out to the reef for fish and shellfish.',
      details: 'Agility decides whether the current lets you reach the reef. You cannot swim with a broken bone.',
      gains: (state) =>
        findGains(state, 'beach', 'reef', REEF_FINDS).map((g) =>
          'itemId' in g ? { ...g, chance: (g.chance ?? 1) * checkGainChance(state, 'agility', 20) } : g,
        ),
      minutes: 45,
      energy: 12,
      block: (state) =>
        isStormy(state)
          ? 'The sea is too rough to dive in a storm'
          : hasBrokenLimb(state)
            ? 'You cannot swim with a broken limb'
            : undefined,
      trains: { endurance: 2, agility: 1 },
      skill: 'foraging',
      run: (ctx) => {
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

export const beach: LocationDef = {
  id: 'beach',
  name: 'Beach',
  type: 'beach',
  description:
    'Pale sand curves around a turquoise bay. The wreck of your ship lies broken on the reef, and the tide keeps washing ' +
    'timber and torn cloth ashore. Tall palms lean over the sand, and behind them rises the dark wall of a forest.',
  objects: [wreckage, palms, sea],
};

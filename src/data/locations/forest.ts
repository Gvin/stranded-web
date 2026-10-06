import type { LocationDef, ObjectDef } from '../../engine/definitions';
import { checkGainChance } from '../../engine/gains';
import { carried, holding } from '../../engine/requirements';
import { days, hours } from '../../engine/time';
import { plentyText } from './shared';

/** Chance of a piece of resin while gathering sticks, and while chopping wood. */
const RESIN_WITH_STICKS = 0.05;
const RESIN_WHEN_CHOPPING = 0.3;

/** What one felled tree gives, from-to. */
const CHOPPED_LOGS = [8, 10] as const;
const CHOPPED_STICKS = [15, 20] as const;
const CHOPPED_VINES = [0, 3] as const;

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
      details: 'About a third of what you pick may be bitter, poisonous berries; with good perception you leave those on the bush.',
      gains: (state) => [
        { itemId: 'wild-berries', quantity: [1, 4] },
        { itemId: 'bitter-berries', quantity: [1, 4], chance: 1 - checkGainChance(state, 'perception', 25) },
      ],
      minutes: 20,
      energy: 2,
      usesStock: true,
      trains: { perception: 1 },
      skill: 'foraging',
      run: (ctx) => {
        const picked = ctx.takeStock(ctx.gathered(ctx.randomInt(2, 4)));
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
      skill: 'foraging',
      run: (ctx) => {
        ctx.log('You saw through a few lengths of vine.');
        ctx.addItem('vine', ctx.gathered(ctx.randomInt(2, 3)));
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
      skill: 'foraging',
      run: (ctx) => {
        if (ctx.check('strength', 15)) {
          ctx.log('You twist and pull until a length of vine snaps free.');
          ctx.addItem('vine', ctx.gathered(1));
        } else {
          ctx.log('You strain until your hands are raw, but the vines hold.');
        }
      },
    },
  ],
};

const mushrooms: ObjectDef = {
  id: 'mushrooms',
  name: 'Mushroom patch',
  description: 'Pale mushrooms sprout from a rotting log.',
  stock: { initial: 5, max: 5, regenMinutes: days(3) },
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
      skill: 'foraging',
      run: (ctx) => {
        ctx.log('You gather a few of the mushrooms.');
        ctx.addItem('mushroom', ctx.takeStock(ctx.gathered(ctx.randomInt(1, 3))));
      },
    },
  ],
};

export const forest: LocationDef = {
  id: 'forest',
  name: 'Forest',
  type: 'forest',
  description:
    'Beyond the beach the palms give way to a dense, humid forest. Vines hang from the canopy and narrow animal trails ' +
    'wind between the trunks in every direction. Something large has been rooting in the undergrowth.',
  objects: [berryBushes, vines, mushrooms],
  // why: 30 sticks lie around and 10 more drop every day, enough for building, crafting and keeping a fire going.
  stocks: { sticks: { initial: 30, max: 30, regenMinutes: days(1) / 10 } },
  actions: [
    {
      id: 'grass',
      label: 'Gather grass',
      description: 'Pull up dry grass along the forest edge. There is always more.',
      gains: [{ itemId: 'grass', quantity: [2, 3] }],
      minutes: 10,
      energy: 1,
      skill: 'foraging',
      run: (ctx) => {
        ctx.log('You pull up a few bundles of dry grass.');
        ctx.addItem('grass', ctx.gathered(ctx.randomInt(2, 3)));
      },
    },
    {
      id: 'sticks',
      label: 'Gather sticks',
      description: 'Pick straight sticks off the forest floor.',
      details: 'Only so many sticks lie around; a new one drops from the trees every few hours.',
      gains: [
        { itemId: 'stick', quantity: [2, 3] },
        { itemId: 'resin', chance: RESIN_WITH_STICKS, find: true },
      ],
      minutes: 15,
      energy: 2,
      usesStock: 'sticks',
      skill: 'foraging',
      run: (ctx) => {
        ctx.log('You pick straight sticks off the forest floor.');
        ctx.addItem('stick', ctx.takeStock(ctx.gathered(ctx.randomInt(2, 3)), 'sticks'));
        if (ctx.chance(ctx.findChance(RESIN_WITH_STICKS, { perception: false }))) {
          ctx.addItem('resin');
        }
      },
    },
    {
      id: 'chop',
      label: 'Chop wood',
      description: 'Fell a tree, cut it into logs and strip its branches. Slow, exhausting work.',
      details: 'Needs an axe in your bag or in hand. Logs weigh 3 kg each — what you cannot carry is left on the ground.',
      gains: [
        { itemId: 'log', quantity: CHOPPED_LOGS },
        { itemId: 'stick', quantity: CHOPPED_STICKS },
        { itemId: 'vine', quantity: CHOPPED_VINES },
        { itemId: 'resin', chance: RESIN_WHEN_CHOPPING, find: true },
      ],
      minutes: 120,
      energy: 25,
      requires: [carried('axe')],
      trains: { strength: 3, endurance: 2 },
      skill: 'foraging',
      run: (ctx) => {
        ctx.log('You hack at a tree until it falls, then chop the trunk into logs and strip the branches.');
        const items = (
          [
            ['log', CHOPPED_LOGS],
            ['stick', CHOPPED_STICKS],
            ['vine', CHOPPED_VINES],
          ] as const
        ).map(([itemId, [min, max]]) => ({ itemId, quantity: ctx.gathered(ctx.randomInt(min, max)) }));
        const resin = ctx.chance(ctx.findChance(RESIN_WHEN_CHOPPING, { perception: false })) ? 1 : 0;
        ctx.addItems([...items, { itemId: 'resin', quantity: resin }]);
      },
    },
  ],
};

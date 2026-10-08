import type { LocationDef, ObjectDef } from '../../engine/definitions';
import { startHunt } from '../../engine/fight';
import { perceptionGainChance, successGainChance } from '../../engine/gains';
import { perceptionChance } from '../../engine/rules';
import { type FindDef, findGains, rollFinds } from '../../engine/outcomes';
import { carried, holding } from '../../engine/requirements';
import { days, hours } from '../../engine/time';
import { plentyText, SHELTER_BUILDINGS } from './shared';

/** Chance of a piece of resin while gathering sticks, and while chopping wood. */
const RESIN_WITH_STICKS = 0.05;
const RESIN_WHEN_CHOPPING = 0.3;

/** What one felled tree gives, from-to. */
const CHOPPED_LOGS = [8, 10] as const;
const CHOPPED_STICKS = [15, 20] as const;
const CHOPPED_VINES = [0, 3] as const;
const CHOPPED_LEAVES = [20, 30] as const;

/** Chance that a picked berry is a bitter one. */
const BITTER_BERRY_CHANCE = 0.1;

/** Chance to find a fresh trail when tracking animals at 20 Perception; Perception multiplies it up to 3 times at 100 (90%). */
const TRACKING_CHANCE = 0.3;
const TRACKING_PERCEPTION_AT_MAX = 3;

/** Found together with sticks, and moss also while picking berries. */
const LEAVES: FindDef = { itemId: 'leaves', chance: 0.3, quantity: [2, 4] };
const MOSS: FindDef = { itemId: 'moss', chance: 0.2, quantity: [1, 2] };

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
      description: 'Red berries, and now and then a bitter purple one.',
      details: `Every berry you pick has a ${BITTER_BERRY_CHANCE * 100}% chance to be a bitter one.`,
      gains: (state) => [
        { itemId: 'wild-berries', quantity: [1, 4] },
        { itemId: 'bitter-berries', chance: BITTER_BERRY_CHANCE },
        ...findGains(state, 'forest', 'berry-bushes', [MOSS]),
      ],
      minutes: 20,
      energy: 2,
      usesStock: true,
      trains: { perception: 1 },
      skill: 'foraging',
      run: (ctx) => {
        const picked = ctx.takeStock(ctx.gathered(ctx.randomInt(2, 4)));
        const bitter = Array.from({ length: picked }).filter(() => ctx.chance(BITTER_BERRY_CHANCE)).length;
        ctx.log('You pick berries from the bushes.');
        ctx.addItem('wild-berries', picked - bitter);
        ctx.addItem('bitter-berries', bitter);
        rollFinds(ctx, 'berry-bushes', [MOSS]);
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
      gains: (state) => [{ itemId: 'vine', chance: successGainChance(state, 'strength') }],
      minutes: 30,
      energy: 6,
      trains: { strength: 2 },
      skill: 'foraging',
      run: (ctx) => {
        if (ctx.succeeds('strength')) {
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
  buildings: SHELTER_BUILDINGS,
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
      gains: (state) => [
        { itemId: 'stick', quantity: [2, 3] },
        { itemId: 'resin', chance: RESIN_WITH_STICKS, perception: true, find: true },
        ...findGains(state, 'forest', 'location', [LEAVES, MOSS]),
      ],
      minutes: 15,
      energy: 2,
      usesStock: 'sticks',
      skill: 'foraging',
      run: (ctx) => {
        ctx.log('You pick straight sticks off the forest floor.');
        ctx.addItem('stick', ctx.takeStock(ctx.gathered(ctx.randomInt(2, 3)), 'sticks'));
        if (ctx.chance(ctx.findChance(RESIN_WITH_STICKS))) {
          ctx.addItem('resin');
        }
        rollFinds(ctx, 'location', [LEAVES, MOSS]);
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
        { itemId: 'leaves', quantity: CHOPPED_LEAVES },
        { itemId: 'resin', chance: RESIN_WHEN_CHOPPING, perception: true, find: true },
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
            ['leaves', CHOPPED_LEAVES],
          ] as const
        ).map(([itemId, [min, max]]) => ({ itemId, quantity: ctx.gathered(ctx.randomInt(min, max)) }));
        const resin = ctx.chance(ctx.findChance(RESIN_WHEN_CHOPPING)) ? 1 : 0;
        ctx.addItems([...items, { itemId: 'resin', quantity: resin }]);
      },
    },
    {
      id: 'track',
      label: 'Track animals',
      description: 'Search the undergrowth for fresh tracks and follow them.',
      details:
        `You find a fresh trail ${TRACKING_CHANCE * 100}% of the time at 20 Perception, rising to ` +
        `${Math.round(TRACKING_CHANCE * TRACKING_PERCEPTION_AT_MAX * 100)}% at 100.`,
      gains: (state) => [
        { text: 'A trail to an animal (starts a fight)', chance: perceptionGainChance(state, TRACKING_CHANCE, TRACKING_PERCEPTION_AT_MAX) },
      ],
      minutes: hours(3),
      energy: 10,
      trains: { perception: 3 },
      run: (ctx) => {
        if (ctx.chance(perceptionChance(TRACKING_CHANCE, ctx.attribute('perception'), TRACKING_PERCEPTION_AT_MAX))) {
          startHunt(ctx);
        } else {
          ctx.log('You search the undergrowth for hours, but find no fresh tracks.');
        }
      },
    },
  ],
};

import type { LocationDef } from '../../engine/definitions';
import { type FindDef, findGains, rollFinds } from '../../engine/outcomes';

const STONE_FINDS: FindDef[] = [
  { itemId: 'stone', chance: 1, quantity: [1, 3], fixedChance: true },
  { itemId: 'flint', chance: 0.35 },
];

/** The rocky interior of the island: stone, pebbles and flint, and little else. */
export const rocks: LocationDef = {
  id: 'rocks',
  name: 'Rocks',
  type: 'rocks',
  description:
    'Beyond the forest the ground rises into a broken, rocky landscape: grey boulders, slopes of loose scree and ' +
    'patches of gravel baking in the sun. Little grows here, but there is stone in plenty.',
  objects: [],
  actions: [
    {
      id: 'stones',
      label: 'Gather stones',
      description: 'Pick fist-sized stones out of the scree. A sharp eye may spot flint.',
      gains: (state) => findGains(state, 'rocks', 'scree', STONE_FINDS),
      minutes: 15,
      energy: 4,
      trains: { strength: 2, perception: 1 },
      run: (ctx) => {
        ctx.log('You pick through the scree for good stones.');
        rollFinds(ctx, 'scree', STONE_FINDS);
      },
    },
    {
      id: 'pebbles',
      label: 'Gather pebbles',
      description: 'Collect small, smooth pebbles from the gravel.',
      gains: [{ itemId: 'pebble', quantity: [2, 4] }],
      minutes: 10,
      energy: 2,
      run: (ctx) => {
        ctx.log('You fill your hands with smooth pebbles from the gravel.');
        ctx.addItem('pebble', ctx.randomInt(2, 4));
      },
    },
  ],
};

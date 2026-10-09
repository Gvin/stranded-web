import { getCharacterSheet } from '../../engine/character';
import type { LocationDef } from '../../engine/definitions';
import { type FindDef, findGains, rollFinds } from '../../engine/outcomes';
import { BASE_ATTRIBUTE, MAX_ATTRIBUTE } from '../../engine/rules';
import { hours } from '../../engine/time';
import { takeLocationStock } from '../../engine/world';
import { SHELTER_BUILDINGS } from './shared';

const STONE_FINDS: FindDef[] = [
  { itemId: 'stone', chance: 1, quantity: [1, 3], fixedChance: true },
  { itemId: 'flint', chance: 0.35 },
  { itemId: 'clay', chance: 0.05 },
];

/** The rocks' hidden bird population: the nests that looking for nests takes from. */
const NESTS = 'nests';

/** Finding a nest: this chance with Perception and Agility at 20, each giving half of the rise to the second at 100. */
const NEST_CHANCE = 0.3;
const NEST_CHANCE_AT_MAX = 0.6;

function nestChance(perception: number, agility: number): number {
  const half = (value: number) => (value - BASE_ATTRIBUTE) / (MAX_ATTRIBUTE - BASE_ATTRIBUTE) / 2;
  return Math.max(0, NEST_CHANCE * (1 + (NEST_CHANCE_AT_MAX / NEST_CHANCE - 1) * (half(perception) + half(agility))));
}

/** The rocky interior of the island: stone, pebbles and flint, and little else. */
export const rocks: LocationDef = {
  id: 'rocks',
  name: 'Rocks',
  type: 'rocks',
  description:
    'Beyond the forest the ground rises into a broken, rocky landscape: grey boulders, slopes of loose scree and ' +
    'patches of gravel baking in the sun. Little grows here, but there is stone in plenty.',
  objects: [],
  // why: hidden from the player; every nest found takes one.
  stocks: { [NESTS]: { initial: 8, max: 8, regenMinutes: hours(6) } },
  buildings: SHELTER_BUILDINGS,
  actions: [
    {
      id: 'stones',
      label: 'Gather stones',
      description: 'Pick fist-sized stones out of the scree. A sharp eye may spot flint.',
      gains: (state) => findGains(state, 'rocks', 'scree', STONE_FINDS),
      minutes: 15,
      energy: 4,
      trains: { strength: 2, perception: 1 },
      skill: 'foraging',
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
      skill: 'foraging',
      run: (ctx) => {
        ctx.log('You fill your hands with smooth pebbles from the gravel.');
        ctx.addItem('pebble', ctx.gathered(ctx.randomInt(2, 4)));
      },
    },
    {
      id: 'nests',
      label: 'Look for nests',
      description: "Climb among the boulders looking for birds' nests.",
      details: 'A sharp eye spots the nests and a sure foot reaches them: Perception and Agility both help.',
      gains: (state) => {
        const { perception, agility } = getCharacterSheet(state).attributes;
        return [
          { itemId: 'bird-egg', quantity: [1, 3], chance: nestChance(perception.effective, agility.effective), find: true, exact: true },
        ];
      },
      minutes: 30,
      energy: 3,
      trains: { perception: 1 },
      run: (ctx) => {
        const found = ctx.chance(nestChance(ctx.attribute('perception'), ctx.attribute('agility')));
        // why: with the nests robbed, there are none left to find, whatever the roll.
        if (found && takeLocationStock(ctx.state, 'rocks', NESTS, 1) > 0) {
          ctx.log('You find a nest wedged in a crack between the boulders.', 'good');
          ctx.addItem('bird-egg', ctx.randomInt(1, 3));
        } else {
          ctx.log('You climb over the rocks for half an hour, but find no nest with eggs.');
        }
      },
    },
  ],
};

import type { BuildingDef } from '../engine/definitions';
import { carried, ofType } from '../engine/requirements';
import type { BuildingId } from '../engine/types';

/** Buildings. Which ones can be built where is decided by each location's `buildings` list. */
export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  campfire: {
    id: 'campfire',
    name: 'Campfire',
    description: 'A ring of stones for a fire. Cooks raw food while it burns; feed it anything that burns.',
    icon: 'campfire',
    steps: 2,
    minutesPerStep: 15,
    energyPerStep: 3,
    ingredients: [
      { type: 'stick', quantity: 4 },
      { type: 'threads', quantity: 1 },
      { type: 'stone', quantity: 3 },
    ],
    trains: { perception: 1 },
    message: 'You coax a spark into the tinder until it catches. A small campfire crackles to life.',
  },
  workbench: {
    id: 'workbench',
    name: 'Workbench',
    description: 'A sturdy work surface. Needed for more advanced crafting.',
    icon: 'axe-in-stump',
    steps: 3,
    minutesPerStep: 25,
    energyPerStep: 5,
    ingredients: [
      { itemId: 'log', quantity: 2 },
      { type: 'stick', quantity: 4 },
      { type: 'rope', quantity: 2 },
    ],
    tools: [ofType('knife')],
    trains: { strength: 1, agility: 1 },
    message: 'You lash the last sticks across the logs. The workbench is ready.',
  },
  storage: {
    id: 'storage',
    name: 'Small storage',
    description: 'A raised, covered rack. Items kept here are safe and never rot away.',
    icon: 'wooden-crate',
    steps: 3,
    minutesPerStep: 25,
    energyPerStep: 4,
    ingredients: [
      { itemId: 'log', quantity: 2 },
      { type: 'stick', quantity: 6 },
      { type: 'rope', quantity: 2 },
    ],
    tools: [carried('hammer')],
    trains: { strength: 2 },
    message: 'You hammer the cover into place. Your things will be safe here.',
  },
  hut: {
    id: 'hut',
    name: 'Hut',
    description: 'A small hut of logs, sticks and grass. Sleeping inside is far more restful.',
    icon: 'hut',
    steps: 5,
    minutesPerStep: 30,
    energyPerStep: 5,
    ingredients: [
      { itemId: 'log', quantity: 4 },
      { type: 'stick', quantity: 8 },
      { type: 'rope', quantity: 4 },
      { itemId: 'grass', quantity: 6 },
    ],
    tools: [carried('hammer')],
    trains: { strength: 2, endurance: 1 },
    message: 'You thatch the last of the roof. It is small and crooked, but it is a hut.',
  },
};

/** Maximum weight in kg a small storage holds. */
export const STORAGE_CAPACITY = 40;

/** Game minutes a newly built or relit campfire burns. */
export const CAMPFIRE_INITIAL_BURN = 180;

/** Game minutes of fuel a campfire can hold at most. */
export const CAMPFIRE_MAX_BURN = 720;

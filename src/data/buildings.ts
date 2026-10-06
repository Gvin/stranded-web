import type { BuildingDef } from '../engine/definitions';
import { carried, ofType } from '../engine/requirements';
import type { BuildingId } from '../engine/types';

/** Water a wash at the rain collector uses, in bottles; drinking and filling a bottle use 1. */
export const COLLECTOR_WASH_WATER = 0.5;

/** Buildings. Which ones can be built where is decided by each location's `buildings` list. */
export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  campfire: {
    id: 'campfire',
    name: 'Campfire',
    description: 'A ring of stones for a fire. Cooks raw food and keeps you warm while it burns; feed it anything that burns.',
    icon: 'campfire',
    steps: 2,
    ingredients: [
      { type: 'stick', quantity: 4 },
      { type: 'threads', quantity: 1 },
      { type: 'stone', quantity: 3 },
    ],
    trains: { perception: 1 },
    heating: true,
    message: 'You coax a spark into the tinder until it catches. A small campfire crackles to life.',
  },
  workbench: {
    id: 'workbench',
    name: 'Workbench',
    description: 'A sturdy work surface. Needed for more advanced crafting.',
    icon: 'axe-in-stump',
    steps: 5,
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
    steps: 5,
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
    description:
      'A small hut of logs, sticks and grass. Sleeping inside is far more restful, and its roof shelters the camp from heat and rain.',
    icon: 'hut',
    steps: 10,
    ingredients: [
      { itemId: 'log', quantity: 4 },
      { type: 'stick', quantity: 8 },
      { type: 'rope', quantity: 4 },
      { itemId: 'grass', quantity: 6 },
    ],
    tools: [carried('hammer')],
    trains: { strength: 2, endurance: 1 },
    roof: true,
    message: 'You thatch the last of the roof. It is small and crooked, but it is a hut.',
  },
  rainCollector: {
    id: 'rainCollector',
    name: 'Small rain collector',
    description: 'A sheet of leather stretched over a wooden frame, draining into a sealed basin. Fills with water whenever it rains.',
    icon: 'water-tank',
    steps: 5,
    ingredients: [
      { itemId: 'log', quantity: 5 },
      { type: 'rope', quantity: 4 },
      { type: 'threads', quantity: 3 },
      { type: 'glue', quantity: 2 },
      { itemId: 'leather', quantity: 3 },
    ],
    tools: [carried('hammer'), carried('axe')],
    collector: { capacity: 2, bottlesPerHour: 10 },
    message: 'You seal the last seam of the basin. The rain collector is ready for the next shower.',
  },
};
/** Maximum weight in kg a small storage holds. */
export const STORAGE_CAPACITY = 40;

/** Game minutes a newly built or relit campfire burns. */
export const CAMPFIRE_INITIAL_BURN = 180;

/** Game minutes of fuel a campfire can hold at most. */
export const CAMPFIRE_MAX_BURN = 720;

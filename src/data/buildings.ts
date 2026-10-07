import type { BuildingDef, SleepDef } from '../engine/definitions';
import { carried, ofType } from '../engine/requirements';
import type { BuildingId, BuildingSlot } from '../engine/types';

/** Water a wash at the rain collector uses, in bottles; drinking and filling a bottle use 1. */
export const COLLECTOR_WASH_WATER = 0.5;

/** Sleeping where nothing has been built; the buildings of the house slot set how well the player sleeps on them. */
export const SLEEP_IN_THE_OPEN: SleepDef = {
  energyPerHour: 7,
  healthPerHour: 0,
  condition: 'awfulSleep',
  where: 'on the bare ground',
  message: 'You sleep fitfully on the bare ground and wake up aching all over.',
};

/** Every building step trains this. */
const BUILDING_TRAINS = { strength: 1 };

/**
 * Buildings, in slots of levels: each level is built on top of the one before and replaces it. Which ones can be built
 * where is decided by each location's `buildings` list.
 */
export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  sleepingMat: {
    id: 'sleepingMat',
    slot: 'house',
    level: 1,
    name: 'Sleeping mat',
    description: 'Cloth stitched over a bed of padding. Better than the bare ground, if not by much.',
    icon: 'sleeping-bag',
    steps: 2,
    ingredients: [
      { type: 'cloth', quantity: 4 },
      { type: 'threads', quantity: 2 },
    ],
    trains: BUILDING_TRAINS,
    sleep: {
      energyPerHour: 8,
      healthPerHour: 0,
      condition: 'badSleep',
      where: 'on your sleeping mat',
      message: 'You sleep on your mat, but the ground still finds every bone.',
    },
    message: 'You stitch the last seam. The sleeping mat is ready.',
  },
  shelter: {
    id: 'shelter',
    slot: 'house',
    level: 2,
    name: 'Shelter',
    description: 'A lean-to of sticks thatched with leaves and moss over your sleeping mat. It keeps off the sun and the rain.',
    icon: 'camping-tent',
    steps: 6,
    ingredients: [
      { type: 'stick', quantity: 7 },
      { type: 'threads', quantity: 4 },
      { itemId: 'leaves', quantity: 6 },
      { type: 'rope', quantity: 2 },
      { itemId: 'moss', quantity: 5 },
    ],
    trains: BUILDING_TRAINS,
    roof: true,
    sleep: {
      energyPerHour: 10,
      healthPerHour: 1,
      where: 'under your shelter',
      message: 'You sleep under your shelter and wake up rested.',
    },
    message: 'You stuff the last gap with moss. The shelter will keep you dry.',
  },
  hut: {
    id: 'hut',
    slot: 'house',
    level: 3,
    name: 'Hut',
    description:
      'A small hut of logs, sticks and leaves. Sleeping inside is far more restful, and its roof shelters you from heat and rain.',
    icon: 'hut',
    steps: 10,
    ingredients: [
      { itemId: 'log', quantity: 5 },
      { type: 'stick', quantity: 10 },
      { type: 'rope', quantity: 4 },
      { itemId: 'leaves', quantity: 10 },
      { itemId: 'moss', quantity: 10 },
    ],
    tools: [carried('hammer')],
    trains: BUILDING_TRAINS,
    roof: true,
    sleep: {
      energyPerHour: 12,
      healthPerHour: 2,
      condition: 'goodSleep',
      where: 'in your hut',
      message: 'You sleep soundly in your hut and wake up refreshed.',
    },
    message: 'You thatch the last of the roof. It is small and crooked, but it is a hut.',
  },
  house: {
    id: 'house',
    slot: 'house',
    level: 4,
    name: 'House',
    description: 'Log walls sealed with clay under a thick roof of leaves. A real home: nowhere on the island do you sleep better.',
    icon: 'wood-cabin',
    steps: 20,
    ingredients: [
      { itemId: 'log', quantity: 10 },
      { type: 'stick', quantity: 20 },
      { type: 'rope', quantity: 6 },
      { itemId: 'leaves', quantity: 15 },
      { itemId: 'clay', quantity: 10 },
    ],
    tools: [carried('hammer'), carried('axe')],
    trains: BUILDING_TRAINS,
    roof: true,
    sleep: {
      energyPerHour: 15,
      healthPerHour: 3,
      condition: 'perfectSleep',
      where: 'in your house',
      message: 'You sleep deeply in your own house and wake up full of strength.',
    },
    message: 'You seal the last crack with clay and step back. It is a house: your house.',
  },
  campfire: {
    id: 'campfire',
    slot: 'fire',
    level: 1,
    name: 'Campfire',
    description: 'A pile of sticks over a bed of tinder. Lit, it cooks raw food and keeps you warm. Rain puts it out.',
    icon: 'campfire',
    steps: 2,
    ingredients: [
      { type: 'stick', quantity: 5 },
      { type: 'threads', quantity: 3 },
    ],
    trains: BUILDING_TRAINS,
    fire: { capacity: 5, burnPerHour: 1 },
    message: 'You stack the sticks over a bed of tinder. The campfire is ready to be lit.',
  },
  fireplace: {
    id: 'fireplace',
    slot: 'fire',
    level: 2,
    name: 'Fireplace',
    description: 'A ring of stones around a deep hearth. It holds much more fuel than a campfire, but rain still puts it out.',
    icon: 'fireplace',
    steps: 6,
    ingredients: [
      { type: 'stone', quantity: 10 },
      { itemId: 'log', quantity: 3 },
      { type: 'stick', quantity: 3 },
      { type: 'threads', quantity: 3 },
    ],
    trains: BUILDING_TRAINS,
    fire: { capacity: 15, burnPerHour: 1 },
    message: 'You set the last stone around the hearth. The fireplace is ready.',
  },
  furnace: {
    id: 'furnace',
    slot: 'fire',
    level: 3,
    name: 'Furnace',
    description: 'A closed oven of stones and clay. It burns its fuel slowly, and no rain can reach the fire inside.',
    icon: 'furnace',
    steps: 12,
    ingredients: [
      { type: 'stone', quantity: 20 },
      { itemId: 'log', quantity: 6 },
      { type: 'stick', quantity: 6 },
      { type: 'threads', quantity: 5 },
      { itemId: 'clay', quantity: 5 },
    ],
    trains: BUILDING_TRAINS,
    fire: { capacity: 20, burnPerHour: 0.7, rainproof: true },
    message: 'You seal the furnace with the last of the clay. Rain will not touch this fire.',
  },
  basicWorkbench: {
    id: 'basicWorkbench',
    slot: 'workbench',
    level: 1,
    name: 'Basic workbench',
    description: 'A sturdy work surface. Needed for more advanced crafting.',
    icon: 'axe-in-stump',
    steps: 5,
    ingredients: [
      { itemId: 'log', quantity: 2 },
      { type: 'stick', quantity: 4 },
      { type: 'rope', quantity: 2 },
    ],
    tools: [ofType('knife')],
    trains: BUILDING_TRAINS,
    message: 'You lash the last sticks across the logs. The workbench is ready.',
  },
  workbench: {
    id: 'workbench',
    slot: 'workbench',
    level: 2,
    name: 'Workbench',
    description: 'A heavy bench of logs on a stone footing, steady enough for fine work.',
    icon: 'table',
    steps: 8,
    ingredients: [
      { itemId: 'log', quantity: 4 },
      { type: 'stick', quantity: 8 },
      { type: 'rope', quantity: 4 },
      { type: 'stone', quantity: 4 },
    ],
    tools: [carried('hammer')],
    trains: BUILDING_TRAINS,
    message: 'You hammer the bench onto its stone footing. It does not wobble at all.',
  },
  smallStorage: {
    id: 'smallStorage',
    slot: 'storage',
    level: 1,
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
    trains: BUILDING_TRAINS,
    storage: { capacity: 40 },
    message: 'You hammer the cover into place. Your things will be safe here.',
  },
  mediumStorage: {
    id: 'mediumStorage',
    slot: 'storage',
    level: 2,
    name: 'Medium storage',
    description: 'A bigger rack under a roof of leaves. Items kept here are safe and never rot away.',
    icon: 'chest',
    steps: 8,
    ingredients: [
      { itemId: 'log', quantity: 4 },
      { type: 'stick', quantity: 10 },
      { type: 'rope', quantity: 4 },
      { itemId: 'leaves', quantity: 8 },
    ],
    tools: [carried('hammer')],
    trains: BUILDING_TRAINS,
    storage: { capacity: 80 },
    message: 'You lay the last leaves on the roof. There is room for much more now.',
  },
  bigStorage: {
    id: 'bigStorage',
    slot: 'storage',
    level: 3,
    name: 'Big storage',
    description: 'A log store with clay-sealed walls. Items kept here are safe and never rot away.',
    icon: 'barn',
    steps: 12,
    ingredients: [
      { itemId: 'log', quantity: 8 },
      { type: 'stick', quantity: 16 },
      { type: 'rope', quantity: 6 },
      { itemId: 'clay', quantity: 6 },
    ],
    tools: [carried('hammer'), carried('axe')],
    trains: BUILDING_TRAINS,
    storage: { capacity: 150 },
    message: 'You seal the walls of the store with clay. Everything you own would fit in here.',
  },
  rainCollector: {
    id: 'rainCollector',
    slot: 'rainCollector',
    level: 1,
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
    trains: BUILDING_TRAINS,
    collector: { capacity: 2, bottlesPerHour: 10 },
    message: 'You seal the last seam of the basin. The rain collector is ready for the next shower.',
  },
};

/** The buildings of a slot from the first level up. */
export function slotLevels(slot: BuildingSlot): BuildingDef[] {
  return Object.values(BUILDINGS)
    .filter((def) => def.slot === slot)
    .sort((a, b) => a.level - b.level);
}

/** The level built on top of the given one (or the first level of the slot), if there is one. */
export function nextLevel(slot: BuildingSlot, current: BuildingId | undefined): BuildingDef | undefined {
  const levels = slotLevels(slot);
  return current === undefined ? levels[0] : levels[levels.findIndex((def) => def.id === current) + 1];
}

/** The level below the given one, which it is built on, if there is one. */
export function previousLevel(id: BuildingId): BuildingDef | undefined {
  const def = BUILDINGS[id];
  return slotLevels(def.slot).find((other) => other.level === def.level - 1);
}

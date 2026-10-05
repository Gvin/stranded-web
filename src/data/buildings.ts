import type { BuildingDef } from '../engine/definitions';
import type { BuildingId } from '../engine/types';

export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  campfire: {
    id: 'campfire',
    name: 'Campfire',
    description: 'A ring of stones for a fire. Cooks raw food while it burns; feed it anything that burns.',
  },
  hut: {
    id: 'hut',
    name: 'Hut',
    description: 'A small hut of logs, sticks and grass. Sleeping inside is far more restful.',
  },
  storage: {
    id: 'storage',
    name: 'Small storage',
    description: 'A raised, covered rack. Items kept here are safe and never rot away.',
  },
  workbench: {
    id: 'workbench',
    name: 'Workbench',
    description: 'A sturdy work surface. Needed for more advanced crafting.',
  },
};

/** Maximum weight in kg a small storage holds. */
export const STORAGE_CAPACITY = 40;

/** Game minutes a newly built or relit campfire burns. */
export const CAMPFIRE_INITIAL_BURN = 180;

/** Game minutes of fuel a campfire can hold at most. */
export const CAMPFIRE_MAX_BURN = 720;

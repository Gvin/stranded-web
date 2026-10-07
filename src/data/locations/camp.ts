import type { LocationDef } from '../../engine/definitions';
import { BUILDING_IDS } from '../../engine/types';

/** The clearing becomes the camp once the player builds something here; most buildings can only be built here. */
export const camp: LocationDef = {
  id: 'camp',
  name: 'Clearing',
  type: 'clearing',
  description:
    'A sunny clearing opens up in the forest, sheltered from the sea wind. The ground is flat and dry. ' +
    'It would make a good place to set up camp.',
  whenBuilt: {
    name: 'Camp',
    type: 'camp',
    description:
      'Your camp in the forest clearing. Flat, dry ground sheltered from the sea wind — the closest thing to home on this island.',
  },
  buildings: BUILDING_IDS,
  objects: [],
};

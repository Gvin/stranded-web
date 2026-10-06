import type { LocationDef } from '../../engine/definitions';

/**
 * Where the player is while travelling between two places: out in the open with nothing to use, so no roof and no fire.
 * It has no paths of its own and is never a destination.
 */
export const path: LocationDef = {
  id: 'path',
  name: 'On the way',
  type: 'path',
  description: 'A rough path between two places on the island.',
  objects: [],
};

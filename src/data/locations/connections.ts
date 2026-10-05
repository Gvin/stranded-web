import type { RouteDef } from '../../engine/definitions';

/** Two-way paths between locations. The forest is the hub every other place connects to. */
export const ROUTES: readonly RouteDef[] = [
  { between: ['beach', 'forest'], minutes: 20, energy: 4 },
  { between: ['forest', 'spring'], minutes: 25, energy: 5 },
  { between: ['forest', 'rocks'], minutes: 30, energy: 6 },
  { between: ['forest', 'camp'], minutes: 15, energy: 3 },
];

import type { EnemyDef } from '../engine/definitions';
import type { EnemyId } from '../engine/types';

// Animals the player can fight, found by tracking animals in the forest.

const ENEMY_LIST: readonly EnemyDef[] = [
  {
    id: 'rabbit',
    name: 'Rabbit',
    singular: 'a rabbit',
    icon: 'rabbit',
    health: 10,
    vision: 5,
    pattern: 'flee',
    trailChance: 0.2,
    rewards: [
      { itemId: 'raw-meat', quantity: 2 },
      { itemId: 'leather', quantity: 1 },
    ],
  },
  {
    id: 'seagull',
    name: 'Seagull',
    singular: 'a seagull',
    icon: 'seagull',
    health: 10,
    vision: 4,
    flying: true,
    pattern: 'flee',
    trailChance: 0.3,
    rewards: [
      { itemId: 'feather', quantity: [2, 4] },
      { itemId: 'raw-meat', quantity: 1 },
    ],
  },
  {
    id: 'kiwi',
    name: 'Kiwi',
    singular: 'a kiwi',
    icon: 'kiwi-bird',
    health: 10,
    vision: 5,
    pattern: 'flee',
    trailChance: 0.15,
    rewards: [
      { itemId: 'feather', quantity: [1, 2] },
      { itemId: 'raw-meat', quantity: 1 },
    ],
  },
  {
    id: 'turtle',
    name: 'Turtle',
    singular: 'a turtle',
    icon: 'turtle',
    health: 25,
    vision: 3,
    pattern: 'stand',
    attack: { damage: 10, accuracy: 0.4 },
    trailChance: 0.15,
    rewards: [{ itemId: 'raw-meat', quantity: 2 }],
  },
  {
    id: 'monkey',
    name: 'Monkey',
    singular: 'a monkey',
    icon: 'monkey',
    health: 100,
    vision: 7,
    pattern: 'fight',
    attack: { damage: 25, accuracy: 0.7 },
    trailChance: 0.08,
    rewards: [
      { itemId: 'raw-meat', quantity: 4 },
      { itemId: 'leather', quantity: 3 },
    ],
  },
  {
    id: 'snake',
    name: 'Snake',
    singular: 'a snake',
    icon: 'snake',
    health: 15,
    vision: 3,
    pattern: 'stand',
    attack: { damage: 15, accuracy: 0.6 },
    trailChance: 0.12,
    rewards: [
      { itemId: 'raw-meat', quantity: 1 },
      { itemId: 'leather', quantity: 1 },
    ],
  },
];

export const ENEMIES: Readonly<Record<EnemyId, EnemyDef>> = Object.fromEntries(ENEMY_LIST.map((def) => [def.id, def])) as Record<
  EnemyId,
  EnemyDef
>;

/** Enemies in the order their trail chances are rolled. */
export const ENEMY_ORDER: readonly EnemyId[] = ENEMY_LIST.map((def) => def.id);

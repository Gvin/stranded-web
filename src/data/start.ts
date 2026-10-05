import { BODY_CONDITIONS } from '../engine/conditions';
import { BASE_ATTRIBUTE } from '../engine/rules';
import type { GameState } from '../engine/types';
import { START_LOCATION_ID } from './locations';

const attribute = () => ({ base: BASE_ATTRIBUTE, xp: 0 });

const INTRO: readonly string[] = [
  'You wake up coughing seawater, face down on warm sand. The storm is gone — and so is your ship.',
  'Splintered wreckage litters the beach. Your left arm throbs where something struck it in the dark.',
  'Your throat is dry and the sun is climbing. You need water, food and a place to sleep.',
];

export function createStartingState(seed: number): GameState {
  return {
    time: 0,
    rng: seed,
    nextId: INTRO.length + 1,
    status: 'alive',
    player: {
      locationId: START_LOCATION_ID,
      stats: { health: 90, thirst: 45, hunger: 30, energy: 70 },
      attributes: {
        strength: attribute(),
        endurance: attribute(),
        perception: attribute(),
        agility: attribute(),
      },
      body: {
        head: [],
        torso: [],
        leftArm: [{ id: 'injured', remaining: BODY_CONDITIONS.injured.duration }],
        rightArm: [],
        leftLeg: [],
        rightLeg: [],
      },
      conditions: [],
      inventory: [],
      equipment: { body: 'clothes' },
      craftedRecipes: [],
    },
    locations: {
      [START_LOCATION_ID]: { visited: true, groundItems: [], stock: {}, finds: {}, buildings: {} },
    },
    flags: {},
    log: INTRO.map((text, index) => ({ id: index + 1, time: 0, text, tone: index === 0 ? 'info' : 'neutral' })),
  };
}

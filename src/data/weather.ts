import type { WeatherDef } from '../engine/definitions';
import type { WeatherId } from '../engine/types';

/** Island-wide weather. When one ends, the next is picked by `chance` and lasts a random time within `hours`. */
export const WEATHERS: Readonly<Record<WeatherId, WeatherDef>> = {
  clear: {
    id: 'clear',
    name: 'Clear',
    icon: 'sun',
    temperature: 1,
    chance: 0.3,
    hours: [1, 16],
    message: 'The clouds part. The sun beats down from a clear sky.',
  },
  cloudy: {
    id: 'cloudy',
    name: 'Cloudy',
    icon: 'fluffy-cloud',
    temperature: 0,
    chance: 0.2,
    hours: [1, 16],
    message: 'Clouds roll in and cover the sky.',
  },
  windy: {
    id: 'windy',
    name: 'Windy',
    icon: 'wind-slap',
    temperature: -1,
    chance: 0.2,
    hours: [1, 10],
    message: 'The wind picks up, cool and gusty.',
  },
  rainy: {
    id: 'rainy',
    name: 'Rainy',
    icon: 'raining',
    temperature: -1,
    chance: 0.2,
    hours: [1, 4],
    rainfall: 1,
    message: 'It starts to rain.',
  },
  stormy: {
    id: 'stormy',
    name: 'Stormy',
    icon: 'lightning-storm',
    temperature: -2,
    chance: 0.1,
    hours: [1, 3],
    rainfall: 1.5,
    storm: true,
    message: 'A storm breaks over the island. Rain lashes down and the sea churns.',
  },
};

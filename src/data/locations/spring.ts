import type { LocationDef, ObjectDef } from '../../engine/definitions';

const pool: ObjectDef = {
  id: 'pool',
  name: 'Spring pool',
  description: 'Cold, clean water gathers in a basin of mossy stone. The best thing you have seen since the wreck.',
  actions: [
    {
      id: 'drink',
      label: 'Drink from the spring',
      description: 'Clean, safe water. Drink until you are not thirsty at all.',
      gains: [{ text: 'Thirst down to 0' }],
      minutes: 5,
      block: (state) => (state.player.stats.thirst <= 0 ? 'You are not thirsty' : undefined),
      run: (ctx) => {
        const change = ctx.changeStat('thirst', -ctx.stat('thirst'));
        ctx.log(`You drink deeply from the cold spring.${change < 0 ? ` (−${Math.round(-change)} thirst)` : ''}`, 'good');
      },
    },
  ],
};

export const spring: LocationDef = {
  id: 'spring',
  name: 'Spring',
  type: 'spring',
  description:
    'Cold, clear water bubbles up between mossy boulders and gathers in a small pool before trickling away into the ferns. ' +
    'The air here is cool and smells of wet stone.',
  objects: [pool],
};

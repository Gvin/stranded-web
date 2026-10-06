import type { LocationDef, ObjectDef } from '../../engine/definitions';
import { canCoolDown, coolDown } from '../../engine/environment';
import { ENVIRONMENT_RULES } from '../../engine/rules';

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
    {
      id: 'wash',
      label: 'Wash your face',
      description: 'Splash cold spring water on your face and neck to cool down.',
      details: 'Offered while the island is Very Hot or you are overheated.',
      gains: [{ text: 'The hour until you overheat starts over' }, { text: `Overheated −${ENVIRONMENT_RULES.recoveryMinutes} min` }],
      minutes: 5,
      energy: 1,
      visibleIf: canCoolDown,
      run: (ctx) => {
        coolDown(ctx);
        ctx.log('You splash cold water on your face and neck. It feels wonderful.', 'good');
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

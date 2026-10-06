import { getItemDef } from '../data/items';
import { hasWorkingArm } from './conditions';
import type { Ingredient, Requirement, ResourceType } from './definitions';
import { bestArrow, countItem, countType, hasType, holdingItem, holdingType, possesses } from './inventory';
import { isStationPresent, stationName } from './world';

// Reusable requirement factories for content. Descriptions are computed lazily, so they can be
// created while the item catalogue module is still loading.

/** How a crafting type reads in requirements: what the player needs, not a list of every matching item. */
const TYPE_LABELS: Record<ResourceType, string> = {
  stick: 'Stick',
  fuel: 'Something that burns',
  heavy: 'Something heavy',
  stone: 'Stone',
  threads: 'Threads',
  rope: 'Rope',
  sharp: 'Something sharp',
  knife: 'Something sharp',
  cloth: 'Cloth',
  pebble: 'Pebble',
  feather: 'Feather',
  coconut_shell: 'Coconut shell',
  bottle: 'Bottle',
  glue: 'Glue',
};

export function typeLabel(type: ResourceType): string {
  return TYPE_LABELS[type];
}

/** An item of the crafting type must be held in a hand. */
export function holding(type: ResourceType): Requirement {
  return {
    describe: () => `${typeLabel(type)} in hand`,
    test: (state) => holdingType(state.player, type),
  };
}

/** A specific item must be held in a hand. */
export function holdingThe(itemId: string): Requirement {
  return {
    describe: () => `${getItemDef(itemId).name} in hand`,
    test: (state) => holdingItem(state.player, itemId),
  };
}

/** An item of the crafting type must be carried (in the bag or in hand). */
export function ofType(type: ResourceType): Requirement {
  return {
    describe: () => typeLabel(type),
    test: (state) => hasType(state.player, type),
  };
}

/** Items in the bag (whether they are used up is up to the action). */
export function item(itemId: string, quantity = 1): Requirement {
  return {
    describe: () => (quantity === 1 ? getItemDef(itemId).name : `${quantity}× ${getItemDef(itemId).name}`),
    test: (state) => countItem(state.player, itemId) >= quantity,
  };
}

/** The item must be carried in the bag or in hand. */
export function carried(itemId: string): Requirement {
  return {
    describe: () => getItemDef(itemId).name,
    test: (state) => possesses(state.player, itemId),
  };
}

/** A recipe ingredient must be in the bag: a specific item or enough items of a crafting type. */
export function ingredient(needed: Ingredient): Requirement {
  if ('itemId' in needed) {
    return item(needed.itemId, needed.quantity);
  }
  return {
    describe: () => `${needed.quantity > 1 ? `${needed.quantity}× ` : ''}${typeLabel(needed.type)}`,
    test: (state) => countType(state.player, needed.type) >= needed.quantity,
  };
}

/** An arrow in the bag, for shooting with the bow. */
export function arrow(): Requirement {
  return {
    describe: () => 'An arrow',
    test: (state) => bestArrow(state.player) !== undefined,
  };
}

/** A building or location object must be present here. */
export function station(id: string): Requirement {
  return {
    describe: () => `${stationName(id)} nearby`,
    test: (state) => isStationPresent(state, id),
  };
}

export function anyOf(...requirements: Requirement[]): Requirement {
  return {
    describe: () => requirements.map((r) => r.describe()).join(' or '),
    test: (state) => requirements.some((r) => r.test(state)),
  };
}

/** Both arms and both legs whole: not broken, splinted or missing (e.g. for climbing). */
export function unbrokenLimbs(): Requirement {
  return {
    describe: () => 'Both arms and legs unbroken',
    test: (state) =>
      (['leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const).every((part) =>
        state.player.body[part].every((c) => c.id !== 'fractured' && c.id !== 'splinted' && c.id !== 'missing'),
      ),
  };
}

export function workingArm(): Requirement {
  return {
    describe: () => 'A working arm',
    test: (state) => hasWorkingArm(state.player),
  };
}

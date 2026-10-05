import { BUILDINGS, CAMPFIRE_INITIAL_BURN, CAMPFIRE_MAX_BURN, STORAGE_CAPACITY } from '../data/buildings';
import { getItemDef } from '../data/items';
import { getLocationDef, getRoutesFrom, LOCATIONS } from '../data/locations';
import { RECIPES } from '../data/recipes';
import { getCharacterSheet } from './character';
import { bodyPartName, canHoldWith, hasBodyCondition, TIMED_CONDITIONS } from './conditions';
import { type ActionContext, formatAmount } from './context';
import type { ActionDef, AttributeXp, EquipmentDef, FoodDef, Ingredient, ObjectDef, RecipeDef, Requirement, TimeMode } from './definitions';
import { type Gain, resolveGains } from './gains';
import {
  addToInventory,
  allocateIngredients,
  countItem,
  getEquipped,
  HAND_ARM,
  isHandSlot,
  itemsOfType,
  stackWeight,
  unequip,
} from './inventory';
import { carried, ingredient, station, workingArm } from './requirements';
import { speedFactor, SURVIVAL_RULES } from './rules';
import { formatDuration, hours } from './time';
import { BODY_PART_IDS, EQUIP_SLOTS, type EquipSlot, type GameState, HAND_SLOTS, type LocationBuildings } from './types';
import { dropOnGround, ensureLocationState, getLocationInfo, getLocationState, getStock, getStockRegrowIn, isCampfireLit } from './world';

export type ActionCategory = 'location' | 'object' | 'building' | 'travel' | 'pickup' | 'item' | 'storage' | 'craft' | 'body';

/** A concrete action available in the current state, ready to be shown and performed. */
export interface GameAction {
  id: string;
  label: string;
  category: ActionCategory;
  description?: string;
  /** Longer explanation for the details popup. */
  details?: string;
  /** What the action may give, for the details popup. */
  gains?: readonly Gain[];
  /** Effective duration in game minutes. */
  minutes: number;
  energy: number;
  timeMode: TimeMode;
  requirements: readonly Requirement[];
  /** Extra availability rule; returns the reason when the action is blocked. */
  block?: (state: GameState) => string | undefined;
  trains?: AttributeXp;
  /** Object the action belongs to; gives the action access to the object's stock. */
  object?: ObjectDef;
  /** What the action targets: object, building, item, ground item, equip slot, body part, recipe or location id. */
  targetId?: string;
  /** Sub-group for compact display, e.g. all ways to feed a fire. */
  group?: 'fuel';
  run(ctx: ActionContext): void;
}

const SPLINT_INGREDIENTS: readonly Ingredient[] = [
  { type: 'stick', quantity: 2 },
  { type: 'rope', quantity: 1 },
];

const SLOT_LABELS: Record<EquipSlot, string> = { head: 'head', body: 'body', leftHand: 'left hand', rightHand: 'right hand' };

/**
 * Why the action cannot be performed right now, or undefined when it can.
 * Missing energy never blocks an action: it costs health instead.
 */
export function getBlockedReason(state: GameState, action: GameAction): string | undefined {
  if (state.status !== 'alive') {
    return 'You are dead.';
  }
  const missing = action.requirements.filter((r) => !r.test(state));
  if (missing.length > 0) {
    return `Requires: ${missing.map((r) => r.describe()).join(', ')}`;
  }
  return action.block?.(state);
}

/** All actions for the current state, including unavailable ones that should be shown as blocked. */
export function getActions(state: GameState): GameAction[] {
  if (state.status !== 'alive') {
    return [];
  }
  return [
    ...locationActions(state),
    ...objectActions(state),
    ...campfireActions(state),
    ...travelActions(state),
    ...pickupActions(state),
    ...inventoryActions(state),
    ...storageActions(state),
    ...craftActions(state),
    ...bodyActions(state),
  ];
}

function scaledMinutes(state: GameState, def: Pick<ActionDef, 'minutes' | 'speedAttribute'>): number {
  if (!def.speedAttribute) {
    return def.minutes;
  }
  const value = getCharacterSheet(state).attributes[def.speedAttribute].effective;
  return Math.max(1, Math.round(def.minutes * speedFactor(value)));
}

function freeCapacity(state: GameState): number {
  const sheet = getCharacterSheet(state);
  return Math.max(0, sheet.carryCapacity - sheet.carriedWeight);
}

/** How many units of an item fit into the given free weight. */
function unitsThatFit(itemId: string, freeWeight: number, wanted: number): number {
  const weight = getItemDef(itemId).weight;
  return weight > 0 ? Math.min(wanted, Math.floor(freeWeight / weight + 1e-9)) : wanted;
}

/** Uses up recipe ingredients from the bag and returns what was used. */
function consumeIngredients(ctx: ActionContext, ingredients: readonly Ingredient[]): string {
  const used = allocateIngredients(ctx.state.player, ingredients) ?? [];
  for (const stack of used) {
    ctx.removeItem(stack.itemId, stack.quantity);
  }
  return used.map((s) => formatAmount(s.itemId, s.quantity)).join(', ');
}

function signed(value: number): string {
  return `${value > 0 ? '+' : '−'}${Math.abs(Math.round(value))}`;
}

function locationActions(state: GameState): GameAction[] {
  const hut = getLocationState(state, state.player.locationId).buildings.hut !== undefined;
  const sleepEnergy = (SURVIVAL_RULES.energyRegenPerHour.sleeping + (hut ? SURVIVAL_RULES.shelteredSleepEnergyBonusPerHour : 0)) * 8;
  return [
    {
      id: 'rest',
      label: 'Rest',
      category: 'location',
      description: 'Sit down and catch your breath. Restores some energy.',
      details: 'Thirst and hunger keep growing while you rest. Wounds and health recover a little faster than when active.',
      gains: [{ label: `+${SURVIVAL_RULES.energyRegenPerHour.resting} energy` }],
      minutes: 60,
      energy: 0,
      timeMode: 'resting',
      requirements: [],
      run: (ctx) => ctx.log('You sit down and rest for a while.'),
    },
    {
      id: 'sleep',
      label: 'Sleep',
      category: 'location',
      description: 'Sleep through the next hours. A hut makes it far more restful.',
      details: `Only possible when your energy is below ${SURVIVAL_RULES.sleepBelowEnergy}. Thirst and hunger grow more slowly while you sleep, and health recovers faster.`,
      gains: [{ label: `+${sleepEnergy} energy${hut ? ' (hut)' : ''}` }, { label: 'Faster healing' }],
      minutes: hours(8),
      energy: 0,
      timeMode: 'sleeping',
      requirements: [],
      block: (s) =>
        s.player.stats.energy >= SURVIVAL_RULES.sleepBelowEnergy
          ? `You are not tired enough to sleep (energy must be below ${SURVIVAL_RULES.sleepBelowEnergy})`
          : undefined,
      run: (ctx) => {
        ctx.log(
          ctx.location().buildings.hut
            ? 'You sleep soundly in your hut and wake up refreshed.'
            : 'You sleep fitfully in the open and wake up stiff.',
        );
      },
    },
  ];
}

function fromActionDef(state: GameState, def: ActionDef, object: ObjectDef): GameAction {
  const locationId = state.player.locationId;
  const stockName = typeof def.usesStock === 'string' ? def.usesStock : undefined;
  const gainDefs = typeof def.gains === 'function' ? def.gains(state) : (def.gains ?? []);
  return {
    id: `obj:${object.id}:${def.id}`,
    label: def.label,
    category: 'object',
    description: def.description,
    details: def.details,
    gains: resolveGains(state, gainDefs),
    minutes: scaledMinutes(state, def),
    energy: def.energy ?? 0,
    timeMode: def.timeMode ?? 'awake',
    requirements: def.requires ?? [],
    block: (s) => {
      if (def.usesStock && getStock(s, locationId, object, stockName) <= 0) {
        const regrowIn = getStockRegrowIn(s, locationId, object, stockName);
        return regrowIn === undefined ? 'Nothing left' : `Nothing left (more in ${formatDuration(regrowIn)})`;
      }
      return def.block?.(s);
    },
    trains: def.trains,
    object,
    targetId: object.id,
    run: def.run,
  };
}

/** Whether an object is present (hidden objects are present, just not listed). */
export function isObjectPresent(state: GameState, object: ObjectDef): boolean {
  return object.visibleIf?.(state) ?? true;
}

function objectActions(state: GameState): GameAction[] {
  const location = getLocationDef(state.player.locationId);
  return location.objects
    .filter((object) => isObjectPresent(state, object))
    .flatMap((object) => object.actions.filter((def) => def.visibleIf?.(state) ?? true).map((def) => fromActionDef(state, def, object)));
}

function campfireActions(state: GameState): GameAction[] {
  const location = getLocationState(state, state.player.locationId);
  if (!location.buildings.campfire) {
    return [];
  }
  const base = { category: 'building' as const, energy: 0, timeMode: 'awake' as const, targetId: 'campfire' };
  if (!isCampfireLit(location, state.time)) {
    const relight: readonly Ingredient[] = [
      { type: 'stick', quantity: 2 },
      { type: 'threads', quantity: 1 },
    ];
    return [
      {
        ...base,
        id: 'campfire:relight',
        label: 'Relight the campfire',
        description: 'Spin a bow drill over fresh tinder.',
        gains: [{ label: `Fire burns ${formatDuration(CAMPFIRE_INITIAL_BURN)}` }],
        minutes: 15,
        energy: 2,
        requirements: [...relight.map(ingredient), carried('bow')],
        run: (ctx) => {
          consumeIngredients(ctx, relight);
          const campfire = ctx.location().buildings.campfire;
          if (campfire) {
            campfire.litUntil = ctx.state.time + CAMPFIRE_INITIAL_BURN;
          }
          ctx.log('You spin the bow drill until the tinder catches. The fire crackles back to life.', 'good');
        },
      },
    ];
  }
  const fuels = itemsOfType('fuel').filter((def) => countItem(state.player, def.id) > 0);
  const cookables = state.player.inventory
    .map((stack) => getItemDef(stack.itemId))
    .filter((def): def is FoodDef => def.category === 'food' && def.cooksInto !== undefined);
  return [
    ...fuels.map((def): GameAction => ({
      ...base,
      id: `campfire:fuel:${def.id}`,
      label: def.name,
      description: `Burn one ${def.name.toLowerCase()} to keep the fire going.`,
      details: `The fire can hold at most ${formatDuration(CAMPFIRE_MAX_BURN)} of fuel.`,
      gains: [{ label: `+${formatDuration(def.fuelMinutes ?? 0)} of fire` }],
      minutes: 1,
      group: 'fuel',
      requirements: [],
      block: (s) => {
        const litUntil = getLocationState(s, s.player.locationId).buildings.campfire?.litUntil ?? 0;
        return litUntil - s.time >= CAMPFIRE_MAX_BURN ? 'The fire is already roaring' : undefined;
      },
      run: (ctx) => {
        ctx.removeItem(def.id);
        const campfire = ctx.location().buildings.campfire;
        if (campfire) {
          campfire.litUntil = Math.min(
            ctx.state.time + CAMPFIRE_MAX_BURN,
            Math.max(campfire.litUntil, ctx.state.time) + (def.fuelMinutes ?? 0),
          );
        }
        ctx.log(`You feed the fire (−1 ${def.name.toLowerCase()}). The flames leap higher.`);
      },
    })),
    ...cookables.map((def): GameAction => ({
      ...base,
      id: `campfire:cook:${def.id}`,
      label: `Cook ${def.name.toLowerCase()}`,
      description: `Turns it into ${getItemDef(def.cooksInto as string).name.toLowerCase()}.`,
      details: 'Cooked food is more filling and safe to eat. Careless hands can get burnt; agility helps.',
      gains: resolveGains(state, [{ itemId: def.cooksInto as string }]),
      minutes: 15,
      requirements: [],
      trains: { perception: 1 },
      run: (ctx) => {
        ctx.removeItem(def.id);
        const burnChance = Math.min(0.25, 0.08 * (20 / ctx.attribute('agility')));
        const arms = (['leftArm', 'rightArm'] as const).filter((arm) => !hasBodyCondition(ctx.state.player, arm, 'missing'));
        if (arms.length > 0 && ctx.chance(burnChance)) {
          const arm = ctx.pick(arms);
          ctx.addBodyCondition(arm, 'burnt');
          ctx.log(`The fire flares up and scorches your ${bodyPartName(arm)}!`, 'bad');
        }
        ctx.log(`You cook the ${def.name.toLowerCase()} over the fire.`);
        ctx.addItem(def.cooksInto as string);
      },
    })),
  ];
}

function travelActions(state: GameState): GameAction[] {
  const agility = getCharacterSheet(state).attributes.agility.effective;
  return getRoutesFrom(state.player.locationId, state).map((route) => {
    const destination = getLocationDef(route.to);
    const name = getLocationInfo(state, route.to).name;
    const visited = getLocationState(state, route.to).visited;
    return {
      id: `travel:${route.to}`,
      label: `Go to ${name}`,
      category: 'travel',
      description: visited ? undefined : 'You have not been there yet.',
      details: 'Travel time depends on your agility; injured legs slow you down. You cannot travel while carrying too much.',
      gains: [{ label: visited ? `Reach the ${name}` : `Discover the ${name}` }],
      minutes: Math.max(1, Math.round(route.minutes * speedFactor(agility))),
      energy: route.energy,
      timeMode: 'awake',
      requirements: [],
      block: (s) => {
        const sheet = getCharacterSheet(s);
        return sheet.carriedWeight > sheet.carryCapacity ? 'You are carrying too much to travel' : undefined;
      },
      trains: { endurance: 1, agility: 1 },
      targetId: route.to,
      run: (ctx) => {
        ctx.state.player.locationId = route.to;
        const location = ctx.location();
        const firstVisit = !location.visited;
        location.visited = true;
        const arrivedAt = getLocationInfo(ctx.state, route.to).name;
        ctx.log(firstVisit ? `You reach the ${arrivedAt} for the first time.` : `You arrive at the ${arrivedAt}.`, 'info');
        destination.onArrive?.(ctx);
      },
    } satisfies GameAction;
  });
}

function pickupActions(state: GameState): GameAction[] {
  const location = getLocationState(state, state.player.locationId);
  return location.groundItems.map((ground) => ({
    id: `pickup:${ground.id}`,
    label: `Pick up ${formatAmount(ground.itemId, ground.quantity)}`,
    category: 'pickup',
    details: 'Picks up as much as you can carry.',
    minutes: 1,
    energy: 0,
    timeMode: 'awake',
    requirements: [],
    block: (s) => (unitsThatFit(ground.itemId, freeCapacity(s), 1) < 1 ? 'Too heavy to carry' : undefined),
    targetId: String(ground.id),
    run: (ctx) => {
      const groundItems = ctx.location().groundItems;
      const current = groundItems.find((g) => g.id === ground.id);
      if (!current) {
        ctx.log('It is gone.');
        return;
      }
      const fits = unitsThatFit(current.itemId, freeCapacity(ctx.state), current.quantity);
      current.quantity -= fits;
      if (current.quantity <= 0) {
        groundItems.splice(groundItems.indexOf(current), 1);
      }
      ctx.addItem(current.itemId, fits, { silent: true });
      ctx.log(`You pick up ${formatAmount(current.itemId, fits).toLowerCase()}.`);
    },
  }));
}

function eatAction(def: FoodDef): GameAction {
  const effects = [
    def.nutrition ? `${signed(-def.nutrition)} hunger` : undefined,
    def.hydration ? `${signed(-def.hydration)} thirst` : undefined,
    def.energy ? `${signed(def.energy)} energy` : undefined,
  ].filter((e): e is string => e !== undefined);
  const risks = (def.risks ?? []).map(
    (r) => `${Math.round(r.chance * 100)}% chance of ${r.severity} ${TIMED_CONDITIONS[r.condition].name.toLowerCase()}`,
  );
  return {
    id: `eat:${def.id}`,
    label: def.verb === 'drink' ? 'Drink' : 'Eat',
    category: 'item',
    description: def.description,
    details: risks.length > 0 ? `Risky: ${risks.join(', ')}.` : undefined,
    gains: effects.map((label) => ({ label })),
    minutes: def.verb === 'drink' ? 2 : 5,
    energy: 0,
    timeMode: 'awake',
    requirements: def.requires ?? [],
    targetId: def.id,
    block: (s) => {
      const stats = s.player.stats;
      const notHungry = def.nutrition <= 0 || stats.hunger <= 0;
      const notThirsty = def.hydration <= 0 || stats.thirst <= 0;
      return notHungry && notThirsty ? 'You could not take another bite' : undefined;
    },
    run: (ctx) => {
      ctx.removeItem(def.id);
      const changes = [
        ['hunger', ctx.changeStat('hunger', -def.nutrition)],
        ['thirst', ctx.changeStat('thirst', -def.hydration)],
        ['energy', ctx.changeStat('energy', def.energy ?? 0)],
      ] as const;
      const summary = changes
        .filter(([, value]) => Math.round(value) !== 0)
        .map(([name, value]) => `${signed(value)} ${name}`)
        .join(', ');
      const verb = def.verb === 'drink' ? 'drink' : 'eat';
      ctx.log(`You ${verb} the ${def.name.toLowerCase()}.${summary ? ` (${summary})` : ''}`);
      for (const risk of def.risks ?? []) {
        if (ctx.chance(risk.chance)) {
          ctx.addTimedCondition(risk.condition, risk.severity);
        }
      }
    },
  };
}

function slotsFor(def: EquipmentDef): EquipSlot[] {
  return def.slot === 'hand' ? [...HAND_SLOTS] : [def.slot];
}

function equipAction(def: EquipmentDef, slot: EquipSlot): GameAction {
  const name = def.name.toLowerCase();
  const hand = isHandSlot(slot);
  return {
    id: `equip:${def.id}:${slot}`,
    label: hand ? `Hold in ${SLOT_LABELS[slot]}` : 'Wear',
    category: 'item',
    details: hand
      ? 'Held items work as tools and weapons. A fractured, splinted or missing arm cannot hold anything.'
      : `Wear it on your ${SLOT_LABELS[slot]}.`,
    minutes: 1,
    energy: 0,
    timeMode: 'awake',
    requirements: [],
    targetId: def.id,
    block: (s) =>
      isHandSlot(slot) && !canHoldWith(s.player, HAND_ARM[slot]) ? `Your ${bodyPartName(HAND_ARM[slot])} cannot hold anything` : undefined,
    run: (ctx) => {
      const player = ctx.state.player;
      const previous = unequip(player, slot);
      ctx.removeItem(def.id);
      player.equipment[slot] = def.id;
      const swap = previous ? ` and put away the ${getItemDef(previous).name.toLowerCase()}` : '';
      ctx.log(hand ? `You take the ${name} in your ${SLOT_LABELS[slot]}${swap}.` : `You put on the ${name}${swap}.`);
    },
  };
}

function inventoryActions(state: GameState): GameAction[] {
  const actions: GameAction[] = [];
  const player = state.player;
  for (const slot of EQUIP_SLOTS) {
    const equipped = getEquipped(player, slot);
    if (equipped) {
      actions.push({
        id: `unequip:${slot}`,
        label: isHandSlot(slot) ? 'Put away' : 'Take off',
        category: 'item',
        details: 'Puts it into your bag.',
        minutes: 1,
        energy: 0,
        timeMode: 'awake',
        requirements: [],
        targetId: slot,
        run: (ctx) => {
          unequip(ctx.state.player, slot);
          ctx.log(`You put the ${equipped.name.toLowerCase()} in your bag.`);
        },
      });
    }
  }
  for (const stack of player.inventory) {
    const def = getItemDef(stack.itemId);
    if (def.category === 'food') {
      actions.push(eatAction(def));
    }
    if (def.category === 'equipment') {
      actions.push(...slotsFor(def).map((slot) => equipAction(def, slot)));
    }
    const drop = (all: boolean): GameAction => ({
      id: `drop:${def.id}:${all ? 'all' : 'one'}`,
      label: all ? 'Drop all' : 'Drop',
      category: 'item',
      details: `Dropped items stay on the ground for ${formatDuration(def.groundLifetime)}, then they are gone.`,
      minutes: 0,
      energy: 0,
      timeMode: 'awake',
      requirements: [],
      targetId: def.id,
      run: (ctx) => {
        const amount = all ? ctx.countItem(def.id) : 1;
        if (amount > 0 && ctx.removeItem(def.id, amount)) {
          dropOnGround(ctx.state, ctx.state.player.locationId, def.id, amount);
          ctx.log(`You drop ${formatAmount(def.id, amount).toLowerCase()} on the ground.`);
        }
      },
    });
    actions.push(drop(false));
    if (stack.quantity > 1) {
      actions.push(drop(true));
    }
  }
  return actions;
}

/** Store and take actions for a small storage at the player's location. */
function storageActions(state: GameState): GameAction[] {
  const storage = getLocationState(state, state.player.locationId).buildings.storage;
  if (!storage) {
    return [];
  }
  const storageFree = (s: GameState): number =>
    STORAGE_CAPACITY - stackWeight(getLocationState(s, s.player.locationId).buildings.storage?.items ?? []);
  const base = { category: 'storage' as const, minutes: 1, energy: 0, timeMode: 'awake' as const, requirements: [] };
  const store = (itemId: string, all: boolean): GameAction => ({
    ...base,
    id: `store:${itemId}:${all ? 'all' : 'one'}`,
    label: all ? 'Store all' : 'Store',
    details: `Stored items never rot. The storage holds ${STORAGE_CAPACITY} kg.`,
    targetId: itemId,
    block: (s) => (unitsThatFit(itemId, storageFree(s), 1) < 1 ? 'The storage is full' : undefined),
    run: (ctx) => {
      const items = ctx.location().buildings.storage?.items;
      const amount = unitsThatFit(itemId, storageFree(ctx.state), all ? ctx.countItem(itemId) : 1);
      if (!items || amount <= 0 || !ctx.removeItem(itemId, amount)) {
        return;
      }
      const stack = items.find((s) => s.itemId === itemId);
      if (stack) {
        stack.quantity += amount;
      } else {
        items.push({ itemId, quantity: amount });
      }
      ctx.log(`You put ${formatAmount(itemId, amount).toLowerCase()} into storage.`);
    },
  });
  const take = (itemId: string, all: boolean): GameAction => ({
    ...base,
    id: `take:${itemId}:${all ? 'all' : 'one'}`,
    label: all ? 'Take all' : 'Take',
    details: 'Takes as much as you can carry.',
    targetId: itemId,
    block: (s) => (unitsThatFit(itemId, freeCapacity(s), 1) < 1 ? 'Too heavy to carry' : undefined),
    run: (ctx) => {
      const storageState = ctx.location().buildings.storage;
      const stack = storageState?.items.find((s) => s.itemId === itemId);
      if (!storageState || !stack) {
        return;
      }
      const amount = unitsThatFit(itemId, freeCapacity(ctx.state), all ? stack.quantity : 1);
      stack.quantity -= amount;
      storageState.items = storageState.items.filter((s) => s.quantity > 0);
      addToInventory(ctx.state.player, itemId, amount);
      ctx.log(`You take ${formatAmount(itemId, amount).toLowerCase()} from storage.`);
    },
  });
  return [
    ...state.player.inventory.flatMap((s) => (s.quantity > 1 ? [store(s.itemId, false), store(s.itemId, true)] : [store(s.itemId, false)])),
    ...storage.items.flatMap((s) => (s.quantity > 1 ? [take(s.itemId, false), take(s.itemId, true)] : [take(s.itemId, false)])),
  ];
}

function isRecipeVisible(state: GameState, recipe: RecipeDef): boolean {
  if (!(recipe.visibleIf?.(state) ?? true)) {
    return false;
  }
  return !recipe.builds || getLocationState(state, state.player.locationId).buildings[recipe.builds] === undefined;
}

function blockOutsideBuildSites(state: GameState): string | undefined {
  if (getLocationDef(state.player.locationId).buildable) {
    return undefined;
  }
  const sites = LOCATIONS.filter((l) => l.buildable).map((l) => getLocationInfo(state, l.id).name);
  return `Can only be built at the ${sites.join(' or ')}`;
}

function newBuilding(id: keyof LocationBuildings, time: number): LocationBuildings {
  switch (id) {
    case 'campfire':
      return { campfire: { builtAt: time, litUntil: time + CAMPFIRE_INITIAL_BURN } };
    case 'storage':
      return { storage: { builtAt: time, items: [] } };
    default:
      return { [id]: { builtAt: time } };
  }
}

function craftActions(state: GameState): GameAction[] {
  return RECIPES.filter((recipe) => isRecipeVisible(state, recipe)).map((recipe) => ({
    id: `craft:${recipe.id}`,
    label: recipe.name,
    category: 'craft',
    description: recipe.description,
    details: recipe.builds
      ? 'Built where you stand. Buildings can only be built at the clearing in the forest.'
      : 'Ingredients that ask for a type accept any item of that type; the cheapest ones are used first.',
    gains: recipe.result
      ? resolveGains(state, [{ itemId: recipe.result.itemId, quantity: recipe.result.quantity }])
      : [{ label: recipe.builds ? BUILDINGS[recipe.builds].name : recipe.name }],
    minutes: recipe.minutes,
    energy: recipe.energy,
    timeMode: 'awake',
    requirements: [workingArm(), ...recipe.ingredients.map(ingredient), ...(recipe.tools ?? []), ...(recipe.stations ?? []).map(station)],
    block: (s) =>
      (recipe.builds ? blockOutsideBuildSites(s) : undefined) ??
      (allocateIngredients(s.player, recipe.ingredients) ? undefined : 'Not enough materials for all ingredients'),
    trains: recipe.trains,
    targetId: recipe.id,
    run: (ctx) => {
      const locationId = ctx.state.player.locationId;
      const nameBefore = getLocationInfo(ctx.state, locationId).name;
      const used = consumeIngredients(ctx, recipe.ingredients);
      if (recipe.builds) {
        const location = ensureLocationState(ctx.state, locationId);
        location.buildings = { ...location.buildings, ...newBuilding(recipe.builds, ctx.state.time) };
      }
      const { craftedRecipes } = ctx.state.player;
      if (!craftedRecipes.includes(recipe.id)) {
        craftedRecipes.push(recipe.id);
      }
      ctx.log(recipe.message, recipe.builds ? 'good' : 'neutral');
      if (used) {
        ctx.log(`Used: ${used}`, 'info');
      }
      const nameAfter = getLocationInfo(ctx.state, locationId).name;
      if (nameAfter !== nameBefore) {
        ctx.log(`The ${nameBefore.toLowerCase()} is starting to feel like home. This is your ${nameAfter.toLowerCase()} now.`, 'info');
      }
      if (recipe.result) {
        ctx.addItem(recipe.result.itemId, recipe.result.quantity);
      }
    },
  }));
}

function bodyActions(state: GameState): GameAction[] {
  const actions: GameAction[] = [];
  const player = state.player;
  for (const part of BODY_PART_IDS) {
    const name = bodyPartName(part);
    const has = (id: Parameters<typeof hasBodyCondition>[2]) => hasBodyCondition(player, part, id);
    if (has('injured') || has('burnt') || has('bleeding')) {
      actions.push({
        id: `bandage:${part}`,
        label: `Bandage ${name}`,
        category: 'body',
        description: 'Stops bleeding at once; bandaged wounds and burns heal twice as fast.',
        details: 'A bandage replaces the injury, burn and bleeding on this body part. It still hurts a little until it heals.',
        gains: [{ label: 'Bleeding stops' }, { label: 'Heals twice as fast' }],
        minutes: 10,
        energy: 0,
        timeMode: 'awake',
        requirements: [ingredient({ itemId: 'bandage', quantity: 1 }), workingArm()],
        trains: { perception: 1 },
        targetId: part,
        run: (ctx) => {
          ctx.removeItem('bandage');
          ctx.addBodyCondition(part, 'bandaged');
          ctx.log(`You wrap a bandage tightly around your ${name}.`, 'good');
        },
      });
    }
    if (has('fractured')) {
      actions.push({
        id: `splint:${part}`,
        label: `Splint ${name}`,
        category: 'body',
        description: 'Sets the broken bone between two sticks so it can heal.',
        details: 'A fracture never heals on its own. A splinted arm still cannot hold anything until it has knitted.',
        gains: [{ label: 'The bone starts to heal (5 days)' }],
        minutes: 20,
        energy: 3,
        timeMode: 'awake',
        requirements: [...SPLINT_INGREDIENTS.map(ingredient), workingArm()],
        trains: { perception: 1, endurance: 1 },
        targetId: part,
        run: (ctx) => {
          consumeIngredients(ctx, SPLINT_INGREDIENTS);
          ctx.addBodyCondition(part, 'splinted');
          ctx.log(`Gritting your teeth, you set the bone and bind your ${name} between two sticks.`, 'good');
        },
      });
    }
  }
  return actions;
}

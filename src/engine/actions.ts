import { BUILDINGS, CAMPFIRE_INITIAL_BURN, CAMPFIRE_MAX_BURN, COLLECTOR_WASH_WATER, STORAGE_CAPACITY } from '../data/buildings';
import { getItemDef } from '../data/items';
import { getLocationDef, getRoutesFrom } from '../data/locations';
import { RECIPES } from '../data/recipes';
import { getCharacterSheet } from './character';
import { bodyPartName, canHoldWith, hasBodyCondition, TIMED_CONDITIONS } from './conditions';
import { type ActionContext, formatAmount } from './context';
import type {
  ActionDef,
  AttributeXp,
  EquipmentDef,
  FoodDef,
  Ingredient,
  LocationDef,
  ObjectDef,
  Requirement,
  TimeMode,
} from './definitions';
import { type Gain, resolveGains } from './gains';
import { canCoolDown, canWarmUp, coolDown, isRaining, roofAt, warmUp } from './environment';
import {
  addToInventory,
  addToStacks,
  allocateByIngredient,
  allocateIngredients,
  countItem,
  describeClothing,
  entryKey,
  findEntry,
  getEquipped,
  HAND_ARM,
  isHandSlot,
  itemsOfType,
  stackWeight,
  takeFromEntry,
  unequip,
} from './inventory';
import { emptyFoodGroups, feedFoodGroup, foodGroupList } from './nutrition';
import { ingredient, station, workingArm } from './requirements';
import {
  BUILDING_STEP_ENERGY,
  BUILDING_STEP_MINUTES,
  CRAFT_ENERGY,
  ENVIRONMENT_RULES,
  ITEM_WEAR_PER_DAY,
  SKILL_NAMES,
  speedFactor,
  SURVIVAL_RULES,
} from './rules';
import { refundableUnits, refundChances, skilledMinutes, skillLevel } from './skills';
import { formatDuration, hours, minutesUntilHour } from './time';
import {
  BODY_PART_IDS,
  type BuildingId,
  EQUIP_SLOTS,
  type EquipSlot,
  type GameState,
  HAND_SLOTS,
  type InventoryStack,
  type LocationBuildings,
  type SkillId,
} from './types';
import { dropOnGround, ensureLocationState, getLocationInfo, getLocationState, getStock, getStockRegrowIn, isCampfireLit } from './world';

export type ActionCategory = 'location' | 'object' | 'building' | 'travel' | 'pickup' | 'item' | 'storage' | 'craft' | 'build' | 'body';

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
  /** Skill the action trains (see SKILL_RULES.points). */
  skill?: SkillId;
  /** Object the action belongs to; gives the action access to the object's stock. */
  object?: ObjectDef;
  /** What the action targets: object, building, item, ground item, equip slot, body part, recipe or location id. */
  targetId?: string;
  /** Sub-group for compact display, e.g. all ways to feed a fire. */
  group?: 'fuel';
  /** The item the action uses or works on, so the UI can show its icon. */
  itemId?: string;
  /** Its time passes on the way (at the travel location, out in the open) rather than where the player started. */
  travel?: boolean;
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
    ...rainCollectorActions(state),
    ...travelActions(state),
    ...pickupActions(state),
    ...inventoryActions(state),
    ...storageActions(state),
    ...craftActions(state),
    ...buildActions(state),
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

/** Uses up recipe ingredients from the bag and returns the items used for each ingredient. */
function useUpIngredients(ctx: ActionContext, ingredients: readonly Ingredient[]): InventoryStack[][] {
  const used = allocateByIngredient(ctx.state.player, ingredients) ?? [];
  for (const stack of used.flat()) {
    ctx.removeItem(stack.itemId, stack.quantity);
  }
  return used;
}

/** "2× Stick, Threads", adding up the same item across ingredients. */
function describeStacks(stacks: readonly InventoryStack[]): string {
  const total = new Map<string, number>();
  for (const stack of stacks) {
    total.set(stack.itemId, (total.get(stack.itemId) ?? 0) + stack.quantity);
  }
  return [...total].map(([itemId, quantity]) => formatAmount(itemId, quantity)).join(', ');
}

/** Uses up recipe ingredients from the bag and returns what was used, for the log. */
function consumeIngredients(ctx: ActionContext, ingredients: readonly Ingredient[]): string {
  return describeStacks(useUpIngredients(ctx, ingredients).flat());
}

/**
 * Gives back some of the used resources for a Building or Crafting level and logs it. Only an ingredient used 2 or
 * more times can give one back, and never its last unit (see `refundableUnits`).
 */
function giveBackResources(ctx: ActionContext, skill: SkillId, used: readonly (readonly InventoryStack[])[]): void {
  const { first, second } = refundChances(skillLevel(ctx.state.player, skill));
  const units = refundableUnits(used);
  const saved: InventoryStack[] = [];
  for (const chance of [first, second]) {
    const candidates = units.flatMap((pool, index) => (pool.length >= 2 ? [index] : []));
    if (chance <= 0 || candidates.length === 0 || !ctx.chance(chance)) {
      continue;
    }
    const pool = units[ctx.pick(candidates)] ?? [];
    const [itemId] = pool.splice(Math.floor(ctx.random() * pool.length), 1);
    if (itemId) {
      saved.push({ itemId, quantity: 1 });
    }
  }
  if (saved.length === 0) {
    return;
  }
  for (const stack of saved) {
    ctx.addItem(stack.itemId, stack.quantity, { silent: true });
  }
  ctx.log(`Your ${SKILL_NAMES[skill]} skill saved some materials: ${describeStacks(saved)}.`, 'good');
}

/** What a building used up when it was started before the materials were recorded: the cheapest item of each ingredient. */
function assumedUse(ingredients: readonly Ingredient[]): InventoryStack[][] {
  return ingredients.map((i) => [{ itemId: 'itemId' in i ? i.itemId : (itemsOfType(i.type)[0]?.id ?? ''), quantity: i.quantity }]);
}

function signed(value: number): string {
  return `${value > 0 ? '+' : '−'}${Math.abs(Math.round(value))}`;
}

function locationActions(state: GameState): GameAction[] {
  const hut = getLocationState(state, state.player.locationId).buildings.hut !== undefined;
  const untilMorning = minutesUntilHour(state.time, SURVIVAL_RULES.wakeUpHour);
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
    sleepAction('sleep', 'Sleep', hours(8), hut),
    ...(untilMorning > 0 && untilMorning <= hours(SURVIVAL_RULES.sleepTillMorningMaxHours)
      ? [sleepAction('sleep-till-morning', 'Sleep till morning', untilMorning, hut)]
      : []),
  ];
}

function sleepAction(id: string, label: string, minutes: number, hut: boolean): GameAction {
  const energy = Math.round(
    (minutes / 60) * (SURVIVAL_RULES.energyRegenPerHour.sleeping + (hut ? SURVIVAL_RULES.shelteredSleepEnergyBonusPerHour : 0)),
  );
  return {
    id,
    label,
    category: 'location',
    description:
      id === 'sleep'
        ? 'Sleep through the next hours. A hut makes it far more restful.'
        : `Sleep until ${String(SURVIVAL_RULES.wakeUpHour).padStart(2, '0')}:00. A hut makes it far more restful.`,
    details: `Only possible when your energy is below ${SURVIVAL_RULES.sleepBelowEnergy}. Thirst and hunger grow more slowly while you sleep, and health recovers faster.`,
    gains: [{ label: `+${energy} energy${hut ? ' (hut)' : ''}` }, { label: 'Faster healing' }],
    minutes,
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
  };
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
    skill: def.skill,
    object,
    targetId: object.id,
    run: def.run,
  };
}

/** Whether an object is present (hidden objects are present, just not listed). */
export function isObjectPresent(state: GameState, object: ObjectDef): boolean {
  return object.visibleIf?.(state) ?? true;
}

/** Id under which a location's own actions and stocks are kept, as if they belonged to a hidden object. */
export const LOCATION_OBJECT_ID = 'location';

function locationObject(def: LocationDef): ObjectDef {
  return {
    id: LOCATION_OBJECT_ID,
    name: def.name,
    description: def.description,
    hidden: true,
    stocks: def.stocks,
    actions: def.actions ?? [],
  };
}

function objectActions(state: GameState): GameAction[] {
  const location = getLocationDef(state.player.locationId);
  return [...location.objects, locationObject(location)]
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
        description: 'Coax a new fire out of fresh tinder.',
        gains: [{ label: `Fire burns ${formatDuration(CAMPFIRE_INITIAL_BURN)}` }],
        minutes: 15,
        energy: 2,
        requirements: relight.map(ingredient),
        block: (s) =>
          isRaining(s) && !roofAt(s, s.player.locationId) ? 'It is raining: the fire will not catch until the rain stops' : undefined,
        run: (ctx) => {
          consumeIngredients(ctx, relight);
          const campfire = ctx.location().buildings.campfire;
          if (campfire) {
            campfire.litUntil = ctx.state.time + CAMPFIRE_INITIAL_BURN;
          }
          ctx.log('You blow on the smouldering tinder until it catches. The fire crackles back to life.', 'good');
        },
      },
    ];
  }
  const fuels = itemsOfType('fuel').filter((def) => countItem(state.player, def.id) > 0);
  const cookables = state.player.inventory
    .map((stack) => getItemDef(stack.itemId))
    .filter((def): def is FoodDef => def.category === 'food' && def.cooksInto !== undefined);
  // why: sitting by the fire only helps against the cold, so it is not offered otherwise.
  const sit: GameAction[] = canWarmUp(state)
    ? [
        {
          ...base,
          id: 'campfire:sit',
          label: 'Sit next to the fire',
          description: 'Warm yourself and dry off by the flames.',
          details: 'Offered while the island is Very Cold or you are freezing or wet.',
          gains: [
            { label: 'The hour until you freeze starts over' },
            { label: `Freezing −${ENVIRONMENT_RULES.recoveryMinutes} min` },
            { label: `Wet −${ENVIRONMENT_RULES.recoveryMinutes} min` },
          ],
          minutes: 5,
          requirements: [],
          run: (ctx) => {
            warmUp(ctx);
            ctx.log('You sit close to the fire and let its warmth soak into you.', 'good');
          },
        },
      ]
    : [];
  return [
    ...sit,
    ...fuels.map((def): GameAction => ({
      ...base,
      id: `campfire:fuel:${def.id}`,
      label: def.name,
      itemId: def.id,
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
      itemId: def.id,
      description: `Turns it into ${getItemDef(def.cooksInto as string).name.toLowerCase()}.`,
      details: 'Cooked food is more filling and safe to eat.',
      gains: resolveGains(state, [{ itemId: def.cooksInto as string }]),
      minutes: 15,
      requirements: [],
      trains: { perception: 1 },
      run: (ctx) => {
        ctx.removeItem(def.id);
        ctx.log(`You cook the ${def.name.toLowerCase()} over the fire.`);
        ctx.addItem(def.cooksInto as string);
      },
    })),
  ];
}

/** Water in a rain collector for display: rounded down to tenths of a bottle, e.g. "1.5". */
export function formatWater(water: number): string {
  return String(Math.floor(water * 10 + 1e-9) / 10);
}

/** Drinking, filling a bottle and washing your face with the water of a rain collector where the player is. */
function rainCollectorActions(state: GameState): GameAction[] {
  if (!getLocationState(state, state.player.locationId).buildings.rainCollector) {
    return [];
  }
  const bottle = getItemDef('water-bottle');
  const hydration = bottle.category === 'food' ? bottle.hydration : 0;
  const base = { category: 'building' as const, energy: 0, timeMode: 'awake' as const, targetId: 'rainCollector', requirements: [] };
  const water = (s: GameState) => getLocationState(s, s.player.locationId).buildings.rainCollector?.water ?? 0;
  const lacks = (s: GameState, amount: number) => (water(s) + 1e-9 < amount ? 'Not enough water in the collector' : undefined);
  const use = (ctx: ActionContext, amount: number) => {
    const collector = ctx.location().buildings.rainCollector;
    if (collector) {
      collector.water = Math.max(0, collector.water - amount);
    }
  };
  const wash: GameAction = {
    ...base,
    id: 'rainCollector:wash',
    label: 'Wash your face',
    description: 'Splash cool rainwater on your face and neck.',
    details: `Offered while the island is Very Hot or you are overheated. Uses ${COLLECTOR_WASH_WATER} bottles of water from the collector.`,
    gains: [{ label: 'The hour until you overheat starts over' }, { label: `Overheated −${ENVIRONMENT_RULES.recoveryMinutes} min` }],
    minutes: 5,
    energy: 1,
    block: (s) => lacks(s, COLLECTOR_WASH_WATER),
    run: (ctx) => {
      use(ctx, COLLECTOR_WASH_WATER);
      coolDown(ctx);
      ctx.log('You splash rainwater on your face and neck. It feels wonderful.', 'good');
    },
  };
  return [
    {
      ...base,
      id: 'rainCollector:drink',
      label: 'Drink',
      description: 'Drink a bottle of rainwater from the collector.',
      details: 'Uses 1 bottle of water from the collector.',
      gains: [{ label: `−${hydration} thirst` }],
      minutes: 2,
      block: (s) => lacks(s, 1) ?? (s.player.stats.thirst <= 0 ? 'You are not thirsty' : undefined),
      run: (ctx) => {
        use(ctx, 1);
        const change = ctx.changeStat('thirst', -hydration);
        ctx.log(`You drink rainwater from the collector.${change < 0 ? ` (−${Math.round(-change)} thirst)` : ''}`, 'good');
      },
    },
    {
      ...base,
      id: 'rainCollector:fill',
      label: 'Fill a bottle',
      itemId: 'water-bottle',
      description: 'Fill an empty bottle with rainwater.',
      details: 'Uses 1 bottle of water from the collector.',
      gains: resolveGains(state, [{ itemId: 'water-bottle' }]),
      minutes: 2,
      requirements: [ingredient({ itemId: 'empty-bottle', quantity: 1 })],
      block: (s) => lacks(s, 1),
      run: (ctx) => {
        use(ctx, 1);
        ctx.removeItem('empty-bottle');
        ctx.log('You fill a bottle with rainwater.');
        ctx.addItem('water-bottle');
      },
    },
    ...(canCoolDown(state) ? [wash] : []),
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
      travel: true,
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
    label: `Pick up ${formatAmount(ground.itemId, ground.quantity, ground.health)}`,
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
      ctx.addItem(current.itemId, fits, { silent: true, health: current.health });
      ctx.log(`You pick up ${formatAmount(current.itemId, fits, current.health).toLowerCase()}.`);
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
    gains: [
      ...effects.map((label) => ({ label })),
      ...(def.byproducts ?? []).map((b) => ({ label: getItemDef(b.itemId).name, itemId: b.itemId, chance: b.chance })),
    ],
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
      if (def.foodGroup) {
        const player = ctx.state.player;
        const emptyBefore = emptyFoodGroups(player);
        feedFoodGroup(player, def.foodGroup);
        const emptyAfter = emptyFoodGroups(player);
        const ranOut = emptyAfter.filter((id) => !emptyBefore.includes(id));
        if (ranOut.length > 0) {
          ctx.log(`Your body craves ${foodGroupList(ranOut)}. You are suffering from malnutrition.`, 'bad');
        } else if (emptyBefore.length > 0 && emptyAfter.length === 0) {
          ctx.log('Your diet is balanced again. The malnutrition is over.', 'good');
        }
      }
      for (const risk of def.risks ?? []) {
        if (ctx.chance(risk.chance)) {
          ctx.addTimedCondition(risk.condition, risk.severity);
        }
      }
      for (const byproduct of def.byproducts ?? []) {
        if (ctx.chance(byproduct.chance)) {
          ctx.addItem(byproduct.itemId);
        }
      }
    },
  };
}

function slotsFor(def: EquipmentDef): EquipSlot[] {
  return def.slot === 'hand' ? [...HAND_SLOTS] : [def.slot];
}

/** Equips the bag entry with the given key (see `entryKey`) into a slot. */
function equipAction(def: EquipmentDef, slot: EquipSlot, key: string): GameAction {
  const name = def.name.toLowerCase();
  const hand = isHandSlot(slot);
  const wearing = def.maxHealth === undefined ? '' : ` Worn, it loses ${ITEM_WEAR_PER_DAY} health a day and falls apart at 0.`;
  return {
    id: `equip:${key}:${slot}`,
    label: hand ? `Hold in ${SLOT_LABELS[slot]}` : 'Wear',
    category: 'item',
    details: hand
      ? 'Held items work as tools and weapons. A fractured, splinted or missing arm cannot hold anything.'
      : `Wear it on your ${SLOT_LABELS[slot]}.${wearing}`,
    gains: describeClothing(def.clothing).map((effect) => ({ label: `${effect.name}: ${effect.hint}` })),
    minutes: 1,
    energy: 0,
    timeMode: 'awake',
    requirements: [],
    targetId: key,
    block: (s) =>
      isHandSlot(slot) && !canHoldWith(s.player, HAND_ARM[slot]) ? `Your ${bodyPartName(HAND_ARM[slot])} cannot hold anything` : undefined,
    run: (ctx) => {
      const player = ctx.state.player;
      const item = takeFromEntry(player.inventory, key, 1);
      if (!item) {
        return;
      }
      const previous = unequip(player, slot);
      player.equipment[slot] = item.health === undefined ? { itemId: item.itemId } : { itemId: item.itemId, health: item.health };
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
  player.inventory.forEach((stack, index) => {
    const def = getItemDef(stack.itemId);
    const key = entryKey(player.inventory, index);
    if (def.category === 'food') {
      actions.push(eatAction(def));
    }
    if (def.category === 'equipment') {
      actions.push(...slotsFor(def).map((slot) => equipAction(def, slot, key)));
    }
    const drop = (all: boolean): GameAction => ({
      id: `drop:${key}:${all ? 'all' : 'one'}`,
      label: all ? 'Drop all' : 'Drop',
      category: 'item',
      details: `Dropped items stay on the ground for ${formatDuration(def.groundLifetime)}, then they are gone.`,
      minutes: 0,
      energy: 0,
      timeMode: 'awake',
      requirements: [],
      targetId: key,
      run: (ctx) => {
        const inventory = ctx.state.player.inventory;
        const item = takeFromEntry(inventory, key, all ? (findEntry(inventory, key)?.quantity ?? 0) : 1);
        if (item) {
          dropOnGround(ctx.state, ctx.state.player.locationId, item.itemId, item.quantity, item.health);
          ctx.log(`You drop ${formatAmount(item.itemId, item.quantity, item.health).toLowerCase()} on the ground.`);
        }
      },
    });
    actions.push(drop(false));
    if (stack.quantity > 1) {
      actions.push(drop(true));
    }
  });
  return actions;
}

/** Store and take actions for a small storage at the player's location, one set per bag or storage entry. */
function storageActions(state: GameState): GameAction[] {
  const storage = getLocationState(state, state.player.locationId).buildings.storage;
  if (!storage) {
    return [];
  }
  const storageFree = (s: GameState): number =>
    STORAGE_CAPACITY - stackWeight(getLocationState(s, s.player.locationId).buildings.storage?.items ?? []);
  const base = { category: 'storage' as const, minutes: 1, energy: 0, timeMode: 'awake' as const, requirements: [] };
  const store = (itemId: string, key: string, all: boolean): GameAction => ({
    ...base,
    id: `store:${key}:${all ? 'all' : 'one'}`,
    label: all ? 'Store all' : 'Store',
    details: `Stored items never rot. The storage holds ${STORAGE_CAPACITY} kg.`,
    targetId: key,
    block: (s) => (unitsThatFit(itemId, storageFree(s), 1) < 1 ? 'The storage is full' : undefined),
    run: (ctx) => {
      const items = ctx.location().buildings.storage?.items;
      const inventory = ctx.state.player.inventory;
      const amount = unitsThatFit(itemId, storageFree(ctx.state), all ? (findEntry(inventory, key)?.quantity ?? 0) : 1);
      const item = items && takeFromEntry(inventory, key, amount);
      if (!items || !item) {
        return;
      }
      addToStacks(items, item.itemId, item.quantity, item.health);
      ctx.log(`You put ${formatAmount(item.itemId, item.quantity, item.health).toLowerCase()} into storage.`);
    },
  });
  const take = (itemId: string, key: string, all: boolean): GameAction => ({
    ...base,
    id: `take:${key}:${all ? 'all' : 'one'}`,
    label: all ? 'Take all' : 'Take',
    details: 'Takes as much as you can carry.',
    targetId: key,
    block: (s) => (unitsThatFit(itemId, freeCapacity(s), 1) < 1 ? 'Too heavy to carry' : undefined),
    run: (ctx) => {
      const items = ctx.location().buildings.storage?.items;
      const wanted = all ? items && findEntry(items, key)?.quantity : 1;
      const item = items && takeFromEntry(items, key, unitsThatFit(itemId, freeCapacity(ctx.state), wanted ?? 0));
      if (!item) {
        return;
      }
      addToInventory(ctx.state.player, item.itemId, item.quantity, item.health);
      ctx.log(`You take ${formatAmount(item.itemId, item.quantity, item.health).toLowerCase()} from storage.`);
    },
  });
  const forEntries = (
    stacks: readonly { itemId: string; quantity: number }[],
    action: (itemId: string, key: string, all: boolean) => GameAction,
  ): GameAction[] =>
    stacks.flatMap((s, index) => {
      const key = entryKey(stacks, index);
      return s.quantity > 1 ? [action(s.itemId, key, false), action(s.itemId, key, true)] : [action(s.itemId, key, false)];
    });
  return [...forEntries(state.player.inventory, store), ...forEntries(storage.items, take)];
}

function newBuilding(id: BuildingId, time: number): LocationBuildings {
  switch (id) {
    case 'campfire':
      return { campfire: { builtAt: time, litUntil: time + CAMPFIRE_INITIAL_BURN } };
    case 'storage':
      return { storage: { builtAt: time, items: [] } };
    case 'rainCollector':
      return { rainCollector: { builtAt: time, water: 0 } };
    default:
      return { [id]: { builtAt: time } };
  }
}

/** Building steps for the buildings this location allows: starting new ones and continuing unfinished ones. */
function buildActions(state: GameState): GameAction[] {
  const locationId = state.player.locationId;
  const location = getLocationState(state, locationId);
  return (getLocationDef(locationId).buildings ?? [])
    .map((id) => BUILDINGS[id])
    .filter((building) => location.buildings[building.id] === undefined)
    .map((building): GameAction => {
      const started = location.constructions[building.id] !== undefined;
      const step = (location.constructions[building.id]?.stepsDone ?? 0) + 1;
      const name = building.name.toLowerCase();
      const minutes = skilledMinutes(BUILDING_STEP_MINUTES, skillLevel(state.player, 'building'));
      return {
        id: `build:${building.id}`,
        label: started ? `Continue building (step ${step} of ${building.steps})` : 'Start building',
        category: 'build',
        description: building.description,
        details:
          `Building takes ${building.steps} ${building.steps === 1 ? 'step' : 'steps'} of ${formatDuration(minutes)}. ` +
          'The materials are used up by the first step; tools are needed for every step.',
        gains: [{ label: step >= building.steps ? `The ${name} is finished` : `Step ${step} of ${building.steps} done` }],
        minutes,
        energy: BUILDING_STEP_ENERGY,
        timeMode: 'awake',
        requirements: [workingArm(), ...(started ? [] : building.ingredients.map(ingredient)), ...(building.tools ?? [])],
        block: started
          ? undefined
          : (s) => (allocateIngredients(s.player, building.ingredients) ? undefined : 'Not enough materials for all ingredients'),
        trains: building.trains,
        skill: 'building',
        targetId: building.id,
        run: (ctx) => {
          const target = ensureLocationState(ctx.state, locationId);
          const nameBefore = getLocationInfo(ctx.state, locationId).name;
          const current = target.constructions[building.id];
          let used = current?.used;
          if (!current) {
            used = useUpIngredients(ctx, building.ingredients);
            ctx.log(`You start building the ${name}. (Used: ${describeStacks(used.flat())})`, 'info');
          }
          const done = (current?.stepsDone ?? 0) + 1;
          const constructions = { ...target.constructions };
          if (done >= building.steps) {
            delete constructions[building.id];
            target.buildings = { ...target.buildings, ...newBuilding(building.id, ctx.state.time) };
            ctx.log(building.message, 'good');
            giveBackResources(ctx, 'building', used ?? assumedUse(building.ingredients));
          } else {
            constructions[building.id] = used ? { stepsDone: done, used } : { stepsDone: done };
            ctx.log(`You work on the ${name}. ${done} of ${building.steps} steps done.`);
          }
          target.constructions = constructions;
          const nameAfter = getLocationInfo(ctx.state, locationId).name;
          if (nameAfter !== nameBefore) {
            ctx.log(`The ${nameBefore.toLowerCase()} is starting to feel like home. This is your ${nameAfter.toLowerCase()} now.`, 'info');
          }
        },
      };
    });
}

function craftActions(state: GameState): GameAction[] {
  const level = skillLevel(state.player, 'crafting');
  return RECIPES.filter((recipe) => recipe.visibleIf?.(state) ?? true).map((recipe) => ({
    id: `craft:${recipe.id}`,
    label: recipe.name,
    category: 'craft',
    description: recipe.description,
    details: 'Ingredients that ask for a type accept any item of that type; the cheapest ones are used first.',
    gains: resolveGains(state, [{ itemId: recipe.result.itemId, quantity: recipe.result.quantity }]),
    minutes: skilledMinutes(recipe.minutes, level),
    energy: CRAFT_ENERGY,
    timeMode: 'awake',
    requirements: [workingArm(), ...recipe.ingredients.map(ingredient), ...(recipe.tools ?? []), ...(recipe.stations ?? []).map(station)],
    block: (s) => (allocateIngredients(s.player, recipe.ingredients) ? undefined : 'Not enough materials for all ingredients'),
    trains: recipe.trains,
    skill: 'crafting' as const,
    targetId: recipe.id,
    run: (ctx: ActionContext) => {
      const used = useUpIngredients(ctx, recipe.ingredients);
      const { craftedRecipes } = ctx.state.player;
      if (!craftedRecipes.includes(recipe.id)) {
        craftedRecipes.push(recipe.id);
      }
      ctx.log(recipe.message);
      if (used.length > 0) {
        ctx.log(`Used: ${describeStacks(used.flat())}`, 'info');
      }
      ctx.addItem(recipe.result.itemId, recipe.result.quantity);
      giveBackResources(ctx, 'crafting', used);
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

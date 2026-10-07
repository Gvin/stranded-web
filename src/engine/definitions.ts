import type { Severity } from './conditions';
import type { ActionContext } from './context';
import type { IconName } from '../icons/gameIcons';
import type { AttributeId, BuildingId, BuildingSlot, GameState, NutrientId, SkillId, TimedConditionId, WeatherId } from './types';

// Static content definitions (items, locations, recipes, buildings). They are code, not save data, but renaming or
// removing an item, location or object id breaks saves that refer to it and needs a save migration.

export type ItemCategory = 'resource' | 'food' | 'equipment';

/** Crafting types: a recipe asking for a type accepts any item that has it. */
export type ResourceType =
  | 'stick'
  | 'fuel'
  | 'heavy'
  | 'stone'
  | 'threads'
  | 'rope'
  | 'sharp'
  | 'knife'
  | 'cloth'
  | 'pebble'
  | 'feather'
  | 'coconut_shell'
  | 'bottle'
  | 'glue';

export type AttributeXp = Partial<Record<AttributeId, number>>;

/** How the passing time of an action affects the body. */
export type TimeMode = 'awake' | 'resting' | 'sleeping';

export interface Requirement {
  describe(): string;
  test(state: GameState): boolean;
}

interface ItemDefBase {
  id: string;
  name: string;
  /** One item in a sentence, with its article: "a stick", "an axe", "a bunch of grass". */
  singular: string;
  /** Several items in a sentence, after a number: "sticks", "bunches of grass". */
  plural: string;
  description: string;
  /** Weight in kg of a single unit. */
  weight: number;
  /** Game minutes an item lies on the ground before it disappears. */
  groundLifetime: number;
  types?: readonly ResourceType[];
  /** Fuel one unit adds to a fire (a Campfire burns 1 an hour); required for items of the fuel type. */
  fuel?: number;
  icon: IconName;
  /** Small badge drawn over the icon, e.g. to tell cooked food from raw food with a similar icon. */
  iconBadge?: 'cooked';
  /** Full health of an item that wears out while worn; such items never stack. */
  maxHealth?: number;
  /** Can be lit, and then burns down wherever it is (a torch; see TORCH_BURN_PER_HOUR). */
  lightable?: boolean;
}

export interface ResourceDef extends ItemDefBase {
  category: 'resource';
  /** Makes the item an arrow, equipped in the arrow slot: what it adds to ranged damage and accuracy, and its chance to be lost per shot. */
  arrow?: WeaponStats & { lossChance: number };
}

/** Damage and accuracy (a fraction, 0.1 = 10%) a weapon gives or adds. */
export interface WeaponStats {
  damage: number;
  accuracy: number;
}

export interface FoodRisk {
  condition: TimedConditionId;
  chance: number;
  severity: Severity;
}

export interface FoodDef extends ItemDefBase {
  category: 'food';
  verb: 'eat' | 'drink';
  /** How much hunger the food takes away. */
  nutrition: number;
  /** Food group the food feeds (see NUTRITION_RULES); water belongs to none. */
  foodGroup?: NutrientId;
  hydration: number;
  energy?: number;
  risks?: readonly FoodRisk[];
  /** Item this food turns into when cooked over a campfire. */
  cooksInto?: string;
  /** Items that may be left over after eating, e.g. an empty shell. */
  byproducts?: readonly { itemId: string; chance: number }[];
  requires?: Requirement[];
}

/** What a worn item does against the environment and in fights. */
export interface ClothingEffects {
  /** Cold and Very Cold body temperature one step warmer, on top of heating. */
  warmth?: boolean;
  /** Hot and Very Hot body temperature one step cooler, like a roof (it does not add to a roof). */
  shade?: boolean;
  /** Rainy and Stormy weather do not make the player wet. */
  waterproof?: boolean;
  /** Armor points; each stops one point of damage from every hit. */
  armor?: number;
}

/** Items that are held in a hand or worn on the head or body. */
export interface EquipmentDef extends ItemDefBase {
  category: 'equipment';
  slot: 'hand' | 'head' | 'body';
  clothing?: ClothingEffects;
  /** Added to melee damage and accuracy while held in the weapon hand. */
  melee?: WeaponStats;
  /** Base ranged damage and accuracy while held in the weapon hand, shooting the arrows in the arrow slot. */
  ranged?: WeaponStats;
  /** Takes both hands: it is kept in the right hand, the left one cannot hold anything else, and it needs both arms. */
  twoHanded?: boolean;
}

export type ItemDef = ResourceDef | FoodDef | EquipmentDef;

/** Something an action may give, shown in its details popup. */
export type GainDef =
  | {
      itemId: string;
      quantity?: number | readonly [number, number];
      /** Chance to get it at all; undefined means certain. */
      chance?: number;
      /** The chance improves with perception, like searching. */
      perception?: boolean;
      /** A find: its chance improves with the Foraging skill. */
      find?: boolean;
    }
  | { text: string; chance?: number };

/** A recipe ingredient: either one specific item or any item of a crafting type. */
export type Ingredient = { itemId: string; quantity: number } | { type: ResourceType; quantity: number };

export interface ActionDef {
  id: string;
  label: string;
  description?: string;
  /** Longer explanation for the details popup: how it works and what can go wrong. */
  details?: string;
  /** What the action may give; a function when it depends on the state (e.g. chances from attributes). */
  gains?: readonly GainDef[] | ((state: GameState) => readonly GainDef[]);
  /** Base duration in game minutes. */
  minutes: number;
  energy?: number;
  /** Attribute that makes the action faster (higher value = shorter duration). */
  speedAttribute?: AttributeId;
  timeMode?: TimeMode;
  requires?: Requirement[];
  /** Hides the action entirely (as opposed to showing it as unavailable). */
  visibleIf?: (state: GameState) => boolean;
  /** The action is unavailable while the parent object has no stock left (true: main stock, string: a named stock). */
  usesStock?: boolean | string;
  /** Extra availability rule; returns the reason when the action is blocked. */
  block?: (state: GameState) => string | undefined;
  trains?: AttributeXp;
  /** The skill the action trains; Foraging actions also get better finds and more gathered items with it. */
  skill?: SkillId;
  run(ctx: ActionContext): void;
}

export interface StockDef {
  initial: number;
  max: number;
  /** Game minutes to regrow one unit. */
  regenMinutes: number;
}

export interface ObjectDef {
  id: string;
  name: string;
  description: string;
  /** Hidden objects are not listed in the UI, but their actions are still available. */
  hidden?: boolean;
  visibleIf?: (state: GameState) => boolean;
  stock?: StockDef;
  /** Additional stocks the object's actions can use by name. */
  stocks?: Record<string, StockDef>;
  /** Short status shown next to the object (from the main stock), e.g. "a few coconuts left". */
  stockText?: (amount: number, max: number) => string;
  actions: ActionDef[];
}

export type LocationType = 'beach' | 'forest' | 'spring' | 'rocks' | 'clearing' | 'camp' | 'path';

export interface LocationInfo {
  name: string;
  type: LocationType;
  description: string;
}

export interface LocationDef extends LocationInfo {
  id: string;
  objects: ObjectDef[];
  /** Actions of the location itself rather than of one of its objects (shown under "Around you"). */
  actions?: ActionDef[];
  /** Named stocks the location's own actions can use. */
  stocks?: Record<string, StockDef>;
  /** Buildings that can be built here; a level is offered once the level before it stands. */
  buildings?: readonly BuildingId[];
  /** Name, type and description that replace the defaults once something is built here. */
  whenBuilt?: LocationInfo;
  onArrive?: (ctx: ActionContext) => void;
}

/** A two-way path between locations. */
export interface RouteDef {
  between: readonly [string, string];
  minutes: number;
  energy: number;
  /** The route is unknown (and not offered) until this flag is set. */
  requiresFlag?: string;
}

/** How well the player sleeps in a location: per hour asleep, and the condition they wake up with. */
export interface SleepDef {
  energyPerHour: number;
  healthPerHour: number;
  condition?: TimedConditionId;
  /** Where the player sleeps, for the Sleep action: "on your sleeping mat". */
  where: string;
  /** Logged on waking up. */
  message: string;
}

/** Something the player can build at the locations that list it. */
export interface BuildingDef {
  id: BuildingId;
  /** The slot it stands in; one building per slot and location. */
  slot: BuildingSlot;
  /** 1 for the first building of its slot; each higher level is built on top of the one below and replaces it. */
  level: number;
  name: string;
  description: string;
  icon: IconName;
  /** Building is done in steps; every step takes BUILDING_STEP_MINUTES and BUILDING_STEP_ENERGY. */
  steps: number;
  /** Materials, all used up by the first step. */
  ingredients: readonly Ingredient[];
  /** Tools that are needed for every step but not consumed. */
  tools?: readonly Requirement[];
  /** Logged when the building is finished. */
  message: string;
  trains?: AttributeXp;
  /** Gives its location a roof: shelter from heat and rain. */
  roof?: boolean;
  /** How well the player sleeps where it stands. */
  sleep?: SleepDef;
  /**
   * A fire: holds up to `capacity` fuel and burns `burnPerHour` of it while lit, warming its location. Rain puts it
   * out, roof or not, unless it is `rainproof`.
   */
  fire?: { capacity: number; burnPerHour: number; rainproof?: boolean };
  /** Storage that keeps items safe, holding up to `capacity` kg. */
  storage?: { capacity: number };
  /** Collects rainwater, whatever roof the location has: holds `capacity` bottles, filling at `bottlesPerHour` times the rainfall. */
  collector?: { capacity: number; bottlesPerHour: number };
}

export interface WeatherDef {
  id: WeatherId;
  name: string;
  icon: IconName;
  /** Steps added to the temperature of the time of day. */
  temperature: number;
  /** Chance to be picked when the previous weather ends. */
  chance: number;
  /** Shortest and longest duration in hours. */
  hours: readonly [number, number];
  /** How hard it rains (1 = steady rain): it makes the player wet, puts out fires and torches, and fills rain collectors. */
  rainfall?: number;
  /** The sea is too rough to dive. */
  storm?: boolean;
  /** Logged when this weather begins. */
  message: string;
}

export interface RecipeDef {
  id: string;
  name: string;
  description: string;
  minutes: number;
  ingredients: readonly Ingredient[];
  /** Tools that are needed but not consumed. */
  tools?: readonly Requirement[];
  /** Building slots (e.g. "workbench"; a "fire" must be lit) or location objects that must be present where the recipe is made. */
  stations?: readonly string[];
  result: { itemId: string; quantity: number };
  /** Logged when the recipe is completed. */
  message: string;
  visibleIf?: (state: GameState) => boolean;
}

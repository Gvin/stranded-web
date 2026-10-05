import type { Severity } from './conditions';
import type { ActionContext } from './context';
import type { AttributeId, BuildingId, GameState, TimedConditionId } from './types';

// Static content definitions (items, locations, recipes, buildings). They are code, not save data, but renaming or
// removing an item, location or object id breaks saves that refer to it and needs a save migration.

export type ItemCategory = 'resource' | 'food' | 'equipment';

/** Crafting types: a recipe asking for a type accepts any item that has it. */
export type ResourceType = 'stick' | 'fuel' | 'heavy' | 'stone' | 'threads' | 'rope' | 'sharp' | 'knife' | 'cloth';

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
  description: string;
  /** Weight in kg of a single unit. */
  weight: number;
  /** Game minutes an item lies on the ground before it disappears. */
  groundLifetime: number;
  types?: readonly ResourceType[];
  /** Game minutes one unit keeps a campfire burning; required for items of the fuel type. */
  fuelMinutes?: number;
}

export interface ResourceDef extends ItemDefBase {
  category: 'resource';
}

export interface FoodRisk {
  condition: TimedConditionId;
  chance: number;
  severity: Severity;
}

export interface FoodDef extends ItemDefBase {
  category: 'food';
  verb: 'eat' | 'drink';
  nutrition: number;
  hydration: number;
  energy?: number;
  risks?: readonly FoodRisk[];
  /** Item this food turns into when cooked over a campfire. */
  cooksInto?: string;
  requires?: Requirement[];
}

/** Items that are held in a hand or worn on the head or body. */
export interface EquipmentDef extends ItemDefBase {
  category: 'equipment';
  slot: 'hand' | 'head' | 'body';
  /** Bonus added to fighting and hunting power while held. */
  combat?: number;
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

export type LocationType = 'beach' | 'forest' | 'spring' | 'rocks' | 'clearing' | 'camp';

export interface LocationInfo {
  name: string;
  type: LocationType;
  description: string;
}

export interface LocationDef extends LocationInfo {
  id: string;
  objects: ObjectDef[];
  /** Buildings can only be built at buildable locations. */
  buildable?: boolean;
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

export interface BuildingDef {
  id: BuildingId;
  name: string;
  description: string;
}

export interface RecipeDef {
  id: string;
  name: string;
  description: string;
  minutes: number;
  energy: number;
  ingredients: readonly Ingredient[];
  /** Tools that are needed but not consumed. */
  tools?: readonly Requirement[];
  /** Buildings or location objects that must be present where the recipe is made (a campfire must be lit). */
  stations?: readonly string[];
  result?: { itemId: string; quantity: number };
  /** Builds this building at the current location instead of producing an item. */
  builds?: BuildingId;
  /** Logged when the recipe is completed. */
  message: string;
  visibleIf?: (state: GameState) => boolean;
  trains?: AttributeXp;
}

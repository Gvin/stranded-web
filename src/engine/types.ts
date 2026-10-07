// Persisted game state. Every change to the shapes in this file is a save format change:
// bump SAVE_VERSION and add a migration in src/save/migrations.ts.

export type AttributeId = 'strength' | 'endurance' | 'perception' | 'agility';
export const ATTRIBUTE_IDS: readonly AttributeId[] = ['strength', 'endurance', 'perception', 'agility'];

/** Health and energy: higher is better. Thirst and hunger: lower is better (0 = not thirsty or hungry at all). */
export type StatId = 'health' | 'thirst' | 'hunger' | 'energy';
export const STAT_IDS: readonly StatId[] = ['health', 'thirst', 'hunger', 'energy'];

/** Food groups the player needs a balance of. */
export type NutrientId = 'vegetables' | 'meat' | 'fruits';
export const NUTRIENT_IDS: readonly NutrientId[] = ['vegetables', 'meat', 'fruits'];

export type BodyPartId = 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
export const BODY_PART_IDS: readonly BodyPartId[] = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

export type BodyConditionId = 'injured' | 'bleeding' | 'fractured' | 'burnt' | 'missing' | 'bandaged' | 'splinted';

/** Player-wide conditions that are stored and wear off over time (the rest are derived from stats). */
export type TimedConditionId =
  'poisoned' | 'dizzy' | 'wet' | 'overheated' | 'freezing' | 'awfulSleep' | 'badSleep' | 'goodSleep' | 'perfectSleep';

export type SkillId = 'fighting' | 'farming' | 'building' | 'foraging' | 'crafting';
export const SKILL_IDS: readonly SkillId[] = ['fighting', 'farming', 'building', 'foraging', 'crafting'];

export interface SkillState {
  /** 0 to SKILL_RULES.maxLevel. */
  level: number;
  /** Practice towards the next level. */
  points: number;
}

/** Island-wide weather. */
export type WeatherId = 'clear' | 'cloudy' | 'windy' | 'rainy' | 'stormy';
export const WEATHER_IDS: readonly WeatherId[] = ['clear', 'cloudy', 'windy', 'rainy', 'stormy'];

export type EquipSlot = 'head' | 'body' | 'leftHand' | 'rightHand';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['head', 'body', 'leftHand', 'rightHand'];
export type HandSlot = 'leftHand' | 'rightHand';
export const HAND_SLOTS: readonly HandSlot[] = ['leftHand', 'rightHand'];

/** Every building; buildings that improve on each other share a slot (see BUILDING_SLOTS) as its levels. */
export type BuildingId =
  | 'sleepingMat'
  | 'shelter'
  | 'hut'
  | 'house'
  | 'campfire'
  | 'fireplace'
  | 'furnace'
  | 'basicWorkbench'
  | 'workbench'
  | 'smallStorage'
  | 'mediumStorage'
  | 'bigStorage'
  | 'rainCollector';
export const BUILDING_IDS: readonly BuildingId[] = [
  'sleepingMat',
  'shelter',
  'hut',
  'house',
  'campfire',
  'fireplace',
  'furnace',
  'basicWorkbench',
  'workbench',
  'smallStorage',
  'mediumStorage',
  'bigStorage',
  'rainCollector',
];

/** A place for one building per location; its buildings are levels, each built on top of the one before. */
export type BuildingSlot = 'house' | 'fire' | 'workbench' | 'storage' | 'rainCollector';
export const BUILDING_SLOTS: readonly BuildingSlot[] = ['house', 'fire', 'workbench', 'storage', 'rainCollector'];

export type LogTone = 'neutral' | 'good' | 'bad' | 'info';

export interface BodyCondition {
  id: BodyConditionId;
  /**
   * Healing left in game minutes at normal healing speed; absent when the condition never heals by itself.
   * For conditions with severities it also decides the current severity.
   */
  remaining?: number;
}

export interface TimedCondition {
  id: TimedConditionId;
  /** Game minutes until the condition wears off; also decides the current severity. */
  remaining: number;
}

export interface AttributeState {
  base: number;
  /** Training progress towards the next base point. */
  xp: number;
}

export interface InventoryStack {
  itemId: string;
  quantity: number;
  /** Health left, for items that wear out. Such items never stack: their quantity is always 1. */
  health?: number;
  /** Set while the item burns (a lit torch). */
  lit?: boolean;
}

/** An item held in a hand or worn. */
export interface EquippedItem {
  itemId: string;
  /** Health left, for items that wear out. */
  health?: number;
  /** Set while the item burns (a lit torch). */
  lit?: boolean;
}

export interface GroundItem {
  id: number;
  itemId: string;
  quantity: number;
  droppedAt: number;
  /** Health left, for items that wear out (always a single item). */
  health?: number;
  /** Set while the item burns (a lit torch). */
  lit?: boolean;
}

export interface ObjectStock {
  amount: number;
  /** Game minute the regeneration was last accounted for. */
  updatedAt: number;
}

export interface LocationState {
  visited: boolean;
  groundItems: GroundItem[];
  /** Remaining resources per object id, or "objectId:stockName" for an object's named stocks. */
  stock: Record<string, ObjectStock>;
  /** How many times each limited find has already been found. */
  finds: Record<string, number>;
  buildings: LocationBuildings;
  /** Buildings started here but not finished yet. */
  constructions: Partial<Record<BuildingId, Construction>>;
}

export interface Construction {
  /** Building steps done so far; the materials were used up by the first one. */
  stepsDone: number;
  /** The items used up for each of the building's ingredients, in their order; absent for buildings started before game 0.11.0. */
  used?: InventoryStack[][];
}

export interface BuildingState {
  /** The level of the slot that stands here. */
  id: BuildingId;
  builtAt: number;
}

/** What stands in each building slot of a location. */
export interface LocationBuildings {
  house?: BuildingState;
  /** Fuel left in units (one burns for an hour in a Campfire), and whether it burns right now. */
  fire?: BuildingState & { fuel: number; lit: boolean };
  workbench?: BuildingState;
  storage?: BuildingState & { items: InventoryStack[] };
  /** Holds the water it has collected, in bottles. */
  rainCollector?: BuildingState & { water: number };
}

export interface PlayerState {
  locationId: string;
  stats: Record<StatId, number>;
  /** How well fed the player is on each food group; together they never exceed NUTRITION_RULES.total. */
  nutrition: Record<NutrientId, number>;
  attributes: Record<AttributeId, AttributeState>;
  skills: Record<SkillId, SkillState>;
  body: Record<BodyPartId, BodyCondition[]>;
  conditions: TimedCondition[];
  inventory: InventoryStack[];
  equipment: Partial<Record<EquipSlot, EquippedItem>>;
  /**
   * Game minutes without a break that the body temperature has been Very Hot or Very Cold, and that the player has
   * been out in the rain with neither a roof nor waterproof clothes.
   */
  exposure: { veryHot: number; veryCold: number; rain: number };
  /** Ids of every recipe the player has made at least once. */
  craftedRecipes: string[];
  /** Game minute the player last woke up (the start of the game before the first sleep); 20 hours later they are Sleepy. */
  awakeSince: number;
  /** Ids of every item the player has ever had; possible finds of any other item show as unknown. */
  knownItems: string[];
  /** Ids of every food and drink the player has had at least once; only these show what they do. */
  triedFoods: string[];
}

export interface LogEntry {
  id: number;
  time: number;
  text: string;
  tone: LogTone;
  /** Important enough to also show in a popup, e.g. a worn item falling apart. */
  alert?: boolean;
}

export interface EnvironmentState {
  weather: WeatherId;
  /** Game minute when the current weather ends and the next one is picked. */
  until: number;
}

export interface GameState {
  /** Minutes elapsed since the shipwreck. */
  time: number;
  /** Seeded RNG state, so outcomes are reproducible from a save. */
  rng: number;
  nextId: number;
  status: 'alive' | 'dead';
  deathCause?: string;
  player: PlayerState;
  environment: EnvironmentState;
  locations: Record<string, LocationState>;
  flags: Record<string, boolean>;
  log: LogEntry[];
}

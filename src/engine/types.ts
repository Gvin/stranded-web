// Persisted game state. Every change to the shapes in this file is a save format change:
// bump SAVE_VERSION and add a migration in src/save/migrations.ts.

export type AttributeId = 'strength' | 'endurance' | 'perception' | 'agility';
export const ATTRIBUTE_IDS: readonly AttributeId[] = ['strength', 'endurance', 'perception', 'agility'];

/** Health and energy: higher is better. Thirst and hunger: lower is better (0 = not thirsty or hungry at all). */
export type StatId = 'health' | 'thirst' | 'hunger' | 'energy';
export const STAT_IDS: readonly StatId[] = ['health', 'thirst', 'hunger', 'energy'];

export type BodyPartId = 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
export const BODY_PART_IDS: readonly BodyPartId[] = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

export type BodyConditionId = 'injured' | 'bleeding' | 'fractured' | 'burnt' | 'missing' | 'bandaged' | 'splinted';

/** Player-wide conditions that are stored and wear off over time (the rest are derived from stats). */
export type TimedConditionId = 'poisoned' | 'dizzy';

export type EquipSlot = 'head' | 'body' | 'leftHand' | 'rightHand';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['head', 'body', 'leftHand', 'rightHand'];
export type HandSlot = 'leftHand' | 'rightHand';
export const HAND_SLOTS: readonly HandSlot[] = ['leftHand', 'rightHand'];

export type BuildingId = 'campfire' | 'hut' | 'storage' | 'workbench';
export const BUILDING_IDS: readonly BuildingId[] = ['campfire', 'hut', 'storage', 'workbench'];

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
}

export interface GroundItem {
  id: number;
  itemId: string;
  quantity: number;
  droppedAt: number;
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
}

export interface BuildingState {
  builtAt: number;
}

export interface LocationBuildings {
  campfire?: BuildingState & { litUntil: number };
  hut?: BuildingState;
  storage?: BuildingState & { items: InventoryStack[] };
  workbench?: BuildingState;
}

export interface PlayerState {
  locationId: string;
  stats: Record<StatId, number>;
  attributes: Record<AttributeId, AttributeState>;
  body: Record<BodyPartId, BodyCondition[]>;
  conditions: TimedCondition[];
  inventory: InventoryStack[];
  equipment: Partial<Record<EquipSlot, string>>;
  /** Ids of every recipe the player has made at least once. */
  craftedRecipes: string[];
}

export interface LogEntry {
  id: number;
  time: number;
  text: string;
  tone: LogTone;
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
  locations: Record<string, LocationState>;
  flags: Record<string, boolean>;
  log: LogEntry[];
}

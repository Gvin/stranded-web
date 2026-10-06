import { getItemDef, ITEM_ORDER } from '../data/items';
import { canHoldWith } from './conditions';
import type { ClothingEffects, EquipmentDef, Ingredient, ItemDef, ResourceDef, ResourceType } from './definitions';
import { EQUIP_SLOTS, type EquipSlot, HAND_SLOTS, type HandSlot, type InventoryStack, type PlayerState } from './types';

export const HAND_ARM: Record<HandSlot, 'leftArm' | 'rightArm'> = { leftHand: 'leftArm', rightHand: 'rightArm' };

export function isHandSlot(slot: EquipSlot): slot is HandSlot {
  return slot === 'leftHand' || slot === 'rightHand';
}

export function itemHasType(itemId: string, type: ResourceType): boolean {
  return getItemDef(itemId).types?.includes(type) ?? false;
}

/** Whether the item has health and wears out; such items never stack. */
export function wearsOut(itemId: string): boolean {
  return getItemDef(itemId).maxHealth !== undefined;
}

/** Items of a crafting type in the order they are used up: plain resources first, equipment last. */
export function itemsOfType(type: ResourceType): ItemDef[] {
  const matching = ITEM_ORDER.map(getItemDef).filter((def) => def.types?.includes(type));
  return [...matching.filter((d) => d.category !== 'equipment'), ...matching.filter((d) => d.category === 'equipment')];
}

/** Quantity of an item in a list of stacks, counting every separate entry of items that wear out. */
export function countInStacks(stacks: readonly InventoryStack[], itemId: string): number {
  return stacks.filter((s) => s.itemId === itemId).reduce((sum, s) => sum + s.quantity, 0);
}

/** Quantity of an item in the bag (held items are not counted). */
export function countItem(player: PlayerState, itemId: string): number {
  return countInStacks(player.inventory, itemId);
}

/** Quantity of items of a crafting type in the bag. */
export function countType(player: PlayerState, type: ResourceType): number {
  return player.inventory.filter((s) => itemHasType(s.itemId, type)).reduce((sum, s) => sum + s.quantity, 0);
}

export function equippedItemId(player: PlayerState, slot: EquipSlot): string | undefined {
  return player.equipment[slot]?.itemId;
}

/** Whether the player has the item in the bag, in hand or worn. */
export function possesses(player: PlayerState, itemId: string): boolean {
  return countItem(player, itemId) > 0 || EQUIP_SLOTS.some((slot) => equippedItemId(player, slot) === itemId);
}

/** Whether an item of the crafting type is in the bag or in hand. */
export function hasType(player: PlayerState, type: ResourceType): boolean {
  return countType(player, type) > 0 || holdingType(player, type);
}

export function holdingType(player: PlayerState, type: ResourceType): boolean {
  return HAND_SLOTS.some((slot) => {
    const itemId = equippedItemId(player, slot);
    return itemId !== undefined && itemHasType(itemId, type);
  });
}

export function holdingItem(player: PlayerState, itemId: string): boolean {
  return HAND_SLOTS.some((slot) => equippedItemId(player, slot) === itemId);
}

/** Adds items to a list of stacks; items that wear out get one entry each, at the given health or at full health. */
export function addToStacks(stacks: InventoryStack[], itemId: string, quantity: number, health?: number): void {
  if (quantity <= 0) {
    return;
  }
  const { maxHealth } = getItemDef(itemId);
  if (maxHealth !== undefined) {
    for (let i = 0; i < quantity; i++) {
      stacks.push({ itemId, quantity: 1, health: health ?? maxHealth });
    }
    return;
  }
  const stack = stacks.find((s) => s.itemId === itemId);
  if (stack) {
    stack.quantity += quantity;
  } else {
    stacks.push({ itemId, quantity });
  }
}

export function addToInventory(player: PlayerState, itemId: string, quantity: number, health?: number): void {
  addToStacks(player.inventory, itemId, quantity, health);
}

/** Removes a quantity of an item from a list of stacks, the most worn entries first; false (and nothing removed) when there is not enough. */
export function removeFromStacks(stacks: InventoryStack[], itemId: string, quantity: number): boolean {
  if (countInStacks(stacks, itemId) < quantity) {
    return false;
  }
  let left = quantity;
  const entries = stacks.filter((s) => s.itemId === itemId).sort((a, b) => (a.health ?? 0) - (b.health ?? 0));
  for (const entry of entries) {
    const taken = Math.min(left, entry.quantity);
    entry.quantity -= taken;
    left -= taken;
    if (entry.quantity === 0) {
      stacks.splice(stacks.indexOf(entry), 1);
    }
    if (left === 0) {
      break;
    }
  }
  return true;
}

export function removeFromInventory(player: PlayerState, itemId: string, quantity: number): boolean {
  return removeFromStacks(player.inventory, itemId, quantity);
}

/**
 * Key that tells the entries of a list of stacks apart for actions and the UI: the item id, plus "#n" for the n-th
 * entry of an item that wears out (those never stack).
 */
export function entryKey(stacks: readonly InventoryStack[], index: number): string {
  const stack = stacks[index];
  if (!stack) {
    return '';
  }
  if (stack.health === undefined) {
    return stack.itemId;
  }
  const position = stacks.slice(0, index).filter((s) => s.itemId === stack.itemId).length;
  return `${stack.itemId}#${position}`;
}

export function findEntry(stacks: readonly InventoryStack[], key: string): InventoryStack | undefined {
  return stacks.find((_, index) => entryKey(stacks, index) === key);
}

/** Takes up to `quantity` units out of one entry and returns what was taken (with its health), or undefined. */
export function takeFromEntry(
  stacks: InventoryStack[],
  key: string,
  quantity: number,
): { itemId: string; quantity: number; health?: number } | undefined {
  const entry = findEntry(stacks, key);
  if (!entry || quantity <= 0) {
    return undefined;
  }
  const taken = Math.min(quantity, entry.quantity);
  entry.quantity -= taken;
  if (entry.quantity === 0) {
    stacks.splice(stacks.indexOf(entry), 1);
  }
  return entry.health === undefined
    ? { itemId: entry.itemId, quantity: taken }
    : { itemId: entry.itemId, quantity: taken, health: entry.health };
}

/**
 * Picks the bag items each ingredient would use up, in the order of the ingredients, or undefined when something is
 * missing. Type ingredients use the cheapest matching items first; held items are never used up.
 */
export function allocateByIngredient(player: PlayerState, ingredients: readonly Ingredient[]): InventoryStack[][] | undefined {
  const available = new Map<string, number>();
  for (const stack of player.inventory) {
    available.set(stack.itemId, (available.get(stack.itemId) ?? 0) + stack.quantity);
  }
  const result: InventoryStack[][] = [];
  for (const ingredient of ingredients) {
    const candidates = 'itemId' in ingredient ? [ingredient.itemId] : itemsOfType(ingredient.type).map((d) => d.id);
    const used: InventoryStack[] = [];
    let needed = ingredient.quantity;
    for (const itemId of candidates) {
      const take = Math.min(needed, available.get(itemId) ?? 0);
      if (take > 0) {
        available.set(itemId, (available.get(itemId) ?? 0) - take);
        used.push({ itemId, quantity: take });
        needed -= take;
      }
    }
    if (needed > 0) {
      return undefined;
    }
    result.push(used);
  }
  return result;
}

/** All bag items the ingredients would use up together, or undefined when something is missing. */
export function allocateIngredients(player: PlayerState, ingredients: readonly Ingredient[]): InventoryStack[] | undefined {
  const perIngredient = allocateByIngredient(player, ingredients);
  if (!perIngredient) {
    return undefined;
  }
  const used = new Map<string, number>();
  for (const stack of perIngredient.flat()) {
    used.set(stack.itemId, (used.get(stack.itemId) ?? 0) + stack.quantity);
  }
  return [...used].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export function getEquipped(player: PlayerState, slot: EquipSlot): EquipmentDef | undefined {
  const itemId = equippedItemId(player, slot);
  if (!itemId) {
    return undefined;
  }
  const def = getItemDef(itemId);
  return def.category === 'equipment' ? def : undefined;
}

/** The first worn or held item with a clothing effect, if any. */
export function wornWith(player: PlayerState, effect: 'warmth' | 'shade' | 'waterproof'): EquipmentDef | undefined {
  return EQUIP_SLOTS.map((slot) => getEquipped(player, slot)).find((def) => def?.clothing?.[effect] === true);
}

/** Armor points of everything worn. */
export function armorPoints(player: PlayerState): number {
  return EQUIP_SLOTS.reduce((sum, slot) => sum + (getEquipped(player, slot)?.clothing?.armor ?? 0), 0);
}

/** The clothing effects of an item with a short explanation each, e.g. Warmth: one step warmer in the cold. */
export function describeClothing(clothing: ClothingEffects | undefined): { name: string; hint: string }[] {
  if (!clothing) {
    return [];
  }
  return [
    clothing.warmth ? { name: 'Warmth', hint: 'one step warmer when it is Cold or Very Cold' } : undefined,
    clothing.shade ? { name: 'Shade', hint: 'one step cooler when it is Hot or Very Hot, unless a roof already does it' } : undefined,
    clothing.waterproof ? { name: 'Waterproof', hint: 'the rain does not make you wet' } : undefined,
    clothing.armor ? { name: `Armor ${clothing.armor}`, hint: `${clothing.armor} less damage from every hit` } : undefined,
  ].filter((effect): effect is { name: string; hint: string } => effect !== undefined);
}

export function stackWeight(stacks: readonly InventoryStack[]): number {
  return stacks.reduce((sum, s) => sum + getItemDef(s.itemId).weight * s.quantity, 0);
}

/** Total carried weight in kg, including held and worn items. */
export function carriedWeight(player: PlayerState): number {
  return stackWeight(player.inventory) + EQUIP_SLOTS.reduce((sum, slot) => sum + (getEquipped(player, slot)?.weight ?? 0), 0);
}

/** Best weapon bonus among the items held in hands. */
export function combatBonus(player: PlayerState): number {
  return bestWeapon(player)?.bonus ?? 0;
}

/** The most accurate arrow in the bag, if any. */
export function bestArrow(player: PlayerState): ResourceDef | undefined {
  return player.inventory
    .map((s) => getItemDef(s.itemId))
    .filter((def): def is ResourceDef => def.category === 'resource' && def.arrow !== undefined)
    .sort((a, b) => (b.arrow?.accuracy ?? 0) - (a.arrow?.accuracy ?? 0))[0];
}

/** Accuracy bonus of the arrow the bow would shoot next (0 without arrows). */
export function arrowAccuracy(player: PlayerState): number {
  return bestArrow(player)?.arrow?.accuracy ?? 0;
}

/** The held item that gives the best fighting bonus; a bow only counts with arrows in the bag. */
export function bestWeapon(player: PlayerState): { def: EquipmentDef; bonus: number } | undefined {
  const arrow = bestArrow(player);
  let best: { def: EquipmentDef; bonus: number } | undefined;
  for (const slot of HAND_SLOTS) {
    const def = getEquipped(player, slot);
    if (!def?.combat || (def.needsArrows && !arrow)) {
      continue;
    }
    const bonus = def.combat + (def.needsArrows ? (arrow?.arrow?.accuracy ?? 0) : 0);
    if (!best || bonus > best.bonus) {
      best = { def, bonus };
    }
  }
  return best;
}

/** Moves the item in the slot back into the bag, keeping its health, and returns its id. */
export function unequip(player: PlayerState, slot: EquipSlot): string | undefined {
  const item = player.equipment[slot];
  if (!item) {
    return undefined;
  }
  delete player.equipment[slot];
  addToInventory(player, item.itemId, 1, item.health);
  return item.itemId;
}

/** Puts items held by arms that can no longer hold anything back into the bag. */
export function releaseBlockedHands(player: PlayerState): string[] {
  const released: string[] = [];
  for (const slot of HAND_SLOTS) {
    if (player.equipment[slot] && !canHoldWith(player, HAND_ARM[slot])) {
      released.push(unequip(player, slot) as string);
    }
  }
  return released;
}

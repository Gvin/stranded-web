import { getItemDef, ITEM_ORDER } from '../data/items';
import { canHoldWith } from './conditions';
import type { EquipmentDef, Ingredient, ItemDef, ResourceType } from './definitions';
import { EQUIP_SLOTS, type EquipSlot, HAND_SLOTS, type HandSlot, type InventoryStack, type PlayerState } from './types';

export const HAND_ARM: Record<HandSlot, 'leftArm' | 'rightArm'> = { leftHand: 'leftArm', rightHand: 'rightArm' };

export function isHandSlot(slot: EquipSlot): slot is HandSlot {
  return slot === 'leftHand' || slot === 'rightHand';
}

export function itemHasType(itemId: string, type: ResourceType): boolean {
  return getItemDef(itemId).types?.includes(type) ?? false;
}

/** Items of a crafting type in the order they are used up: plain resources first, equipment last. */
export function itemsOfType(type: ResourceType): ItemDef[] {
  const matching = ITEM_ORDER.map(getItemDef).filter((def) => def.types?.includes(type));
  return [...matching.filter((d) => d.category !== 'equipment'), ...matching.filter((d) => d.category === 'equipment')];
}

/** Quantity of an item in the bag (held items are not counted). */
export function countItem(player: PlayerState, itemId: string): number {
  return player.inventory.find((s) => s.itemId === itemId)?.quantity ?? 0;
}

/** Quantity of items of a crafting type in the bag. */
export function countType(player: PlayerState, type: ResourceType): number {
  return player.inventory.filter((s) => itemHasType(s.itemId, type)).reduce((sum, s) => sum + s.quantity, 0);
}

/** Whether the player has the item in the bag, in hand or worn. */
export function possesses(player: PlayerState, itemId: string): boolean {
  return countItem(player, itemId) > 0 || EQUIP_SLOTS.some((slot) => player.equipment[slot] === itemId);
}

/** Whether an item of the crafting type is in the bag or in hand. */
export function hasType(player: PlayerState, type: ResourceType): boolean {
  return countType(player, type) > 0 || holdingType(player, type);
}

export function holdingType(player: PlayerState, type: ResourceType): boolean {
  return HAND_SLOTS.some((slot) => {
    const itemId = player.equipment[slot];
    return itemId !== undefined && itemHasType(itemId, type);
  });
}

export function holdingItem(player: PlayerState, itemId: string): boolean {
  return HAND_SLOTS.some((slot) => player.equipment[slot] === itemId);
}

export function addToInventory(player: PlayerState, itemId: string, quantity: number): void {
  if (quantity <= 0) {
    return;
  }
  getItemDef(itemId);
  const stack = player.inventory.find((s) => s.itemId === itemId);
  if (stack) {
    stack.quantity += quantity;
  } else {
    player.inventory.push({ itemId, quantity });
  }
}

export function removeFromInventory(player: PlayerState, itemId: string, quantity: number): boolean {
  const stack = player.inventory.find((s) => s.itemId === itemId);
  if (!stack || stack.quantity < quantity) {
    return false;
  }
  stack.quantity -= quantity;
  if (stack.quantity === 0) {
    player.inventory = player.inventory.filter((s) => s !== stack);
  }
  return true;
}

/**
 * Picks the bag items that would be used up by the ingredients, or undefined when something is missing.
 * Type ingredients use the cheapest matching items first; held items are never used up.
 */
export function allocateIngredients(player: PlayerState, ingredients: readonly Ingredient[]): InventoryStack[] | undefined {
  const available = new Map(player.inventory.map((s) => [s.itemId, s.quantity]));
  const used = new Map<string, number>();
  for (const ingredient of ingredients) {
    const candidates = 'itemId' in ingredient ? [ingredient.itemId] : itemsOfType(ingredient.type).map((d) => d.id);
    let needed = ingredient.quantity;
    for (const itemId of candidates) {
      const take = Math.min(needed, available.get(itemId) ?? 0);
      if (take > 0) {
        available.set(itemId, (available.get(itemId) ?? 0) - take);
        used.set(itemId, (used.get(itemId) ?? 0) + take);
        needed -= take;
      }
    }
    if (needed > 0) {
      return undefined;
    }
  }
  return [...used].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export function getEquipped(player: PlayerState, slot: EquipSlot): EquipmentDef | undefined {
  const itemId = player.equipment[slot];
  if (!itemId) {
    return undefined;
  }
  const def = getItemDef(itemId);
  return def.category === 'equipment' ? def : undefined;
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
  return Math.max(0, ...HAND_SLOTS.map((slot) => getEquipped(player, slot)?.combat ?? 0));
}

/** Moves the item in the slot back into the bag and returns its id. */
export function unequip(player: PlayerState, slot: EquipSlot): string | undefined {
  const itemId = player.equipment[slot];
  if (!itemId) {
    return undefined;
  }
  delete player.equipment[slot];
  addToInventory(player, itemId, 1);
  return itemId;
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

// Save format 10 → 11 (game 0.12.2 → 0.13.0). Self-contained on purpose: it must keep working on old data
// even after the current game definitions change again.
// - The player gets an arrow slot, which old saves simply lack: existing games start with it empty and keep their
//   arrows in the bag.
// - The bow takes both hands. A held bow moves to the right hand and whatever the other hand held goes into the bag;
//   with a fractured, splinted or missing arm the bow itself goes into the bag.

type Json = Record<string, unknown>;

interface Held {
  itemId: string;
  health?: number;
  lit?: boolean;
}

type Hand = 'leftHand' | 'rightHand';

const TWO_HANDED = new Set(['bow']);
const CANNOT_HOLD = new Set(['fractured', 'splinted', 'missing']);

/** Adds a held item to the bag: items without health stack, items with health never do. */
function intoBag(inventory: Json[], item: Held): Json[] {
  const stack = item.health === undefined ? inventory.find((s) => s.itemId === item.itemId && s.health === undefined) : undefined;
  if (stack) {
    return inventory.map((s) => (s === stack ? { ...s, quantity: (s.quantity as number) + 1 } : s));
  }
  return [...inventory, { ...item, quantity: 1 }];
}

export function migrateV10ToV11(state: Json): Json {
  const player = state.player as Json & {
    equipment: Partial<Record<string, Held>>;
    inventory: Json[];
    body: Record<string, { id: string }[] | undefined>;
  };
  const bowHand = (['rightHand', 'leftHand'] as Hand[]).find((hand) => TWO_HANDED.has(player.equipment[hand]?.itemId ?? ''));
  if (!bowHand) {
    return state;
  }
  const bow = player.equipment[bowHand] as Held;
  const other = player.equipment[bowHand === 'rightHand' ? 'leftHand' : 'rightHand'];
  const canHold = (arm: string) => !(player.body[arm] ?? []).some((c) => CANNOT_HOLD.has(c.id));
  const bothArms = canHold('leftArm') && canHold('rightArm');
  const { leftHand: _left, rightHand: _right, ...equipment } = player.equipment;
  void _left;
  void _right;
  let inventory = other ? intoBag(player.inventory, other) : player.inventory;
  if (!bothArms) {
    inventory = intoBag(inventory, bow);
  }
  return {
    ...state,
    player: { ...player, inventory, equipment: bothArms ? { ...equipment, rightHand: bow } : equipment },
  };
}

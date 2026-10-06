import { getItemDef } from '../../data/items';
import { formatHealth } from '../../engine/context';
import { ITEM_WORN_OUT_WARNING } from '../../engine/rules';
import { Icon } from './Icon';

interface ItemHealthProps {
  itemId: string;
  health: number | undefined;
}

/** Health left of an item that wears out, with a warning once it is about to fall apart. */
export function ItemHealth({ itemId, health }: ItemHealthProps) {
  const { maxHealth } = getItemDef(itemId);
  if (health === undefined || maxHealth === undefined) {
    return null;
  }
  const low = health <= maxHealth * ITEM_WORN_OUT_WARNING;
  return (
    <span
      className={`health${low ? ' health--low' : ''}`}
      title={low ? 'Almost worn out: it will fall apart soon' : 'Health: it wears out while worn and falls apart at 0'}
    >
      {low && <Icon name="hazard-sign" size={14} />}
      {formatHealth(health)}/{maxHealth}
    </span>
  );
}

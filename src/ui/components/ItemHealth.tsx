import { getItemDef } from '../../data/items';
import { formatHealth } from '../../engine/context';
import { ITEM_WORN_OUT_WARNING } from '../../engine/rules';
import { Icon } from './Icon';

interface ItemHealthProps {
  itemId: string;
  health: number | undefined;
  /** A torch that is burning. */
  lit?: boolean;
}

/** Health left of an item that wears out, with a warning once it is about to fall apart, and a flame while it burns. */
export function ItemHealth({ itemId, health, lit }: ItemHealthProps) {
  const { maxHealth } = getItemDef(itemId);
  if (health === undefined || maxHealth === undefined) {
    return null;
  }
  const low = health <= maxHealth * ITEM_WORN_OUT_WARNING;
  return (
    <span
      className={`health${low ? ' health--low' : ''}`}
      title={low ? 'Almost worn out: it will fall apart soon' : lit ? 'Burning: it loses health every hour' : 'Health: it is gone at 0'}
    >
      {lit && <Icon name="fire" size={14} className="health__flame" />}
      {low && <Icon name="hazard-sign" size={14} />}
      {formatHealth(health)}/{maxHealth}
    </span>
  );
}

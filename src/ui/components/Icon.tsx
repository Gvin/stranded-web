import { getItemDef } from '../../data/items';
import { ICON_BODIES, type IconName } from '../../icons/gameIcons';

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

/** A game icon drawn in the current text colour, so it follows the day/night palette. */
export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={`icon${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICON_BODIES[name] }}
    />
  );
}

interface ItemIconProps {
  itemId: string;
  size?: number;
}

/** The icon of an item, with its badge (e.g. a flame for cooked food). */
export function ItemIcon({ itemId, size = 20 }: ItemIconProps) {
  const def = getItemDef(itemId);
  return (
    <span className="item-icon" style={{ width: size, height: size }} title={def.name}>
      <Icon name={def.icon} size={size} />
      {def.iconBadge === 'cooked' && <Icon name="fire" size={Math.round(size * 0.5)} className="item-icon__badge" />}
    </span>
  );
}

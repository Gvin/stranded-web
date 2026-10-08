import { BUILDINGS } from '../../data/buildings';
import { getItemDef } from '../../data/items';
import type { CharacterSheet } from '../../engine/character';
import type { ItemCategory, ItemDef, WeaponStats } from '../../engine/definitions';
import { damageRange } from '../../engine/fight';
import { type FightingStat, getFightingStats, type StatPart } from '../../engine/fighting';
import { describeClothing, entryKey, isHandSlot, lockedBy, stackWeight } from '../../engine/inventory';
import { FIGHTING_RULES, NUTRIENT_NAMES } from '../../engine/rules';
import { EQUIP_SLOTS, type EquipSlot, type GameState } from '../../engine/types';
import { getLocationState } from '../../engine/world';
import type { ActionView, PerformAction } from '../actionView';
import { ActionButton } from '../components/ActionButton';
import { ItemIcon } from '../components/Icon';
import { InfoTip } from '../components/InfoTip';
import { ItemHealth } from '../components/ItemHealth';

interface InventoryPanelProps {
  state: GameState;
  sheet: CharacterSheet;
  actions: readonly ActionView[];
  onPerform: PerformAction;
}

const SLOT_NAMES: Record<EquipSlot, string> = { head: 'Head', body: 'Body', leftHand: 'Left hand', rightHand: 'Right hand' };
const GROUPS: { category: ItemCategory; title: string }[] = [
  { category: 'food', title: 'Food & drink' },
  { category: 'equipment', title: 'Equipment' },
  { category: 'resource', title: 'Resources' },
];

const signed = (value: number) => `${value < 0 ? '−' : '+'}${Math.abs(value)}`;
const percent = (fraction: number) => Math.round(fraction * 100);

/** What a weapon adds, e.g. "+1 damage, +10% accuracy"; parts that add nothing are left out. */
function weaponBonus(stats: WeaponStats): string {
  const parts = [
    stats.damage ? `${signed(stats.damage)} damage` : '',
    stats.accuracy ? `${signed(percent(stats.accuracy))}% accuracy` : '',
  ];
  return parts.filter(Boolean).join(', ');
}

/** A short line of what an item is good for; a food shows what it does only once the player has tried it. */
function itemStats(def: ItemDef, tried: boolean): string {
  const parts: string[] = [];
  if (def.category === 'food' && !tried) {
    parts.push('effects unknown until tried');
  } else if (def.category === 'food') {
    if (def.nutrition) {
      parts.push(`${def.nutrition > 0 ? '−' : '+'}${Math.abs(def.nutrition)} hunger`);
    }
    if (def.hydration) {
      parts.push(`${def.hydration > 0 ? '−' : '+'}${Math.abs(def.hydration)} thirst`);
    }
    if (def.foodGroup) {
      parts.push(NUTRIENT_NAMES[def.foodGroup].toLowerCase());
    }
  }
  if (def.category === 'equipment') {
    if (def.melee) {
      parts.push(weaponBonus(def.melee));
    }
    if (def.ranged) {
      parts.push(`ranged: ${def.ranged.damage} damage, ${percent(def.ranged.accuracy)}% accuracy`);
    }
    if (def.twoHanded) {
      parts.push('both hands');
    }
    parts.push(...describeClothing(def.clothing).map((effect) => effect.name));
  }
  if (def.category === 'resource' && def.arrow && weaponBonus(def.arrow)) {
    parts.push(`ranged: ${weaponBonus(def.arrow)}`);
  }
  parts.push(`${def.weight} kg`);
  return parts.join(' · ');
}

/** How a fighting stat adds up, e.g. "Accuracy: 50% base, +10% knife, × 1.00 for Agility 20 = 60%. Damage: 1 base, +1 knife = 2." */
function statTip(stat: FightingStat, agility: number): string {
  const list = (parts: readonly StatPart[], unit: string, scale: number) =>
    parts
      .map((p, index) => {
        const value = Math.round(p.value * scale);
        return `${index === 0 ? value : signed(value)}${unit} ${p.source.toLowerCase()}`;
      })
      .join(', ');
  const capped = stat.accuracy >= FIGHTING_RULES.maxAccuracy ? ` (at most ${percent(FIGHTING_RULES.maxAccuracy)}%)` : '';
  // why: non-breaking spaces keep "× 0.70" and "= 32%" together when the tip wraps.
  const nbsp = ' ';
  return (
    `Accuracy: ${list(stat.accuracyParts, '%', 100)}, ×${nbsp}${stat.agilityFactor.toFixed(2)} for Agility ${Math.round(agility)}${nbsp}=${nbsp}` +
    `${percent(stat.accuracy)}%${capped}. Max damage: ${list(stat.damageParts, '', 1)}${nbsp}=${nbsp}${stat.damage}; a hit does ` +
    `${damageRange(stat.damage)}.`
  );
}

function FightingRow({ name, stat, agility }: { name: string; stat: FightingStat; agility: number }) {
  return (
    <li className="fighting__row">
      <span className="fighting__name">
        {name}
        <InfoTip label={`${name} fighting`} text={statTip(stat, agility)} />
      </span>
      <span className="fighting__value">
        Accuracy <strong>{percent(stat.accuracy)}%</strong> · Damage <strong>{damageRange(stat.damage)}</strong>
      </span>
    </li>
  );
}

function TypeChips({ def }: { def: ItemDef }) {
  if (!def.types || def.types.length === 0) {
    return null;
  }
  return (
    <span className="types" aria-label="Crafting types">
      {def.types.map((type) => (
        <span key={type} className="type-chip">
          {type}
        </span>
      ))}
    </span>
  );
}

export function InventoryPanel({ state, sheet, actions, onPerform }: InventoryPanelProps) {
  const { player } = state;
  const byTarget = (category: string, itemId: string, prefix?: string) =>
    actions.filter((a) => a.action.category === category && a.action.targetId === itemId && (!prefix || a.action.id.startsWith(prefix)));
  const load = sheet.carryCapacity > 0 ? sheet.carriedWeight / sheet.carryCapacity : 1;
  const storage = getLocationState(state, player.locationId).buildings.storage;
  const fighting = getFightingStats(state, sheet);
  const agility = sheet.attributes.agility.effective;

  return (
    <div className="panel">
      {state.fight && <p className="card muted">In a fight you can only change weapons, and each change takes a turn.</p>}
      <section className="card">
        <div className="weight">
          <span>Carrying</span>
          <span className={load > 1 ? 'text-bad' : undefined}>
            {sheet.carriedWeight.toFixed(1)} / {sheet.carryCapacity.toFixed(1)} kg
          </span>
        </div>
        <div className="weight__track">
          <div className={`weight__fill${load > 1 ? ' weight__fill--over' : ''}`} style={{ width: `${Math.min(1, load) * 100}%` }} />
        </div>
        {load > 1 && <p className="text-bad small">Too heavy to travel. Drop something.</p>}
      </section>

      <section>
        <h2 className="section-title">Worn and held</h2>
        <ul className="card slots">
          {EQUIP_SLOTS.map((slot) => {
            const item = player.equipment[slot];
            const locking = isHandSlot(slot) && !item ? lockedBy(player, slot) : undefined;
            return (
              <li key={slot} className="slot">
                <span className="slot__name">
                  {SLOT_NAMES[slot]}
                  {slot === fighting.weaponHand && <span className="slot__tag">weapon</span>}
                </span>
                <span className={item ? 'slot__item' : 'slot__item muted'}>
                  {item && <ItemIcon itemId={item.itemId} size={22} />}
                  {item ? getItemDef(item.itemId).name : locking ? `taken by the ${locking.name.toLowerCase()}` : 'empty'}
                  {item && <ItemHealth itemId={item.itemId} health={item.health} lit={item.lit} />}
                </span>
                <span className="slot__actions">
                  {byTarget('item', slot).map((a) => (
                    <ActionButton key={a.action.id} view={a} onPerform={onPerform} compact />
                  ))}
                </span>
              </li>
            );
          })}
          <li className="slot">
            <span className="slot__name">Arrows</span>
            <span className={player.arrows ? 'slot__item' : 'slot__item muted'}>
              {player.arrows && <ItemIcon itemId={player.arrows.itemId} size={22} />}
              {player.arrows ? getItemDef(player.arrows.itemId).name : 'empty'}
              {player.arrows && <span className="muted">×{player.arrows.quantity}</span>}
            </span>
            <span className="slot__actions">
              {byTarget('item', 'arrows').map((a) => (
                <ActionButton key={a.action.id} view={a} onPerform={onPerform} compact />
              ))}
            </span>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="section-title">Fighting</h2>
        <ul className="card fighting">
          <FightingRow name="Melee" stat={fighting.melee} agility={agility} />
          {fighting.ranged &&
            ('blocked' in fighting.ranged ? (
              <li className="fighting__row">
                <span className="fighting__name">Ranged</span>
                <span className="muted small">{fighting.ranged.blocked}</span>
              </li>
            ) : (
              <FightingRow name="Ranged" stat={fighting.ranged} agility={agility} />
            ))}
        </ul>
      </section>

      {player.inventory.length === 0 && <p className="muted empty">Your bag is empty.</p>}

      {GROUPS.map((group) => {
        const entries = player.inventory
          .map((stack, index) => ({ stack, key: entryKey(player.inventory, index) }))
          .filter(({ stack }) => getItemDef(stack.itemId).category === group.category);
        if (entries.length === 0) {
          return null;
        }
        return (
          <section key={group.category}>
            <h2 className="section-title">{group.title}</h2>
            <ul className="items">
              {entries.map(({ stack, key }) => {
                const def = getItemDef(stack.itemId);
                const views = [...byTarget('item', key), ...byTarget('storage', key, 'store:')];
                const reasons = [...new Set(views.map((a) => a.blocked).filter((r): r is string => r !== undefined))];
                return (
                  <li key={key} className="card item">
                    <div className="item__heading">
                      <span className="item__name">
                        <ItemIcon itemId={def.id} size={28} />
                        {def.name}
                        {stack.quantity > 1 && <span className="muted"> ×{stack.quantity}</span>}
                        <ItemHealth itemId={def.id} health={stack.health} lit={stack.lit} />
                      </span>
                      <span className="item__stats">{itemStats(def, player.triedFoods.includes(def.id))}</span>
                    </div>
                    <p className="item__description">{def.description}</p>
                    <TypeChips def={def} />
                    <div className="item__actions">
                      {views.map((a) => (
                        <ActionButton key={a.action.id} view={a} onPerform={onPerform} compact />
                      ))}
                    </div>
                    {reasons.map((reason) => (
                      <p key={reason} className="action__reason">
                        {reason}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {storage && (
        <section>
          <h2 className="section-title">
            {BUILDINGS[storage.id].name} · {stackWeight(storage.items).toFixed(1)} / {BUILDINGS[storage.id].storage?.capacity ?? 0} kg
          </h2>
          {storage.items.length === 0 ? (
            <p className="card muted">The storage is empty. Use "Store" on items in your bag.</p>
          ) : (
            <ul className="items">
              {storage.items.map((stack, index) => {
                const def = getItemDef(stack.itemId);
                const key = entryKey(storage.items, index);
                return (
                  <li key={key} className="card item">
                    <div className="item__heading">
                      <span className="item__name">
                        <ItemIcon itemId={def.id} size={28} />
                        {def.name}
                        {stack.quantity > 1 && <span className="muted"> ×{stack.quantity}</span>}
                        <ItemHealth itemId={def.id} health={stack.health} lit={stack.lit} />
                      </span>
                      <span className="item__stats">{def.weight} kg</span>
                    </div>
                    <div className="item__actions">
                      {byTarget('storage', key, 'take:').map((a) => (
                        <ActionButton key={a.action.id} view={a} onPerform={onPerform} compact />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

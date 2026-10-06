import { STORAGE_CAPACITY } from '../../data/buildings';
import { getItemDef } from '../../data/items';
import type { CharacterSheet } from '../../engine/character';
import type { ItemCategory, ItemDef } from '../../engine/definitions';
import { stackWeight } from '../../engine/inventory';
import { NUTRIENT_NAMES } from '../../engine/rules';
import { EQUIP_SLOTS, type EquipSlot, type GameState } from '../../engine/types';
import { getLocationState } from '../../engine/world';
import type { ActionView, PerformAction } from '../actionView';
import { ActionButton } from '../components/ActionButton';
import { ItemIcon } from '../components/Icon';

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

function itemStats(def: ItemDef): string {
  const parts: string[] = [];
  if (def.category === 'food') {
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
  if (def.category === 'equipment' && def.combat) {
    parts.push(`+${def.combat} fighting`);
  }
  parts.push(`${def.weight} kg`);
  return parts.join(' · ');
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
  const unequipFor = (slot: EquipSlot) => actions.find((a) => a.action.id === `unequip:${slot}`);
  const load = sheet.carryCapacity > 0 ? sheet.carriedWeight / sheet.carryCapacity : 1;
  const storage = getLocationState(state, player.locationId).buildings.storage;

  return (
    <div className="panel">
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
        <h2 className="section-title">Equipment</h2>
        <ul className="card slots">
          {EQUIP_SLOTS.map((slot) => {
            const itemId = player.equipment[slot];
            const unequip = unequipFor(slot);
            return (
              <li key={slot} className="slot">
                <span className="slot__name">{SLOT_NAMES[slot]}</span>
                <span className={itemId ? 'slot__item' : 'slot__item muted'}>
                  {itemId && <ItemIcon itemId={itemId} size={22} />}
                  {itemId ? getItemDef(itemId).name : 'empty'}
                </span>
                {unequip && <ActionButton view={unequip} onPerform={onPerform} compact />}
              </li>
            );
          })}
        </ul>
      </section>

      {player.inventory.length === 0 && <p className="muted empty">Your bag is empty.</p>}

      {GROUPS.map((group) => {
        const stacks = player.inventory.filter((s) => getItemDef(s.itemId).category === group.category);
        if (stacks.length === 0) {
          return null;
        }
        return (
          <section key={group.category}>
            <h2 className="section-title">{group.title}</h2>
            <ul className="items">
              {stacks.map((stack) => {
                const def = getItemDef(stack.itemId);
                const views = [...byTarget('item', def.id), ...byTarget('storage', def.id, 'store:')];
                const reasons = [...new Set(views.map((a) => a.blocked).filter((r): r is string => r !== undefined))];
                return (
                  <li key={stack.itemId} className="card item">
                    <div className="item__heading">
                      <span className="item__name">
                        <ItemIcon itemId={def.id} size={28} />
                        {def.name}
                        {stack.quantity > 1 && <span className="muted"> ×{stack.quantity}</span>}
                      </span>
                      <span className="item__stats">{itemStats(def)}</span>
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
            Storage · {stackWeight(storage.items).toFixed(1)} / {STORAGE_CAPACITY} kg
          </h2>
          {storage.items.length === 0 ? (
            <p className="card muted">The storage is empty. Use "Store" on items in your bag.</p>
          ) : (
            <ul className="items">
              {storage.items.map((stack) => {
                const def = getItemDef(stack.itemId);
                return (
                  <li key={stack.itemId} className="card item">
                    <div className="item__heading">
                      <span className="item__name">
                        <ItemIcon itemId={def.id} size={28} />
                        {def.name}
                        {stack.quantity > 1 && <span className="muted"> ×{stack.quantity}</span>}
                      </span>
                      <span className="item__stats">{def.weight} kg</span>
                    </div>
                    <div className="item__actions">
                      {byTarget('storage', def.id, 'take:').map((a) => (
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

import { getItemDef } from '../../data/items';
import type { Ingredient, Requirement } from '../../engine/definitions';
import { allocateIngredients, countItem, countType, itemsOfType } from '../../engine/inventory';
import type { GameState } from '../../engine/types';
import { ItemIcon } from './Icon';

interface CostChipsProps {
  state: GameState;
  ingredients: readonly Ingredient[];
  /** Tools and stations: needed but not used up. */
  needs: readonly Requirement[];
}

/** Ingredients and needed tools of a recipe or building, marked as available or missing, plus what would be used. */
export function CostChips({ state, ingredients, needs }: CostChipsProps) {
  const uses = allocateIngredients(state.player, ingredients);
  return (
    <>
      <ul className="recipe__needs">
        {ingredients.map((ingredient) => {
          const isType = 'type' in ingredient;
          const have = isType ? countType(state.player, ingredient.type) : countItem(state.player, ingredient.itemId);
          const candidates = isType ? itemsOfType(ingredient.type) : [getItemDef(ingredient.itemId)];
          const label = isType ? `Any ${ingredient.type.replace('_', ' ')}` : getItemDef(ingredient.itemId).name;
          const iconItem = candidates.find((d) => countItem(state.player, d.id) > 0) ?? candidates[0];
          return (
            <li
              key={label}
              title={isType ? candidates.map((d) => d.name).join(', ') : undefined}
              className={have >= ingredient.quantity ? 'need need--ok' : 'need need--missing'}
            >
              {iconItem && <ItemIcon itemId={iconItem.id} size={16} />}
              {label} {have}/{ingredient.quantity}
            </li>
          );
        })}
        {needs.map((need) => (
          <li key={need.describe()} className={need.test(state) ? 'need need--ok' : 'need need--missing'}>
            🛠 {need.describe()}
          </li>
        ))}
      </ul>
      {uses && uses.length > 0 && (
        <p className="muted small">Uses: {uses.map((s) => `${s.quantity}× ${getItemDef(s.itemId).name}`).join(', ')}</p>
      )}
    </>
  );
}

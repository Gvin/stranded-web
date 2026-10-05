import { useState } from 'react';
import { getItemDef } from '../../data/items';
import { BUILDING_RECIPES, CRAFTING_RECIPES } from '../../data/recipes';
import type { RecipeDef } from '../../engine/definitions';
import { allocateIngredients, countItem, countType, itemsOfType } from '../../engine/inventory';
import { station } from '../../engine/requirements';
import type { GameState } from '../../engine/types';
import type { ActionView, PerformAction } from '../actionView';
import { ActionButton } from '../components/ActionButton';

interface CraftPanelProps {
  state: GameState;
  actions: readonly ActionView[];
  onPerform: PerformAction;
}

interface RecipeCardProps {
  state: GameState;
  recipe: RecipeDef;
  view: ActionView;
  isNew: boolean;
  onPerform: PerformAction;
}

const SHOW_KNOWN_KEY = 'stranded.ui.showKnownRecipes';

function RecipeCard({ state, recipe, view, isNew, onPerform }: RecipeCardProps) {
  const uses = allocateIngredients(state.player, recipe.ingredients);
  const needs = [...(recipe.tools ?? []), ...(recipe.stations ?? []).map(station)];
  return (
    <li className="card recipe">
      <div className="recipe__heading">
        <h3 className="recipe__name">{recipe.name}</h3>
        {isNew && <span className="new-badge">New</span>}
      </div>
      <p className="small">{recipe.description}</p>
      <ul className="recipe__needs">
        {recipe.ingredients.map((ingredient) => {
          const isType = 'type' in ingredient;
          const have = isType ? countType(state.player, ingredient.type) : countItem(state.player, ingredient.itemId);
          const label = isType ? `Any ${ingredient.type}` : getItemDef(ingredient.itemId).name;
          const title = isType
            ? itemsOfType(ingredient.type)
                .map((d) => d.name)
                .join(', ')
            : undefined;
          return (
            <li key={label} title={title} className={have >= ingredient.quantity ? 'need need--ok' : 'need need--missing'}>
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
      <ActionButton
        view={{ ...view, action: { ...view.action, description: undefined } }}
        onPerform={onPerform}
        label={recipe.builds ? 'Build' : 'Make'}
      />
    </li>
  );
}

function readShowKnown(): boolean {
  try {
    return window.localStorage.getItem(SHOW_KNOWN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function CraftPanel({ state, actions, onPerform }: CraftPanelProps) {
  const [showKnown, setShowKnown] = useState(readShowKnown);
  const craftActions = new Map(actions.filter((a) => a.action.category === 'craft').map((a) => [a.action.targetId, a]));
  const crafted = new Set(state.player.craftedRecipes);
  const canMake = (recipe: RecipeDef) => craftActions.get(recipe.id)?.blocked === undefined && craftActions.has(recipe.id);

  const toggle = (value: boolean) => {
    setShowKnown(value);
    try {
      window.localStorage.setItem(SHOW_KNOWN_KEY, String(value));
    } catch {
      // The preference simply is not remembered when storage is unavailable.
    }
  };

  const listed = (recipes: readonly RecipeDef[]) => {
    const makeable = recipes.filter(canMake);
    const known = showKnown ? recipes.filter((r) => !canMake(r) && crafted.has(r.id) && craftActions.has(r.id)) : [];
    return [...makeable, ...known];
  };

  const section = (title: string, recipes: readonly RecipeDef[]) => {
    const shown = listed(recipes);
    if (shown.length === 0) {
      return null;
    }
    return (
      <section>
        <h2 className="section-title">{title}</h2>
        <ul className="recipes">
          {shown.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              state={state}
              recipe={recipe}
              view={craftActions.get(recipe.id) as ActionView}
              isNew={canMake(recipe) && !crafted.has(recipe.id)}
              onPerform={onPerform}
            />
          ))}
        </ul>
      </section>
    );
  };

  const crafting = section('Crafting', CRAFTING_RECIPES);
  const buildings = section('Buildings', BUILDING_RECIPES);
  return (
    <div className="panel">
      <label className="toggle">
        <input type="checkbox" checked={showKnown} onChange={(event) => toggle(event.target.checked)} />
        <span className="toggle__track" aria-hidden="true" />
        <span>Also show recipes I have made before</span>
      </label>
      {crafting}
      {buildings}
      {!crafting && !buildings && (
        <p className="card muted">
          {showKnown
            ? 'Nothing to make right now, and you have not made anything yet.'
            : 'With what you carry here, there is nothing you can make.'}{' '}
          Gather materials and new ideas will come to you. Buildings can only be built at the clearing in the forest.
        </p>
      )}
    </div>
  );
}

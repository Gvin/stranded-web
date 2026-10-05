import { useState } from 'react';
import { RECIPES } from '../../data/recipes';
import type { RecipeDef } from '../../engine/definitions';
import { station } from '../../engine/requirements';
import type { GameState } from '../../engine/types';
import type { ActionView, PerformAction } from '../actionView';
import { ActionButton } from '../components/ActionButton';
import { CostChips } from '../components/CostChips';
import { ItemIcon } from '../components/Icon';

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
  return (
    <li className="card recipe">
      <div className="recipe__heading">
        <ItemIcon itemId={recipe.result.itemId} size={32} />
        <h3 className="recipe__name">
          {recipe.name}
          {recipe.result.quantity > 1 && <span className="muted"> ×{recipe.result.quantity}</span>}
        </h3>
        {isNew && <span className="new-badge">New</span>}
      </div>
      <p className="small">{recipe.description}</p>
      <CostChips
        state={state}
        ingredients={recipe.ingredients}
        needs={[...(recipe.tools ?? []), ...(recipe.stations ?? []).map(station)]}
      />
      <ActionButton view={{ ...view, action: { ...view.action, description: undefined } }} onPerform={onPerform} label="Make" />
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
  const canMake = (recipe: RecipeDef) => craftActions.has(recipe.id) && craftActions.get(recipe.id)?.blocked === undefined;

  const toggle = (value: boolean) => {
    setShowKnown(value);
    try {
      window.localStorage.setItem(SHOW_KNOWN_KEY, String(value));
    } catch {
      // The preference simply is not remembered when storage is unavailable.
    }
  };

  const makeable = RECIPES.filter(canMake);
  const known = showKnown ? RECIPES.filter((r) => !canMake(r) && crafted.has(r.id) && craftActions.has(r.id)) : [];
  const shown = [...makeable, ...known];

  return (
    <div className="panel">
      <label className="toggle">
        <input type="checkbox" checked={showKnown} onChange={(event) => toggle(event.target.checked)} />
        <span className="toggle__track" aria-hidden="true" />
        <span>Also show recipes I have made before</span>
      </label>
      {shown.length > 0 ? (
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
      ) : (
        <p className="card muted">
          {showKnown
            ? 'Nothing to make right now, and you have not made anything yet.'
            : 'With what you carry here, there is nothing you can make.'}{' '}
          Gather materials and new ideas will come to you.
        </p>
      )}
    </div>
  );
}

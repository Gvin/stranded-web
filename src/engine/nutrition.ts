import { NUTRIENT_NAMES, NUTRITION_RULES } from './rules';
import { NUTRIENT_IDS, type NutrientId, type PlayerState } from './types';

/** Even split of the nutrition total for a new game. */
export function startingNutrition(): Record<NutrientId, number> {
  const share = Math.floor(NUTRITION_RULES.total / NUTRIENT_IDS.length);
  return { vegetables: share, meat: share, fruits: share };
}

/** Food groups that have run out and cause malnutrition. */
export function emptyFoodGroups(player: PlayerState): NutrientId[] {
  return NUTRIENT_IDS.filter((id) => player.nutrition[id] <= 0);
}

/** A meal of the given food group: the other groups lose a little and the eaten group gains as far as the total allows. */
export function feedFoodGroup(player: PlayerState, group: NutrientId): void {
  for (const id of NUTRIENT_IDS) {
    if (id !== group) {
      player.nutrition[id] = Math.max(0, player.nutrition[id] - NUTRITION_RULES.loss);
    }
  }
  const total = NUTRIENT_IDS.reduce((sum, id) => sum + player.nutrition[id], 0);
  player.nutrition[group] += Math.max(0, Math.min(NUTRITION_RULES.gain, NUTRITION_RULES.total - total));
}

/** "meat", "meat and fruits", "vegetables, meat and fruits". */
export function foodGroupList(groups: readonly NutrientId[]): string {
  const names = groups.map((id) => NUTRIENT_NAMES[id].toLowerCase());
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
}

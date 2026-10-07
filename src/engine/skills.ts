import { fightingSkillBonus, SKILL_RULES } from './rules';
import { type InventoryStack, type PlayerState, SKILL_IDS, type SkillId, type SkillState } from './types';

// Skills: what the castaway learns by doing. Each goes from level 0 to 10 and changes how well related actions go.

export function startingSkills(): Record<SkillId, SkillState> {
  return Object.fromEntries(SKILL_IDS.map((id) => [id, { level: 0, points: 0 }])) as Record<SkillId, SkillState>;
}

export function skillLevel(player: PlayerState, id: SkillId): number {
  return player.skills[id].level;
}

/** Fraction of the time a building step or a recipe takes at a Building or Crafting level: 5% less per level. */
export function timeFactor(level: number): number {
  return Math.max(0, 1 - SKILL_RULES.timeReductionPerLevel * level);
}

/** Time a building step or a recipe takes at a Building or Crafting level: at least a minute, unless it is instant. */
export function skilledMinutes(minutes: number, level: number): number {
  return minutes <= 0 ? 0 : Math.max(1, Math.round(minutes * timeFactor(level)));
}

/** Multiplier for find chances at a Foraging level (1.1 at level 1). */
export function findChanceFactor(level: number): number {
  return 1 + SKILL_RULES.findChancePerLevel * level;
}

/** Multiplier for gathered items at a Foraging level (1.05 at level 1). */
export function gatheredFactor(level: number): number {
  return 1 + SKILL_RULES.gatheredPerLevel * level;
}

/** Chances at a Building or Crafting level to get a used resource back: the first one, and a second one on top. */
export function refundChances(level: number): { first: number; second: number } {
  return { first: SKILL_RULES.refundChance[level] ?? 0, second: SKILL_RULES.secondRefundChance[level] ?? 0 };
}

/**
 * The used units an ingredient could give back: only ingredients needed 2 or more times, and never their last unit.
 * `used` holds the items taken for each ingredient, in the order of the ingredients.
 */
export function refundableUnits(used: readonly (readonly InventoryStack[])[]): string[][] {
  return used.map((stacks) => stacks.flatMap((s) => Array.from({ length: s.quantity }, () => s.itemId)));
}

/** One line on what a skill does at a level, for the Body tab. */
export function describeSkill(id: SkillId, level: number): string {
  if (id === 'fighting') {
    const bonus = fightingSkillBonus(level);
    return `Damage +${bonus.damage} · accuracy +${Math.round(bonus.accuracy * 100)}%, in melee and with the bow`;
  }
  if (id === 'farming') {
    return 'No effect yet.';
  }
  if (id === 'foraging') {
    const finds = Math.round((findChanceFactor(level) - 1) * 100);
    const gathered = Math.round((gatheredFactor(level) - 1) * 100);
    return `Finds +${finds}% · gathered items +${gathered}%`;
  }
  const faster = Math.round((1 - timeFactor(level)) * 100);
  const { first, second } = refundChances(level);
  const what = id === 'building' ? 'Building' : 'Crafting';
  const parts = [`${what} takes ${faster}% less time`];
  if (first > 0) {
    parts.push(`${Math.round(first * 100)}% chance to save a resource${second > 0 ? `, ${Math.round(second * 100)}% for a second` : ''}`);
  }
  return parts.join(' · ');
}

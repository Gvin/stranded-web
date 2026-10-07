import { getItemDef } from '../data/items';
import { type CharacterSheet, getCharacterSheet } from './character';
import { canHoldWith } from './conditions';
import type { WeaponStats } from './definitions';
import { getEquipped } from './inventory';
import { FIGHTING_RULES, fightingSkillBonus, meleeAccuracyFactor, rangedAccuracyFactor, strengthDamage } from './rules';
import type { GameState, HandSlot, PlayerState } from './types';

// Fighting stats: how often the player would hit and how hard, in melee and with the bow. Nothing fights yet.

/** One source of a fighting stat, e.g. the knife's +10% accuracy. */
export interface StatPart {
  source: string;
  value: number;
}

export interface FightingStat {
  /** Chance to hit, at most FIGHTING_RULES.maxAccuracy. */
  accuracy: number;
  damage: number;
  /** What adds up to the accuracy before the Agility factor multiplies it; the first part is the base. */
  accuracyParts: StatPart[];
  agilityFactor: number;
  /** What adds up to the damage; the first part is the base. */
  damageParts: StatPart[];
}

export interface FightingStats {
  /** The hand whose item fights; none when neither arm can hold anything. */
  weaponHand?: HandSlot;
  melee: FightingStat;
  /** Only with a bow held (in both hands): its stats, or why it cannot shoot. */
  ranged?: FightingStat | { blocked: string };
}

/** The hand that fights: the right one, or the left one when the right arm cannot hold anything. */
export function weaponHand(player: PlayerState): HandSlot | undefined {
  if (canHoldWith(player, 'rightArm')) {
    return 'rightHand';
  }
  return canHoldWith(player, 'leftArm') ? 'leftHand' : undefined;
}

type Source = WeaponStats & { source: string };

/** Adds up the sources of a stat; sources that add nothing are left out, apart from the base. */
function buildStat(sources: Source[], agilityFactor: number): FightingStat {
  const parts = (pick: (s: Source) => number) =>
    sources.filter((s, index) => index === 0 || pick(s) !== 0).map((s) => ({ source: s.source, value: pick(s) }));
  const total = (list: StatPart[]) => list.reduce((sum, p) => sum + p.value, 0);
  const accuracyParts = parts((s) => s.accuracy);
  const damageParts = parts((s) => s.damage);
  // why: fractions like (0.3 + 0.15) × 0.7 come out as 0.31499…, which would show as 31% instead of 32%.
  const accuracy = Math.round(total(accuracyParts) * agilityFactor * 1e6) / 1e6;
  return {
    accuracy: Math.min(FIGHTING_RULES.maxAccuracy, Math.max(0, accuracy)),
    damage: Math.max(0, total(damageParts)),
    accuracyParts,
    agilityFactor,
    damageParts,
  };
}

function rangedStats(player: PlayerState, bow: WeaponStats & { name: string }, skill: Source, agility: number) {
  const arrow = player.arrows ? getItemDef(player.arrows.itemId) : undefined;
  if (arrow?.category !== 'resource' || !arrow.arrow) {
    return { blocked: 'No arrows in the arrow slot.' };
  }
  const shot = { source: arrow.name, damage: arrow.arrow.damage, accuracy: arrow.arrow.accuracy };
  return buildStat([{ source: bow.name, damage: bow.damage, accuracy: bow.accuracy }, shot, skill], rangedAccuracyFactor(agility));
}

/** Melee stats with the item in the weapon hand, and ranged stats when that item is a bow. */
export function getFightingStats(state: GameState, sheet: CharacterSheet = getCharacterSheet(state)): FightingStats {
  const player = state.player;
  const hand = weaponHand(player);
  const held = hand ? getEquipped(player, hand) : undefined;
  const agility = sheet.attributes.agility.effective;
  const skill = { source: 'Fighting skill', ...fightingSkillBonus(player.skills.fighting.level) };
  const melee = buildStat(
    [
      { source: 'Base', ...FIGHTING_RULES.melee },
      ...(held?.melee ? [{ source: held.name, ...held.melee }] : []),
      { source: 'Strength', damage: strengthDamage(sheet.attributes.strength.effective), accuracy: 0 },
      skill,
    ],
    meleeAccuracyFactor(agility),
  );
  const ranged = held?.ranged ? rangedStats(player, { name: held.name, ...held.ranged }, skill, agility) : undefined;
  return { weaponHand: hand, melee, ranged };
}

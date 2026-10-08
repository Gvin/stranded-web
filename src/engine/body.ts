import { applyBodyCondition, BODY_PARTS, hasBodyCondition } from './conditions';
import { releaseBlockedHands } from './inventory';
import { BODY_HEALTH_RULES, maxHealthFor } from './rules';
import { BODY_PART_IDS, type BodyConditionId, type BodyPartId, type PlayerState } from './types';

// Body part health: every part has its own health and the player's health is their sum. A part that drops low becomes
// Injured, an arm or a leg that drops very low gets Fractured, an arm or a leg at 0 is lost, and the torso or the head at
// 0 means death.

/** Arms and legs: they can be fractured and lost; the torso and the head cannot. */
export function isLimb(part: BodyPartId): boolean {
  const { kind } = BODY_PARTS[part];
  return kind === 'arm' || kind === 'leg';
}

/** A part's full max health, before conditions take anything off it. */
export function fullPartHealth(player: PlayerState, part: BodyPartId): number {
  return maxHealthFor(player.attributes.strength.base) * BODY_HEALTH_RULES.shares[part];
}

/** A part's max health now: the full max less what its conditions take off (they add up); 0 once it is missing. */
export function partMaxHealth(player: PlayerState, part: BodyPartId): number {
  if (hasBodyCondition(player, part, 'missing')) {
    return 0;
  }
  const losses: Partial<Record<BodyConditionId, number>> = BODY_HEALTH_RULES.conditionLoss;
  const loss = player.body[part].reduce((sum, condition) => sum + (losses[condition.id] ?? 0), 0);
  return fullPartHealth(player, part) * Math.max(0, 1 - loss);
}

/** The full max health of every part, for a body without conditions. */
export function fullHealthByPart(baseStrength: number): Record<BodyPartId, number> {
  const full = maxHealthFor(baseStrength);
  return Object.fromEntries(BODY_PART_IDS.map((part) => [part, full * BODY_HEALTH_RULES.shares[part]])) as Record<BodyPartId, number>;
}

export function totalHealth(player: PlayerState): number {
  return BODY_PART_IDS.reduce((sum, part) => sum + player.health[part], 0);
}

export function totalMaxHealth(player: PlayerState): number {
  return BODY_PART_IDS.reduce((sum, part) => sum + partMaxHealth(player, part), 0);
}

/** The torso or the head at 0 health means death. */
export function isFatallyHurt(player: PlayerState): boolean {
  return player.health.torso <= 0 || player.health.head <= 0;
}

/** Keeps every part's health between 0 and its max health now. */
export function clampPartHealth(player: PlayerState): void {
  for (const part of BODY_PART_IDS) {
    player.health[part] = Math.min(partMaxHealth(player, part), Math.max(0, player.health[part]));
  }
}

/** What damage did to a body part: the conditions it caused, and the items the hands had to let go of. */
export interface PartDamage {
  conditions: BodyConditionId[];
  released: string[];
}

/**
 * Takes health off a body part and applies what that causes: Injured when it drops below half its full max health,
 * Fractured when an arm or a leg drops below a quarter, Missing when an arm or a leg reaches 0. A single hit leaves at
 * least 1 health on a part that had 5 or more.
 */
export function damagePart(player: PlayerState, part: BodyPartId, amount: number, options: { singleHit?: boolean } = {}): PartDamage {
  const before = player.health[part];
  let after = Math.max(0, before - amount);
  if (options.singleHit && before >= BODY_HEALTH_RULES.hitFloorFrom) {
    after = Math.max(BODY_HEALTH_RULES.hitFloor, after);
  }
  player.health[part] = after;
  const full = fullPartHealth(player, part);
  const droppedBelow = (share: number) => before >= full * share && after < full * share;
  const conditions: BodyConditionId[] = [];
  const apply = (id: BodyConditionId) => {
    if (!hasBodyCondition(player, part, id) && applyBodyCondition(player, part, id)) {
      conditions.push(id);
    }
  };
  if (isLimb(part) && after <= 0) {
    apply('missing');
  } else {
    if (droppedBelow(BODY_HEALTH_RULES.injuredBelow)) {
      apply('injured');
    }
    if (isLimb(part) && droppedBelow(BODY_HEALTH_RULES.fracturedBelow)) {
      apply('fractured');
    }
  }
  player.health[part] = Math.min(player.health[part], partMaxHealth(player, part));
  return { conditions, released: conditions.length > 0 ? releaseBlockedHands(player) : [] };
}

/** One log line for the conditions damage caused on a part, e.g. "Your torso is injured.", or none. */
export function partDamageMessage(part: BodyPartId, conditions: readonly BodyConditionId[]): string | undefined {
  const name = BODY_PARTS[part].name.toLowerCase();
  if (conditions.includes('missing')) {
    return `Your ${name} is gone.`;
  }
  const words = conditions.map((id) => (id === 'fractured' ? 'broken' : id));
  return words.length > 0 ? `Your ${name} is ${words.join(' and ')}.` : undefined;
}

/**
 * Healing shared evenly between the body parts: each gets its share, up to its max health; the share of a part with no
 * damage is lost. Returns the health actually healed.
 */
export function healParts(player: PlayerState, amount: number): number {
  if (amount <= 0) {
    return 0;
  }
  const share = amount / BODY_PART_IDS.length;
  let healed = 0;
  for (const part of BODY_PART_IDS) {
    const gained = Math.max(0, Math.min(share, partMaxHealth(player, part) - player.health[part]));
    player.health[part] += gained;
    healed += gained;
  }
  return healed;
}

/** How much shared healing of the given amount would heal right now, without changing anything. */
export function healingFor(player: PlayerState, amount: number): number {
  const share = Math.max(0, amount) / BODY_PART_IDS.length;
  return BODY_PART_IDS.reduce((sum, part) => sum + Math.max(0, Math.min(share, partMaxHealth(player, part) - player.health[part])), 0);
}

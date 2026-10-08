import type { CharacterSheet } from '../engine/character';
import { BODY_PART_IDS } from '../engine/types';

/**
 * Health and max health as shown: every body part rounded up on its own (so a part with some health never reads 0), and
 * the totals as the sums of those, so the parts in the Body tab add up to the Health bar.
 */
export function shownHealth(sheet: CharacterSheet): { health: number; max: number } {
  return {
    health: BODY_PART_IDS.reduce((sum, part) => sum + Math.ceil(sheet.body[part].health), 0),
    max: BODY_PART_IDS.reduce((sum, part) => sum + Math.ceil(sheet.body[part].max), 0),
  };
}

import { migrateV1ToV2 } from './steps/v1ToV2';
import { migrateV2ToV3 } from './steps/v2ToV3';
import { migrateV3ToV4 } from './steps/v3ToV4';
import { SAVE_VERSION } from './version';

/** Upgrades raw save data from one format version to the next. */
export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/**
 * MIGRATIONS[n] upgrades a save of format version n to version n + 1.
 * Add an entry (with its step in ./steps) whenever SAVE_VERSION is bumped; never edit an existing one once released.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: migrateV1ToV2,
  2: migrateV2ToV3,
  3: migrateV3ToV4,
};

/** Runs the chain of migrations that brings data from `fromVersion` up to `toVersion`. */
export function runMigrations(
  state: Record<string, unknown>,
  fromVersion: number,
  toVersion: number = SAVE_VERSION,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): Record<string, unknown> {
  let current = state;
  for (let version = fromVersion; version < toVersion; version++) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new Error(`No migration from save version ${version} to ${version + 1}`);
    }
    current = migrate(current);
  }
  return current;
}

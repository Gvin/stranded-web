import { migrateV1ToV2 } from './steps/v1ToV2';
import { migrateV2ToV3 } from './steps/v2ToV3';
import { migrateV3ToV4 } from './steps/v3ToV4';
import { migrateV4ToV5 } from './steps/v4ToV5';
import { migrateV5ToV6 } from './steps/v5ToV6';
import { migrateV6ToV7 } from './steps/v6ToV7';
import { migrateV7ToV8 } from './steps/v7ToV8';
import { migrateV8ToV9 } from './steps/v8ToV9';
import { migrateV9ToV10 } from './steps/v9ToV10';
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
  4: migrateV4ToV5,
  5: migrateV5ToV6,
  6: migrateV6ToV7,
  7: migrateV7ToV8,
  8: migrateV8ToV9,
  9: migrateV9ToV10,
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

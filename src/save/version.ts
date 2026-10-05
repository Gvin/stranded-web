import packageJson from '../../package.json';

/** Version of the game build, taken from package.json. */
export const GAME_VERSION: string = packageJson.version;

/** Version of the save format. Bump it with every change to the persisted state (src/engine/types.ts). */
export const SAVE_VERSION = 3;

/** Oldest save format this game version can still load through migrations. */
export const MIN_SUPPORTED_SAVE_VERSION = 1;

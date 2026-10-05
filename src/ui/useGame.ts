import { useCallback, useRef, useState } from 'react';
import { performAction } from '../engine/game';
import type { GameState } from '../engine/types';
import { saveGame } from '../save/storage';

export interface GameController {
  state: GameState;
  /** Log entries with a higher id were produced by the last action. */
  freshAfterLogId: number | undefined;
  saveFailed: boolean;
  perform(actionId: string): void;
}

/** Holds the game state, performs actions and saves after every action. */
export function useGame(initialState: GameState): GameController {
  const [state, setState] = useState(initialState);
  const [freshAfterLogId, setFreshAfterLogId] = useState<number>();
  const [saveFailed, setSaveFailed] = useState(false);
  // why: a ref gives rapid consecutive taps the latest state instead of the one from the last render.
  const latest = useRef(initialState);

  const perform = useCallback((actionId: string) => {
    const current = latest.current;
    const next = performAction(current, actionId);
    if (next === current) {
      return;
    }
    latest.current = next;
    setFreshAfterLogId(current.log.at(-1)?.id ?? 0);
    setState(next);
    setSaveFailed(!saveGame(next));
  }, []);

  return { state, freshAfterLogId, saveFailed, perform };
}

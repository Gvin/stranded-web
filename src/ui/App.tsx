import { useEffect, useState } from 'react';
import { createNewGame } from '../engine/game';
import type { GameState } from '../engine/types';
import { loadGame, saveGame, type StoredGame } from '../save/storage';
import { GameScreen } from './GameScreen';
import { StartScreen } from './screens/StartScreen';

interface Session {
  id: number;
  state: GameState;
}

export function App() {
  const [stored] = useState<StoredGame>(() => loadGame());
  const [session, setSession] = useState<Session | null>(() => (stored.status === 'ok' ? { id: 0, state: stored.state } : null));

  useEffect(() => {
    // why: re-save a migrated game right away, so it is stored in the current format from now on.
    if (stored.status === 'ok' && stored.migratedFrom !== undefined) {
      saveGame(stored.state);
    }
  }, [stored]);

  const startNewGame = () => {
    const state = createNewGame();
    saveGame(state);
    setSession((previous) => ({ id: (previous?.id ?? 0) + 1, state }));
  };

  if (!session) {
    const notice = stored.status === 'incompatible' || stored.status === 'corrupt' ? stored.reason : undefined;
    return <StartScreen notice={notice} onStart={startNewGame} />;
  }
  return <GameScreen key={session.id} initialState={session.state} onNewGame={startNewGame} />;
}

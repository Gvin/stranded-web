import type { GameState } from '../../engine/types';
import { LogList } from '../components/LogList';

interface JournalPanelProps {
  state: GameState;
}

export function JournalPanel({ state }: JournalPanelProps) {
  return (
    <div className="panel">
      <p className="muted small">Your most recent {state.log.length} notes, newest first.</p>
      <div className="card">
        <LogList entries={[...state.log].reverse()} showTime />
      </div>
    </div>
  );
}

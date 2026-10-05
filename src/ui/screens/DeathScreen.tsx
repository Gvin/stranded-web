import { formatDuration } from '../../engine/time';
import type { GameState } from '../../engine/types';
import { Modal } from '../components/Modal';

interface DeathScreenProps {
  state: GameState;
  onNewGame(): void;
}

export function DeathScreen({ state, onNewGame }: DeathScreenProps) {
  return (
    <Modal title="You have died">
      <p className="death__cause">{state.deathCause}</p>
      <p className="muted">You survived on the island for {formatDuration(state.time)}.</p>
      <div className="button-row">
        <button type="button" className="button button--primary" onClick={onNewGame}>
          Try again
        </button>
      </div>
    </Modal>
  );
}

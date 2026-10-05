import { formatClock, getDayPeriod, toClock } from '../../engine/time';
import type { GameState } from '../../engine/types';
import { getLocationInfo } from '../../engine/world';

interface TopBarProps {
  state: GameState;
  onMenu(): void;
}

export function TopBar({ state, onMenu }: TopBarProps) {
  const location = getLocationInfo(state, state.player.locationId);
  return (
    <div className="topbar">
      <div className="topbar__time">
        <span className="topbar__day">Day {toClock(state.time).day}</span>
        <span className="topbar__clock">{formatClock(state.time)}</span>
        <span className="topbar__period">{getDayPeriod(state.time)}</span>
      </div>
      <div className="topbar__location" title={location.name}>
        📍 {location.name}
      </div>
      <button type="button" className="icon-button" onClick={onMenu} aria-label="Menu">
        ☰
      </button>
    </div>
  );
}

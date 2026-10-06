import { getBodyTemperature, getWeather, temperatureId } from '../../engine/environment';
import { TEMPERATURE_NAMES } from '../../engine/rules';
import type { GameState } from '../../engine/types';
import { Icon } from './Icon';

interface EnvironmentBarProps {
  state: GameState;
}

/** Weather and island temperature; the player's own temperature is in the Body tab. */
export function EnvironmentBar({ state }: EnvironmentBarProps) {
  const weather = getWeather(state);
  const environment = temperatureId(getBodyTemperature(state).environment);
  return (
    <div className="environment" title="Weather and temperature on the island">
      <Icon name={weather.icon} size={16} />
      {weather.name} · <span className={`temperature temperature--${environment}`}>{TEMPERATURE_NAMES[environment]}</span>
    </div>
  );
}

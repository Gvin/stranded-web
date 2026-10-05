import { STAT_NAMES } from '../../engine/rules';
import { STAT_IDS, type StatId } from '../../engine/types';

interface StatBarsProps {
  stats: Record<StatId, number>;
  max: Record<StatId, number>;
}

/** Thirst and hunger are bad when high; health and energy are bad when low. */
const LOWER_IS_BETTER: Record<StatId, boolean> = { health: false, energy: false, thirst: true, hunger: true };

export function StatBars({ stats, max }: StatBarsProps) {
  return (
    <div className="stats">
      {STAT_IDS.map((id) => {
        // why: health rounds up, so the bar never reads 0 while the player is still alive.
        const value = id === 'health' ? Math.ceil(stats[id]) : Math.round(stats[id]);
        const fraction = max[id] > 0 ? Math.min(1, stats[id] / max[id]) : 0;
        const danger = LOWER_IS_BETTER[id] ? fraction > 0.75 : fraction < 0.25;
        return (
          <div
            key={id}
            className={`stat stat--${id}${danger ? ' stat--danger' : ''}`}
            title={LOWER_IS_BETTER[id] ? `${STAT_NAMES[id]}: lower is better` : undefined}
          >
            <div className="stat__label">
              <span>{STAT_NAMES[id]}</span>
              <span className="stat__value">
                {value}/{max[id]}
              </span>
            </div>
            <div
              className="stat__track"
              role="progressbar"
              aria-label={STAT_NAMES[id]}
              aria-valuemin={0}
              aria-valuemax={max[id]}
              aria-valuenow={value}
            >
              <div className="stat__fill" style={{ width: `${fraction * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

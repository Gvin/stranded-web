import { ENEMIES } from '../../data/enemies';
import type { CharacterSheet } from '../../engine/character';
import { fightDistance, theEnemy } from '../../engine/fight';
import { FIGHT_RULES } from '../../engine/rules';
import type { FightState, GameState } from '../../engine/types';
import type { ActionView, PerformAction } from '../actionView';
import { ActionButton } from '../components/ActionButton';
import { Icon } from '../components/Icon';
import { LogList } from '../components/LogList';

interface FightPanelProps {
  state: GameState;
  fight: FightState;
  sheet: CharacterSheet;
  actions: readonly ActionView[];
  freshAfterLogId: number | undefined;
  onPerform: PerformAction;
}

function HealthBar({ label, value, max }: { label: string; value: number; max: number }) {
  // why: health rounds up, so the bar never reads 0 while the fighter is still alive.
  const shown = Math.ceil(value);
  return (
    <div className="stat stat--health">
      <div className="stat__label">
        <span>{label}</span>
        <span className="stat__value">
          {shown}/{max}
        </span>
      </div>
      <div
        className="stat__track"
        role="progressbar"
        aria-label={`${label} health`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={shown}
      >
        <div className="stat__fill" style={{ width: `${max > 0 ? Math.min(1, value / max) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

/** Replaces the Explore panel while a fight lasts: both healths, the battle field and the fight actions. */
export function FightPanel({ state, fight, sheet, actions, freshAfterLogId, onPerform }: FightPanelProps) {
  const enemy = ENEMIES[fight.enemyId];
  const fresh = freshAfterLogId === undefined ? state.log.slice(-3) : state.log.filter((e) => e.id > freshAfterLogId);
  const distance = fightDistance(fight);
  const name = theEnemy(enemy);

  return (
    <div className="panel fight">
      {fresh.length > 0 && (
        <section className="narration" aria-live="polite">
          <LogList entries={fresh} />
        </section>
      )}

      <section className="card fight__card">
        <div className="location__heading">
          <h1 className="location__name">
            <Icon name={enemy.icon} size={26} />
            {enemy.name}
          </h1>
          {enemy.flying && <span className="badge">Flying</span>}
        </div>
        <div className="fight__bars">
          <HealthBar label="You" value={state.player.stats.health} max={sheet.max.health} />
          <HealthBar label={enemy.name} value={fight.enemyHealth} max={enemy.health} />
        </div>
        <ol
          className="field"
          style={{ gridTemplateColumns: `repeat(${FIGHT_RULES.fieldSize}, minmax(0, 1fr))` }}
          aria-label={`The field: you are ${distance} ${distance === 1 ? 'space' : 'spaces'} from ${name}`}
        >
          {Array.from({ length: FIGHT_RULES.fieldSize }, (_, space) => (
            <li
              key={space}
              className={`field__cell${space === fight.playerAt ? ' field__cell--you' : ''}${space === fight.enemyAt ? ' field__cell--enemy' : ''}`}
            >
              {space === fight.playerAt && <Icon name="person" size={20} />}
              {space === fight.enemyAt && <Icon name={enemy.icon} size={20} />}
            </li>
          ))}
        </ol>
        <p className="muted small">
          {distance === 1 ? 'Right next to you' : `${distance} spaces away`} · {fight.seen ? 'it has seen you' : 'it has not seen you yet'}
        </p>
      </section>

      <section className="actions fight__actions">
        {actions
          .filter((a) => a.action.category === 'fight')
          .map((a) => (
            <ActionButton key={a.action.id} view={a} onPerform={onPerform} />
          ))}
      </section>
      <p className="muted small">You can change weapons in the Bag; it takes a turn.</p>
    </div>
  );
}

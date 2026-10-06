import type { CharacterSheet } from '../../engine/character';
import { BODY_CONDITIONS, BODY_PARTS, bodyConditionHealsIn, bodyConditionSeverity } from '../../engine/conditions';
import { ATTRIBUTE_HINTS, NUTRIENT_NAMES, NUTRITION_RULES } from '../../engine/rules';
import { formatDuration } from '../../engine/time';
import { ATTRIBUTE_IDS, BODY_PART_IDS, type GameState, NUTRIENT_IDS } from '../../engine/types';
import type { ActionView, PerformAction } from '../actionView';
import { ActionButton } from '../components/ActionButton';

interface CharacterPanelProps {
  state: GameState;
  sheet: CharacterSheet;
  actions: readonly ActionView[];
  onPerform: PerformAction;
}

/** Food groups at or below this are shown as a warning: a few more meals of other kinds will empty them. */
const LOW_NUTRITION = 5;

function formatPercent(percent: number): string {
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

export function CharacterPanel({ state, sheet, actions, onPerform }: CharacterPanelProps) {
  const bodyActions = (part: string) => actions.filter((a) => a.action.category === 'body' && a.action.targetId === part);

  return (
    <div className="panel">
      <section>
        <h2 className="section-title">Condition</h2>
        {sheet.conditions.length === 0 ? (
          <p className="card muted">You feel as well as anyone stranded on an island can.</p>
        ) : (
          <ul className="conditions">
            {sheet.conditions.map((condition) => (
              <li key={condition.id} className="card condition">
                <div className="condition__heading">
                  <span className="chip chip--bad">{condition.name}</span>
                  {condition.endsIn !== undefined && <span className="muted small">gone in {formatDuration(condition.endsIn)}</span>}
                </div>
                <p className="small">{condition.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="section-title">Body</h2>
        <ul className="card body">
          {BODY_PART_IDS.map((part) => {
            const conditions = state.player.body[part];
            return (
              <li key={part} className="body__part">
                <div className="body__row">
                  <span className="body__name">{BODY_PARTS[part].name}</span>
                  <span className="body__chips">
                    {conditions.length === 0 && <span className="chip chip--ok">Healthy</span>}
                    {conditions.map((condition) => {
                      const def = BODY_CONDITIONS[condition.id];
                      const healsIn = bodyConditionHealsIn(condition);
                      const severity = bodyConditionSeverity(condition);
                      const tone = def.treated ? 'treated' : 'bad';
                      return (
                        <span key={condition.id} className={`chip chip--${tone}`} title={def.description}>
                          {def.name}
                          {severity && ` (${severity})`}
                          {healsIn !== undefined && <span className="chip__time"> · {formatDuration(healsIn)}</span>}
                          {condition.id === 'fractured' && <span className="chip__time"> · needs a splint</span>}
                        </span>
                      );
                    })}
                  </span>
                </div>
                {bodyActions(part).length > 0 && (
                  <div className="actions actions--inline">
                    {bodyActions(part).map((a) => (
                      <ActionButton key={a.action.id} view={a} onPerform={onPerform} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="muted small">Times show how long until a condition heals. Bandaged wounds heal twice as fast.</p>
      </section>

      <section>
        <h2 className="section-title">Nutrition</h2>
        <div className="card nutrition">
          {NUTRIENT_IDS.map((id) => {
            const value = state.player.nutrition[id];
            return (
              <div key={id} className={`stat stat--${id}${value <= LOW_NUTRITION ? ' stat--danger' : ''}`}>
                <div className="stat__label">
                  <span>{NUTRIENT_NAMES[id]}</span>
                  <span className="stat__value">{value}</span>
                </div>
                <div
                  className="stat__track"
                  role="progressbar"
                  aria-label={NUTRIENT_NAMES[id]}
                  aria-valuemin={0}
                  aria-valuemax={NUTRITION_RULES.total}
                  aria-valuenow={value}
                >
                  <div className="stat__fill" style={{ width: `${(value / NUTRITION_RULES.total) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="muted small">
          Every meal adds {NUTRITION_RULES.gain} to its food group and takes {NUTRITION_RULES.loss} from the others. If a group runs out,
          malnutrition weakens all your attributes by {NUTRITION_RULES.malnutritionPenalty}%.
        </p>
      </section>

      <section>
        <h2 className="section-title">Attributes</h2>
        <ul className="attributes">
          {ATTRIBUTE_IDS.map((id) => {
            const attribute = sheet.attributes[id];
            const changed = attribute.percent !== 0;
            return (
              <li key={id} className="card attribute">
                <div className="attribute__heading">
                  <span className="attribute__name">{attribute.name}</span>
                  <span className="attribute__value">
                    <strong className={attribute.percent < 0 ? 'text-bad' : attribute.percent > 0 ? 'text-good' : undefined}>
                      {Math.round(attribute.effective)}
                    </strong>
                    {changed && <span className="muted"> / {attribute.base}</span>}
                    {changed && (
                      <span className={attribute.percent < 0 ? 'text-bad' : 'text-good'}> ({formatPercent(attribute.percent)})</span>
                    )}
                  </span>
                </div>
                <p className="muted small">{ATTRIBUTE_HINTS[id]}</p>
                <div className="xp" title="Training progress">
                  <div className="xp__fill" style={{ width: `${(attribute.xp / attribute.xpToNext) * 100}%` }} />
                </div>
                {attribute.modifiers.length > 0 && (
                  <ul className="modifiers">
                    {attribute.modifiers.map((m) => (
                      <li key={m.source} className="small">
                        <span>{m.source}</span>
                        <span className={m.percent < 0 ? 'text-bad' : 'text-good'}>{formatPercent(m.percent)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

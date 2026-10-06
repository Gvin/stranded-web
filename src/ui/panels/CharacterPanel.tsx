import type { CharacterSheet } from '../../engine/character';
import { BODY_CONDITIONS, BODY_PARTS, bodyConditionHealsIn, bodyConditionSeverity } from '../../engine/conditions';
import { getBodyTemperature, temperatureId, type TemperatureFactor } from '../../engine/environment';
import {
  ATTRIBUTE_HINTS,
  ENVIRONMENT_RULES,
  NUTRIENT_NAMES,
  NUTRITION_RULES,
  SKILL_NAMES,
  SKILL_RULES,
  TEMPERATURE_NAMES,
  type TemperatureId,
} from '../../engine/rules';
import { formatDuration } from '../../engine/time';
import { describeSkill } from '../../engine/skills';
import { ATTRIBUTE_IDS, BODY_PART_IDS, type GameState, NUTRIENT_IDS, SKILL_IDS } from '../../engine/types';
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

function formatChange(change: number): string {
  return `${change > 0 ? '+' : '−'}${Math.abs(change)}`;
}

/** What a body temperature does to thirst and hunger, e.g. "Thirst grows 25% faster." */
function temperatureEffect(id: TemperatureId): string {
  const rates = ENVIRONMENT_RULES.rates[id];
  const parts = (['thirst', 'hunger'] as const)
    .filter((stat) => rates[stat] !== 1)
    .map((stat) => `${stat} grows ${Math.round(Math.abs(rates[stat] - 1) * 100)}% ${rates[stat] > 1 ? 'faster' : 'slower'}`);
  const text = parts.length === 0 ? 'No effect on thirst or hunger' : parts.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function FactorList({ factors }: { factors: readonly TemperatureFactor[] }) {
  return (
    <>
      {factors.map((factor) => (
        <li key={factor.label} className="small">
          <span>{factor.label}</span>
          <span>{formatChange(factor.change)}</span>
        </li>
      ))}
    </>
  );
}

function TemperatureSection({ state }: { state: GameState }) {
  const temperature = getBodyTemperature(state);
  const environment = temperatureId(temperature.environment);
  const body = temperatureId(temperature.value);
  const { veryHot, veryCold } = state.player.exposure;
  const exposed = body === 'veryHot' ? veryHot : body === 'veryCold' ? veryCold : 0;
  const limit = formatDuration(ENVIRONMENT_RULES.exposureMinutes);
  return (
    <section>
      <h2 className="section-title">Temperature</h2>
      <div className="card temperature-card">
        <div className="temperature-card__row">
          <span className="temperature-card__label">Body temperature</span>
          <span className={`temperature temperature--${body}`}>{TEMPERATURE_NAMES[body]}</span>
        </div>
        <p className="small">{temperatureEffect(body)}</p>
        <ul className="modifiers">
          <FactorList factors={temperature.environmentFactors} />
          <li className="small temperature-card__total">
            <span>Island</span>
            <span className={`temperature temperature--${environment}`}>{TEMPERATURE_NAMES[environment]}</span>
          </li>
          <FactorList factors={temperature.bodyFactors} />
        </ul>
        {exposed > 0 && exposed <= ENVIRONMENT_RULES.exposureMinutes && (
          <p className="small text-bad">
            {TEMPERATURE_NAMES[body]} for {formatDuration(exposed)}. After {limit} without a break you{' '}
            {body === 'veryHot' ? 'overheat' : 'start freezing'}.
          </p>
        )}
      </div>
    </section>
  );
}

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

      <TemperatureSection state={state} />

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
        <h2 className="section-title">Skills</h2>
        <ul className="card skills">
          {SKILL_IDS.map((id) => {
            const skill = state.player.skills[id];
            const maxed = skill.level >= SKILL_RULES.maxLevel;
            return (
              <li key={id} className="skill">
                <div className="skill__heading">
                  <span className="skill__name">{SKILL_NAMES[id]}</span>
                  <span className="skill__level">
                    Level {skill.level}
                    <span className="muted"> / {SKILL_RULES.maxLevel}</span>
                  </span>
                </div>
                <div className="xp" title={maxed ? 'Highest level' : `${skill.points} / ${SKILL_RULES.pointsPerLevel} to the next level`}>
                  <div className="xp__fill" style={{ width: `${maxed ? 100 : (skill.points / SKILL_RULES.pointsPerLevel) * 100}%` }} />
                </div>
                <p className="muted small">{describeSkill(id, skill.level)}</p>
              </li>
            );
          })}
        </ul>
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

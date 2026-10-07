import { BUILDINGS, previousLevel } from '../../data/buildings';
import { formatDuration } from '../../engine/time';
import type { BuildingId, GameState } from '../../engine/types';
import { getLocationView } from '../../engine/views';
import type { ActionView, PerformAction } from '../actionView';
import { ActionButton } from '../components/ActionButton';
import { CostChips } from '../components/CostChips';
import { Icon, ItemIcon } from '../components/Icon';
import { ItemHealth } from '../components/ItemHealth';
import { LogList } from '../components/LogList';

interface ExplorePanelProps {
  state: GameState;
  actions: readonly ActionView[];
  freshAfterLogId: number | undefined;
  onPerform: PerformAction;
}

const TYPE_LABELS: Record<string, string> = {
  beach: 'Beach',
  forest: 'Forest',
  spring: 'Spring',
  rocks: 'Rocks',
  clearing: 'Clearing',
  camp: 'Camp',
};

/** A row of small buttons for one kind of action on an object, e.g. every way to light a fire. */
function ActionRow({ title, views, onPerform }: { title: string; views: readonly ActionView[]; onPerform: PerformAction }) {
  if (views.length === 0) {
    return null;
  }
  // why: when only some buttons are blocked their popups explain why; a shared reason (such as rain) is worth a line.
  const reasons = new Set(views.map((v) => v.blocked));
  const reason = reasons.size === 1 ? views[0]?.blocked : undefined;
  return (
    <div className="fuel">
      <p className="fuel__title">{title}</p>
      <div className="item__actions">
        {views.map((v) => (
          <ActionButton
            key={v.action.id}
            view={v}
            onPerform={onPerform}
            compact
            icon={v.action.itemId && <ItemIcon itemId={v.action.itemId} size={18} />}
          />
        ))}
      </div>
      {reason && <p className="action__reason">{reason}</p>}
    </div>
  );
}

/** Buildings that can be started here, each with its cost and number of steps; collapsed until opened. */
function BuildSection({ state, views, onPerform }: { state: GameState; views: readonly ActionView[]; onPerform: PerformAction }) {
  if (views.length === 0) {
    return null;
  }
  return (
    <details className="build">
      <summary className="section-title build__summary">Build here ({views.length})</summary>
      <ul className="recipes">
        {views.map((view) => {
          const building = BUILDINGS[view.action.targetId as BuildingId];
          const below = previousLevel(building.id);
          return (
            <li key={building.id} className="card recipe">
              <div className="recipe__heading">
                <Icon name={building.icon} size={32} />
                <h3 className="recipe__name">{building.name}</h3>
              </div>
              <p className="small">{building.description}</p>
              {below && <p className="muted small">Built on top of your {below.name.toLowerCase()}, which it replaces.</p>}
              <p className="muted small">
                {building.steps} {building.steps === 1 ? 'step' : 'steps'} · {formatDuration(view.action.minutes)} and ⚡
                {view.action.energy} each · materials are used up by the first step
              </p>
              <CostChips state={state} ingredients={building.ingredients} needs={building.tools ?? []} />
              <ActionButton view={{ ...view, action: { ...view.action, description: undefined } }} onPerform={onPerform} />
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function ExplorePanel({ state, actions, freshAfterLogId, onPerform }: ExplorePanelProps) {
  const view = getLocationView(state);
  const fresh = freshAfterLogId === undefined ? state.log.slice(-3) : state.log.filter((e) => e.id > freshAfterLogId);
  const listedIds = new Set(view.objects.map((o) => o.id));
  const forTarget = (id: string) =>
    actions.filter((a) => (a.action.category === 'object' || a.action.category === 'building') && a.action.targetId === id);
  const unfinished = new Set(view.objects.map((o) => o.construction).filter((id) => id !== undefined));
  const forObject = (object: (typeof view.objects)[number]) =>
    object.construction
      ? actions.filter((a) => a.action.category === 'build' && a.action.targetId === object.construction)
      : forTarget(object.id);
  // Hidden objects are not listed, so their actions show up together with the general ones.
  const aroundYou = actions.filter(
    (a) => a.action.category === 'location' || (a.action.category === 'object' && !listedIds.has(a.action.targetId ?? '')),
  );
  const paths = actions.filter((a) => a.action.category === 'travel');
  const builds = actions.filter((a) => a.action.category === 'build' && !unfinished.has(a.action.targetId as BuildingId));
  const pickups = new Map(actions.filter((a) => a.action.category === 'pickup').map((a) => [a.action.targetId, a]));

  return (
    <div className="panel explore">
      {fresh.length > 0 && (
        <section className="narration" aria-live="polite">
          <LogList entries={fresh} />
        </section>
      )}

      <section className="card location">
        <div className="location__heading">
          <h1 className="location__name">{view.name}</h1>
          <span className="badge">{TYPE_LABELS[view.type] ?? view.type}</span>
        </div>
        <p className="location__description">{view.description}</p>
      </section>

      {view.objects.length > 0 && (
        <section>
          <h2 className="section-title">You see</h2>
          <div className="objects">
            {view.objects.map((object) => {
              const objectActions = forObject(object).filter((a) => !a.action.group);
              return (
                <article key={object.id} className="card object">
                  <div className="object__heading">
                    <h3 className="object__name">
                      {object.icon && <Icon name={object.icon} size={22} />}
                      {object.name}
                    </h3>
                    {object.status && <span className="object__status">{object.status}</span>}
                  </div>
                  <p className="object__description">{object.description}</p>
                  {objectActions.length > 0 && (
                    <div className="actions">
                      {objectActions.map((a) => (
                        <ActionButton
                          key={a.action.id}
                          view={a}
                          onPerform={onPerform}
                          icon={a.action.itemId && <ItemIcon itemId={a.action.itemId} size={20} />}
                        />
                      ))}
                    </div>
                  )}
                  <ActionRow
                    title="Light the fire"
                    views={forTarget(object.id).filter((a) => a.action.group === 'light')}
                    onPerform={onPerform}
                  />
                  <ActionRow
                    title="Add to the fire"
                    views={forTarget(object.id).filter((a) => a.action.group === 'fuel')}
                    onPerform={onPerform}
                  />
                </article>
              );
            })}
          </div>
        </section>
      )}

      <BuildSection state={state} views={builds} onPerform={onPerform} />

      {view.groundItems.length > 0 && (
        <section>
          <h2 className="section-title">On the ground</h2>
          <ul className="card ground">
            {view.groundItems.map((item) => {
              const pickup = pickups.get(String(item.id));
              return (
                <li key={item.id} className="ground__item">
                  <ItemIcon itemId={item.def.id} size={28} />
                  <div className="ground__text">
                    <span className="ground__name">
                      {item.def.name}
                      {item.quantity > 1 && <span className="muted"> ×{item.quantity}</span>}
                      <ItemHealth itemId={item.def.id} health={item.health} lit={item.lit} />
                    </span>
                    <span className="ground__expiry">gone in {formatDuration(item.expiresIn)}</span>
                  </div>
                  {pickup && <ActionButton view={pickup} onPerform={onPerform} compact label="Pick up" />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {aroundYou.length > 0 && (
        <section>
          <h2 className="section-title">Around you</h2>
          <div className="actions">
            {aroundYou.map((a) => (
              <ActionButton key={a.action.id} view={a} onPerform={onPerform} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">Paths</h2>
        <div className="actions">
          {paths.map((a) => (
            <ActionButton key={a.action.id} view={a} onPerform={onPerform} />
          ))}
        </div>
      </section>
    </div>
  );
}

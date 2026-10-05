import { formatDuration } from '../../engine/time';
import type { GameState } from '../../engine/types';
import { getLocationView } from '../../engine/views';
import type { ActionView, PerformAction } from '../actionView';
import { ActionButton } from '../components/ActionButton';
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

function FuelRow({ views, onPerform }: { views: readonly ActionView[]; onPerform: PerformAction }) {
  if (views.length === 0) {
    return null;
  }
  const reason = views.find((v) => v.blocked)?.blocked;
  return (
    <div className="fuel">
      <p className="fuel__title">Add to the fire</p>
      <div className="item__actions">
        {views.map((v) => (
          <ActionButton key={v.action.id} view={v} onPerform={onPerform} compact />
        ))}
      </div>
      {reason && <p className="action__reason">{reason}</p>}
    </div>
  );
}

export function ExplorePanel({ state, actions, freshAfterLogId, onPerform }: ExplorePanelProps) {
  const view = getLocationView(state);
  const fresh = freshAfterLogId === undefined ? state.log.slice(-3) : state.log.filter((e) => e.id > freshAfterLogId);
  const listedIds = new Set(view.objects.map((o) => o.id));
  const forTarget = (id: string) =>
    actions.filter((a) => (a.action.category === 'object' || a.action.category === 'building') && a.action.targetId === id);
  // Hidden objects are not listed, so their actions show up together with the general ones.
  const aroundYou = actions.filter(
    (a) => a.action.category === 'location' || (a.action.category === 'object' && !listedIds.has(a.action.targetId ?? '')),
  );
  const paths = actions.filter((a) => a.action.category === 'travel');
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
            {view.objects.map((object) => (
              <article key={object.id} className="card object">
                <div className="object__heading">
                  <h3 className="object__name">{object.name}</h3>
                  {object.status && <span className="object__status">{object.status}</span>}
                </div>
                <p className="object__description">{object.description}</p>
                <div className="actions">
                  {forTarget(object.id)
                    .filter((a) => !a.action.group)
                    .map((a) => (
                      <ActionButton key={a.action.id} view={a} onPerform={onPerform} />
                    ))}
                </div>
                <FuelRow views={forTarget(object.id).filter((a) => a.action.group === 'fuel')} onPerform={onPerform} />
              </article>
            ))}
          </div>
        </section>
      )}

      {view.groundItems.length > 0 && (
        <section>
          <h2 className="section-title">On the ground</h2>
          <ul className="card ground">
            {view.groundItems.map((item) => {
              const pickup = pickups.get(String(item.id));
              return (
                <li key={item.id} className="ground__item">
                  <div>
                    <span className="ground__name">
                      {item.def.name}
                      {item.quantity > 1 && <span className="muted"> ×{item.quantity}</span>}
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

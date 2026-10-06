import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatDuration } from '../../engine/time';
import type { ActionView } from '../actionView';
import { ItemIcon } from './Icon';
import { useAnchoredPosition } from './useAnchoredPosition';

interface ActionPopupProps {
  id: string;
  view: ActionView;
  anchor: HTMLElement;
}

/** Rich details of an action — explanation, requirements and possible gains — floating next to its button. */
export function ActionPopup({ id, view, anchor }: ActionPopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const position = useAnchoredPosition(anchor, ref);
  const { action, blocked, requirements, energyShortfall } = view;

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className="popup"
      style={position ? { top: position.top, left: position.left } : { top: -9999, left: -9999 }}
    >
      <div className="popup__heading">
        <strong>{action.label}</strong>
        <span className="popup__meta">
          {[action.minutes > 0 ? formatDuration(action.minutes) : undefined, action.energy > 0 ? `⚡${action.energy}` : undefined]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      {action.description && <p>{action.description}</p>}
      {action.details && <p className="popup__details">{action.details}</p>}

      {(requirements.length > 0 || energyShortfall > 0) && (
        <section>
          <h4 className="popup__title">Requirements</h4>
          <ul className="popup__list">
            {requirements.map((r) => (
              <li key={r.label} className={r.met ? 'popup__ok' : 'popup__missing'}>
                {r.met ? '✓' : '✗'} {r.label}
              </li>
            ))}
            {energyShortfall > 0 && (
              <li className="popup__missing">
                ⚠ You are {energyShortfall} energy short — it will cost about {energyShortfall} health
              </li>
            )}
          </ul>
        </section>
      )}

      {action.gains && action.gains.length > 0 && (
        <section>
          <h4 className="popup__title">Possible gains</h4>
          <ul className="popup__list">
            {action.gains.map((gain) => (
              <li key={gain.label} className="popup__gain">
                {gain.itemId ? <ItemIcon itemId={gain.itemId} size={16} /> : '•'} {gain.label}
                {gain.chance !== undefined && <span className="popup__chance"> — {Math.round(gain.chance * 100)}%</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {blocked && <p className="popup__blocked">{blocked}</p>}
    </div>,
    document.body,
  );
}

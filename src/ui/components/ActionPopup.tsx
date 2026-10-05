import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ATTRIBUTE_NAMES } from '../../engine/rules';
import { formatDuration } from '../../engine/time';
import { ATTRIBUTE_IDS } from '../../engine/types';
import type { ActionView } from '../actionView';

interface ActionPopupProps {
  id: string;
  view: ActionView;
  anchor: HTMLElement;
}

const MARGIN = 8;

/** Rich details of an action — explanation, requirements and possible gains — floating next to its button. */
export function ActionPopup({ id, view, anchor }: ActionPopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>();
  const { action, blocked, requirements, energyShortfall } = view;
  const trained = ATTRIBUTE_IDS.filter((a) => action.trains?.[a]).map((a) => ATTRIBUTE_NAMES[a]);

  useLayoutEffect(() => {
    const popup = ref.current;
    if (!popup) {
      return;
    }
    const target = anchor.getBoundingClientRect();
    const { width, height } = popup.getBoundingClientRect();
    const below = target.bottom + MARGIN;
    const top = below + height <= window.innerHeight - MARGIN ? below : Math.max(MARGIN, target.top - height - MARGIN);
    const left = Math.min(Math.max(MARGIN, target.left), window.innerWidth - width - MARGIN);
    setPosition({ top, left });
  }, [anchor]);

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
          {action.minutes > 0 ? formatDuration(action.minutes) : 'instant'}
          {action.energy > 0 && ` · ⚡${action.energy}`}
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
              <li key={gain.label}>
                • {gain.label}
                {gain.chance !== undefined && <span className="popup__chance"> — {Math.round(gain.chance * 100)}%</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {trained.length > 0 && <p className="popup__trains">Practises: {trained.join(', ')}</p>}
      {blocked && <p className="popup__blocked">{blocked}</p>}
    </div>,
    document.body,
  );
}

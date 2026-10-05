import { type PointerEvent, useEffect, useId, useRef, useState } from 'react';
import { formatDuration } from '../../engine/time';
import type { ActionView, PerformAction } from '../actionView';
import { ActionPopup } from './ActionPopup';

interface ActionButtonProps {
  view: ActionView;
  onPerform: PerformAction;
  /** Compact buttons skip the description, e.g. inside item rows. */
  compact?: boolean;
  label?: string;
}

const HOVER_DELAY = 300;
const LONG_PRESS = 450;

export function ActionButton({ view, onPerform, compact, label }: ActionButtonProps) {
  const { action, blocked, energyShortfall } = view;
  const popupId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const [popupOpen, setPopupOpen] = useState(false);

  const clearTimer = () => window.clearTimeout(timer.current);

  useEffect(() => {
    if (!popupOpen) {
      return undefined;
    }
    // A long-press popup closes with the next touch anywhere.
    const close = (event: Event) => {
      if (event.target !== button.current) {
        setPopupOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [popupOpen]);

  useEffect(() => clearTimer, []);

  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') {
      clearTimer();
      timer.current = window.setTimeout(() => setPopupOpen(true), HOVER_DELAY);
    }
  };
  const onPointerLeave = (event: PointerEvent) => {
    clearTimer();
    if (event.pointerType === 'mouse') {
      setPopupOpen(false);
    }
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') {
      longPressed.current = false;
      clearTimer();
      timer.current = window.setTimeout(() => {
        longPressed.current = true;
        setPopupOpen(true);
      }, LONG_PRESS);
    }
  };
  const onClick = () => {
    clearTimer();
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    setPopupOpen(false);
    if (!blocked) {
      onPerform(action.id);
    }
  };

  const time = action.minutes > 0 ? formatDuration(action.minutes) : 'instant';
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`action${compact ? ' action--compact' : ''}${blocked ? ' action--blocked' : ''}`}
        aria-disabled={blocked !== undefined}
        aria-describedby={popupOpen ? popupId : undefined}
        onClick={onClick}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerUp={clearTimer}
        onPointerCancel={clearTimer}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="action__row">
          <span className="action__label">{label ?? action.label}</span>
          <span className="action__meta">
            {time}
            {action.energy > 0 && <span className={energyShortfall > 0 ? 'action__energy--short' : undefined}> · ⚡{action.energy}</span>}
          </span>
        </span>
        {!compact && blocked && <span className="action__reason">{blocked}</span>}
        {!compact && !blocked && action.description && <span className="action__description">{action.description}</span>}
      </button>
      {popupOpen && button.current && <ActionPopup id={popupId} view={view} anchor={button.current} />}
    </>
  );
}

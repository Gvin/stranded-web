import { type PointerEvent, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPosition } from './useAnchoredPosition';

interface InfoTipProps {
  /** What the tip is about, for screen readers ("About Foraging"). */
  label: string;
  text: string;
}

/** A small "?" button with a short explanation: it shows while a mouse hovers it, or after a tap until the next touch. */
export function InfoTip({ label, text }: InfoTipProps) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const pointer = useRef<string>('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const close = (event: Event) => {
      if (!button.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const onPointerEnter = (event: PointerEvent) => event.pointerType === 'mouse' && setOpen(true);
  const onPointerLeave = (event: PointerEvent) => event.pointerType === 'mouse' && setOpen(false);
  // why: a mouse already opened the tip by hovering, so its click must not close it again; taps and keys toggle it.
  const onClick = () => {
    const byMouse = pointer.current === 'mouse';
    pointer.current = '';
    setOpen((wasOpen) => byMouse || !wasOpen);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className="info-tip"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onPointerDown={(event) => (pointer.current = event.pointerType)}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      >
        <span className="info-tip__mark" aria-hidden="true">
          ?
        </span>
      </button>
      {open && button.current && <TipPopup id={id} text={text} anchor={button.current} />}
    </>
  );
}

function TipPopup({ id, text, anchor }: { id: string; text: string; anchor: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  const position = useAnchoredPosition(anchor, ref);
  return createPortal(
    <div ref={ref} id={id} role="tooltip" className="popup popup--tip" style={position ?? { top: -9999, left: -9999 }}>
      {text}
    </div>,
    document.body,
  );
}

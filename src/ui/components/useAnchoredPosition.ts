import { type RefObject, useLayoutEffect, useState } from 'react';

const MARGIN = 8;

/**
 * Where to put a floating element next to its anchor: below it, or above it when there is no room, always between the
 * sticky header and the phone's bottom tab bar. Undefined until measured.
 */
export function useAnchoredPosition(
  anchor: HTMLElement,
  floating: RefObject<HTMLElement | null>,
): { top: number; left: number } | undefined {
  const [position, setPosition] = useState<{ top: number; left: number }>();

  useLayoutEffect(() => {
    const element = floating.current;
    if (!element) {
      return;
    }
    const target = anchor.getBoundingClientRect();
    const { width, height } = element.getBoundingClientRect();
    // why: the sticky header and the phone's fixed bottom tab bar stay on top of the page, so the element must fit between them.
    const minTop = (document.querySelector('.game__header')?.getBoundingClientRect().bottom ?? 0) + MARGIN;
    const maxBottom = (document.querySelector('.tabs--bottom')?.getBoundingClientRect().top ?? window.innerHeight) - MARGIN;
    const below = target.bottom + MARGIN;
    const top = below + height <= maxBottom ? below : Math.max(minTop, target.top - height - MARGIN);
    const left = Math.min(Math.max(MARGIN, target.left), window.innerWidth - width - MARGIN);
    setPosition({ top, left });
  }, [anchor, floating]);

  return position;
}

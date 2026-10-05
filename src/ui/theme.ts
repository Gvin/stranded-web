import { useLayoutEffect } from 'react';
import { type DayPeriod, getDayPeriod } from '../engine/time';

/** Background colour per time of day, matching the palettes in styles.css (used for the mobile browser bar). */
const THEME_COLORS: Record<DayPeriod, string> = {
  Night: '#0a1217',
  Dawn: '#1f2436',
  Morning: '#e8efec',
  Afternoon: '#f3ead9',
  Evening: '#261f30',
};

/** Switches the page palette with the time of day: the darker it is on the island, the darker the interface. */
export function useDayPeriodTheme(time: number): void {
  const period = getDayPeriod(time);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.period = period.toLowerCase();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[period]);
    // why: colours only fade once the first palette is painted, so loading a game does not fade in from night.
    if (!root.dataset.themeReady) {
      requestAnimationFrame(() => requestAnimationFrame(() => (root.dataset.themeReady = 'true')));
    }
  }, [period]);
}

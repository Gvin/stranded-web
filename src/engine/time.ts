export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** Clock hour at which the game starts on day 1. */
export const START_HOUR = 7;

export interface ClockTime {
  day: number;
  hour: number;
  minute: number;
}

export function toClock(time: number): ClockTime {
  const total = time + START_HOUR * MINUTES_PER_HOUR;
  return {
    day: Math.floor(total / MINUTES_PER_DAY) + 1,
    hour: Math.floor((total % MINUTES_PER_DAY) / MINUTES_PER_HOUR),
    minute: Math.floor(total % MINUTES_PER_HOUR),
  };
}

export function formatClock(time: number): string {
  const { hour, minute } = toClock(time);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatDateTime(time: number): string {
  return `Day ${toClock(time).day}, ${formatClock(time)}`;
}

export type DayPeriod = 'Night' | 'Dawn' | 'Morning' | 'Afternoon' | 'Evening';

export function getDayPeriod(time: number): DayPeriod {
  const { hour } = toClock(time);
  if (hour < 5 || hour >= 21) {
    return 'Night';
  }
  if (hour < 7) {
    return 'Dawn';
  }
  if (hour < 12) {
    return 'Morning';
  }
  if (hour < 18) {
    return 'Afternoon';
  }
  return 'Evening';
}

/** Formats a duration in game minutes, e.g. "45 min", "1 h 30 min", "2 d 4 h". */
export function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < MINUTES_PER_HOUR) {
    return `${rounded} min`;
  }
  if (rounded < MINUTES_PER_DAY) {
    const hours = Math.floor(rounded / MINUTES_PER_HOUR);
    const rest = rounded % MINUTES_PER_HOUR;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }
  // why: rounding to whole hours before splitting off the days, so 59 d 23 h 59 min reads "60 d", not "59 d 24 h".
  const totalHours = Math.round(rounded / MINUTES_PER_HOUR);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours === 0 ? `${days} d` : `${days} d ${hours} h`;
}

/** Game minutes from now until the clock next shows the given full hour (a whole day if it shows it right now). */
export function minutesUntilHour(time: number, hour: number): number {
  const minuteOfDay = (time + START_HOUR * MINUTES_PER_HOUR) % MINUTES_PER_DAY;
  const until = (hour * MINUTES_PER_HOUR - minuteOfDay + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return until === 0 ? MINUTES_PER_DAY : until;
}

export const hours = (value: number): number => value * MINUTES_PER_HOUR;
export const days = (value: number): number => value * MINUTES_PER_DAY;

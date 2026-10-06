import { describe, expect, it } from 'vitest';
import { days, formatDuration, hours } from './time';

describe('formatDuration', () => {
  it('shows minutes, hours with minutes, and days with whole hours', () => {
    // Act
    const texts = [45, hours(1) + 30, hours(2), days(2) + hours(4), days(3)].map(formatDuration);

    // Assert
    expect(texts).toEqual(['45 min', '1 h 30 min', '2 h', '2 d 4 h', '3 d']);
  });

  it('rounds to whole hours before counting days, so a day minus a minute never reads 24 h', () => {
    // Act
    const texts = [days(60) - 1, days(1) + hours(23) + 31, days(1) + 29].map(formatDuration);

    // Assert
    expect(texts).toEqual(['60 d', '2 d', '1 d']);
  });
});

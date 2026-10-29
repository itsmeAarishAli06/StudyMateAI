import { describe, expect, it } from 'vitest'
import { getCurrentStreak } from './progress.js'

function localDate(year, month, day, hour = 12) {
  return new Date(year, month - 1, day, hour).toISOString()
}

describe('getCurrentStreak', () => {
  const today = new Date(2026, 9, 29, 12)

  it('counts consecutive local calendar days through today', () => {
    expect(getCurrentStreak([
      { createdAt: localDate(2026, 10, 29) },
      { createdAt: localDate(2026, 10, 28) },
      { createdAt: localDate(2026, 10, 27) },
    ], today)).toBe(3)
  })

  it('keeps yesterday active when there is no item saved yet today', () => {
    expect(getCurrentStreak([{ createdAt: localDate(2026, 10, 28) }], today)).toBe(1)
  })

  it('ends the streak after a missed day and ignores invalid timestamps', () => {
    expect(getCurrentStreak([
      { createdAt: localDate(2026, 10, 29) },
      { createdAt: localDate(2026, 10, 27) },
      { createdAt: 'not-a-date' },
    ], today)).toBe(1)
  })

  it('returns zero with no saved study activity', () => {
    expect(getCurrentStreak([], today)).toBe(0)
  })
})

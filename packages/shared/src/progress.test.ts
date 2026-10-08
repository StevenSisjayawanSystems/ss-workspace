import { describe, expect, it } from 'vitest'
import { BADGES, NEW_PROGRESS, formatDuration, levelOf, titleOf, visit, xpForLevel, xpOf } from './progress'

describe('experience and levels', () => {
  it('derives experience from the counters', () => {
    expect(xpOf(NEW_PROGRESS)).toBe(0)
    expect(xpOf({ ...NEW_PROGRESS, seconds: 3600, callSeconds: 600, messages: 3, songs: 1, metres: 250, days: 2, pomodoros: 3 })).toBe(60 + 20 + 6 + 5 + 2 + 40 + 30)
  })

  it('levels up at increasing thresholds and reports progress through the level', () => {
    expect([1, 2, 3, 4].map(xpForLevel)).toEqual([0, 60, 160, 300])
    expect(levelOf(0)).toEqual({ level: 1, into: 0, span: 60 })
    expect(levelOf(59).level).toBe(1)
    expect(levelOf(60)).toEqual({ level: 2, into: 0, span: 100 })
    expect(levelOf(200)).toEqual({ level: 3, into: 40, span: 140 })
  })

  it('names ranks', () => {
    expect(titleOf(1)).toBe('Newcomer')
    expect(titleOf(3)).toBe('Apprentice')
    expect(titleOf(4)).toBe('Journeyman')
    expect(titleOf(99)).toBe('Archmage')
  })
})

describe('daily visits', () => {
  it('counts a day once, extends the streak on consecutive days and resets after a gap', () => {
    let p = visit(NEW_PROGRESS, '2026-10-07')
    expect(p).toMatchObject({ days: 1, streak: 1 })
    expect(visit(p, '2026-10-07')).toBe(p)
    p = visit(p, '2026-10-08')
    expect(p).toMatchObject({ days: 2, streak: 2 })
    p = visit(p, '2026-11-01')
    expect(p).toMatchObject({ days: 3, streak: 1 })
    // Month boundaries are still consecutive days.
    expect(visit({ ...NEW_PROGRESS, days: 1, streak: 4, lastDay: '2026-10-31' }, '2026-11-01').streak).toBe(5)
  })
})

describe('badges and durations', () => {
  it('awards badges from the counters', () => {
    const earned = (p: Parameters<typeof xpOf>[0]) => BADGES.filter((b) => b.earned(p)).map((b) => b.id)
    expect(earned(NEW_PROGRESS)).toEqual([])
    expect(earned({ ...NEW_PROGRESS, messages: 1, songs: 2, callSeconds: 600, streak: 3, pomodoros: 4 })).toEqual(['words', 'dj', 'table', 'focus', 'regular'])
  })

  it('formats durations compactly', () => {
    expect([10, 60, 2520, 3900, 36000, 100000].map(formatDuration)).toEqual(['<1m', '1m', '42m', '1h 05m', '10h 00m', '1d 3h'])
  })
})

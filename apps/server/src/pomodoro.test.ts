import { describe, expect, it } from 'vitest'
import { Pomodoro, pause, reset, resume, skip, start, tick } from './pomodoro'

const MIN = 60_000
const fresh = () => {
  const p = new Pomodoro()
  reset(p)
  return p
}

describe('shared pomodoro', () => {
  it('only starts from an offered preset', () => {
    const p = fresh()
    expect(start(p, 1, 1, 'Ada', 0)).toBe(false)
    expect(start(p, '25', 5, 'Ada', 0)).toBe(false)
    expect(p.phase).toBe('idle')
    expect(start(p, 25, 5, 'Ada', 0)).toBe(true)
    expect(p).toMatchObject({ phase: 'focus', endsAt: 25 * MIN, startedBy: 'Ada', round: 0 })
  })

  it('cycles focus and break, counting completed focus sessions, with a long fourth break', () => {
    const p = fresh()
    start(p, 25, 5, 'Ada', 0)
    let now = 0
    expect(tick(p, 24 * MIN)).toBeNull()
    for (let round = 1; round <= 4; round++) {
      now = p.endsAt
      expect(tick(p, now)).toBe('focus')
      expect(p).toMatchObject({ phase: 'break', round })
      expect(p.endsAt - now).toBe((round === 4 ? 15 : 5) * MIN)
      now = p.endsAt
      expect(tick(p, now)).toBe('break')
      expect(p.phase).toBe('focus')
    }
  })

  it('pauses and resumes without losing time, and skipping does not count the session', () => {
    const p = fresh()
    start(p, 25, 5, 'Ada', 0)
    pause(p, 10 * MIN)
    expect(tick(p, 99 * MIN)).toBeNull()
    expect(p.remainingMs).toBe(15 * MIN)
    resume(p, 100 * MIN)
    expect(p.endsAt).toBe(115 * MIN)
    skip(p, 101 * MIN)
    expect(p).toMatchObject({ phase: 'break', round: 0 })
    reset(p)
    expect(p).toMatchObject({ phase: 'idle', round: 0, startedBy: '' })
    expect(tick(p, 999 * MIN)).toBeNull()
  })
})

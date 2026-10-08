import { describe, expect, it } from 'vitest'
import { Pomodoro, pause, reset, resume, skip, start, startTimer, tick } from './pomodoro'

const MIN = 60_000
const fresh = () => {
  const p = new Pomodoro()
  reset(p)
  return p
}

describe('shared pomodoro', () => {
  it('accepts any whole-minute split within bounds and refuses the rest', () => {
    const p = fresh()
    for (const [f, b] of [[0, 5], [181, 5], [25, 0], [25, 61], [25.5, 5], ['25', 5]] as [unknown, unknown][]) {
      expect(start(p, f, b, 'Ada', 0)).toBe(false)
      expect(p.phase).toBe('idle')
    }
    expect(start(p, 40, 8, 'Ada', 0)).toBe(true)
    expect(p).toMatchObject({ phase: 'focus', endsAt: 40 * MIN, focusMin: 40, breakMin: 8, startedBy: 'Ada', round: 0 })
  })

  it('runs a plain timer once, then clears itself', () => {
    const p = fresh()
    expect(startTimer(p, 0, 'Ada', 0)).toBe(false)
    expect(startTimer(p, 601, 'Ada', 0)).toBe(false)
    expect(startTimer(p, 10, 'Ada', 0)).toBe(true)
    expect(p).toMatchObject({ phase: 'timer', endsAt: 10 * MIN })
    pause(p, 4 * MIN)
    resume(p, 9 * MIN)
    expect(tick(p, 14 * MIN)).toBeNull()
    expect(tick(p, 15 * MIN)).toBe('timer')
    expect(p.phase).toBe('idle')
    startTimer(p, 10, 'Ada', 0)
    skip(p, MIN)
    expect(p.phase).toBe('idle')
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

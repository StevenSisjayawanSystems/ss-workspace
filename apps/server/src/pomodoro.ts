import { schema, t, type SchemaType } from '@colyseus/schema'

// A timer belongs to whoever started it; anyone else may join and work in rhythm with them.
// As a pomodoro it cycles focus -> break -> focus until someone stops it, with every fourth break a long one.
// As a plain timer it counts down once and stops.
export const Pomodoro = schema(
  {
    id: t.string(),
    // Member keys of everyone in on it, separated by spaces.
    members: t.string(),
    // Whether anyone may join, and the keys of people invited by name.
    open: t.boolean(),
    invited: t.string(),
    // 'idle', 'focus', 'break', or 'timer' for a plain one-off countdown
    phase: t.string(),
    // Server time the current phase ends, while running.
    endsAt: t.number(),
    paused: t.boolean(),
    // Milliseconds left in the phase, while paused.
    remainingMs: t.number(),
    focusMin: t.number(),
    breakMin: t.number(),
    // Focus sessions completed since the timer was started.
    round: t.number(),
    startedBy: t.string(),
  },
  'Pomodoro',
)
export type Pomodoro = SchemaType<typeof Pomodoro>

export const LONG_BREAK_EVERY = 4
// Any split within these bounds is allowed, so nobody can start a one-second or week-long session.
export const LIMITS = { focus: [1, 180], rest: [1, 60], timer: [1, 600] } as const

const minutes = (v: unknown, [min, max]: readonly [number, number]): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null

const MIN = 60_000

export function reset(p: Pomodoro) {
  p.phase = 'idle'
  p.endsAt = 0
  p.paused = false
  p.remainingMs = 0
  p.round = 0
  p.startedBy = ''
}

const breakLength = (p: Pomodoro) => (p.round > 0 && p.round % LONG_BREAK_EVERY === 0 ? p.breakMin * 3 : p.breakMin)

function enter(p: Pomodoro, phase: 'focus' | 'break', now: number) {
  p.phase = phase
  p.paused = false
  p.remainingMs = 0
  p.endsAt = now + (phase === 'focus' ? p.focusMin : breakLength(p)) * MIN
}

export function start(p: Pomodoro, focusMin: unknown, breakMin: unknown, by: string, now: number): boolean {
  const focus = minutes(focusMin, LIMITS.focus)
  const rest = minutes(breakMin, LIMITS.rest)
  if (focus === null || rest === null) return false
  p.focusMin = focus
  p.breakMin = rest
  p.round = 0
  p.startedBy = by
  enter(p, 'focus', now)
  return true
}

// A plain countdown: runs once, rings, and clears itself.
export function startTimer(p: Pomodoro, length: unknown, by: string, now: number): boolean {
  const mins = minutes(length, LIMITS.timer)
  if (mins === null) return false
  p.focusMin = mins
  p.breakMin = 0
  p.round = 0
  p.startedBy = by
  p.phase = 'timer'
  p.paused = false
  p.remainingMs = 0
  p.endsAt = now + mins * MIN
  return true
}

export function pause(p: Pomodoro, now: number) {
  if (p.phase === 'idle' || p.paused) return
  p.remainingMs = Math.max(0, p.endsAt - now)
  p.paused = true
}

export function resume(p: Pomodoro, now: number) {
  if (p.phase === 'idle' || !p.paused) return
  p.endsAt = now + p.remainingMs
  p.paused = false
  p.remainingMs = 0
}

// Moves to the next phase. Returns the phase that just finished, or null if nothing changed.
function advance(p: Pomodoro, now: number): 'focus' | 'break' | 'timer' | null {
  if (p.phase === 'timer') {
    reset(p)
    return 'timer'
  }
  if (p.phase === 'focus') {
    p.round += 1
    enter(p, 'break', now)
    return 'focus'
  }
  if (p.phase === 'break') {
    enter(p, 'focus', now)
    return 'break'
  }
  return null
}

// Skipping a focus session does not count it as completed. A plain timer has nothing to skip to, so it ends.
export function skip(p: Pomodoro, now: number) {
  if (p.phase === 'timer') reset(p)
  else if (p.phase === 'focus') enter(p, 'break', now)
  else if (p.phase === 'break') enter(p, 'focus', now)
}

export function tick(p: Pomodoro, now: number): 'focus' | 'break' | 'timer' | null {
  if (p.phase === 'idle' || p.paused || now < p.endsAt) return null
  return advance(p, now)
}

import { schema, t, type SchemaType } from '@colyseus/schema'

// One shared focus timer for the whole guildhouse, so people can work in rhythm together.
// It cycles focus -> break -> focus until someone stops it; every fourth break is a long one.
export const Pomodoro = schema(
  {
    // 'idle', 'focus' or 'break'
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
export const PRESETS: [number, number][] = [
  [25, 5],
  [50, 10],
  [15, 3],
]

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

// Only the offered presets are accepted, so nobody can start a one-second or week-long timer.
export function start(p: Pomodoro, focusMin: unknown, breakMin: unknown, by: string, now: number): boolean {
  const preset = PRESETS.find(([f, b]) => f === focusMin && b === breakMin)
  if (!preset) return false
  p.focusMin = preset[0]
  p.breakMin = preset[1]
  p.round = 0
  p.startedBy = by
  enter(p, 'focus', now)
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
function advance(p: Pomodoro, now: number): 'focus' | 'break' | null {
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

// Skipping a focus session does not count it as completed.
export function skip(p: Pomodoro, now: number) {
  if (p.phase === 'focus') enter(p, 'break', now)
  else if (p.phase === 'break') enter(p, 'focus', now)
}

export function tick(p: Pomodoro, now: number): 'focus' | 'break' | null {
  if (p.phase === 'idle' || p.paused || now < p.endsAt) return null
  return advance(p, now)
}

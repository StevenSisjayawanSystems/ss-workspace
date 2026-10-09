import { NEW_PROGRESS, levelOf, visit, xpOf, type Progress, type TaskSession } from '@guildhouse/shared'
import { newTodo, type Todo } from './tasks'

// Someone in the guildhouse, however many tabs they have open. The server keeps their progress,
// so it is the same on every device and cannot be edited from a browser.
export interface Member {
  // The account id, or `guest:<session>` on a server that runs without accounts.
  key: string
  account: boolean
  name: string
  progress: Progress
  sessions: Set<string>
  // Minutes behind UTC, as Date#getTimezoneOffset reports it, so a "day" is the member's own.
  tzOffset: number
  // When they were last here before this visit, and when they first joined.
  seenAt: number
  since: number
  // A few words about themselves, for their profile.
  about: string
  // Time spent in shared focus sessions, which is what grows their plants in the Focus Garden.
  focusSeconds: number
  // Their to-do lists and categories, and the sessions they have closed, latest first. A session's
  // titles are for the people its list was shared with at the time.
  todo: Todo
  log: (TaskSession & { sharedWith: string[] })[]
  // Tasks that have helped their plant today, and which day "today" was.
  bonusDay: string
  bonusCount: number
  // Their own alarm: the server time it should ring (0 for none) and what it is for.
  alarmAt: number
  alarmLabel: string
  dirty: boolean
}

export const guestKey = (sessionId: string) => `guest:${sessionId}`

export const localDay = (now: number, tzOffset: number) => new Date(now - tzOffset * 60000).toISOString().slice(0, 10)

export const cleanOffset = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(14 * 60, Math.max(-14 * 60, Math.round(v))) : 0)

// Progress offered by a browser: what it had saved before accounts existed. Only numbers a person
// could plausibly have earned are taken.
export function cleanProgress(raw: unknown): Progress {
  const from = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const whole = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0)
  const seconds = whole(from.seconds, 1e9)
  const days = whole(from.days, 100000)
  return {
    seconds,
    callSeconds: Math.min(seconds, whole(from.callSeconds, 1e9)),
    metres: whole(from.metres, 1e9),
    messages: whole(from.messages, 1e7),
    songs: whole(from.songs, 1e6),
    pomodoros: whole(from.pomodoros, 1e6),
    days,
    streak: Math.min(days, whole(from.streak, 100000)),
    lastDay: typeof from.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(from.lastDay) ? from.lastDay : '',
  }
}

export const newMember = (key: string, account: boolean, name: string, progress: Progress = NEW_PROGRESS, seenAt = Date.now(), since = Date.now(), about = ''): Member => ({ key, account, name, progress: { ...progress }, sessions: new Set(), tzOffset: 0, seenAt, since, about, focusSeconds: 0, todo: newTodo(Date.now()), log: [], bonusDay: '', bonusCount: 0, alarmAt: 0, alarmLabel: '', dirty: true })

// Credits time spent here. Being present on a new day counts as a visit.
export function accrue(m: Member, seconds: number, inCall: boolean, now: number) {
  const p = visit(m.progress, localDay(now, m.tzOffset))
  m.progress = { ...p, seconds: p.seconds + seconds, callSeconds: p.callSeconds + (inCall ? seconds : 0) }
  m.dirty = true
}

export function count(m: Member, what: 'messages' | 'songs' | 'pomodoros' | 'metres', by = 1) {
  m.progress = { ...m.progress, [what]: m.progress[what] + by }
  m.dirty = true
}

// The headline numbers other people see on a profile card.
export const standingOf = (p: Progress) => ({
  level: levelOf(xpOf(p)).level,
  totalSeconds: Math.floor(p.seconds),
  streak: p.streak,
  callSeconds: Math.floor(p.callSeconds),
  pomodoros: p.pomodoros,
  messages: p.messages,
  days: p.days,
  metres: Math.floor(p.metres),
  songs: p.songs,
})

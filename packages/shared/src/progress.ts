// Progress is earned by being around and taking part. Experience is always derived from the
// counters below, never stored on its own, so the two cannot drift apart.

export interface Progress {
  // Seconds online, and seconds of that spent seated in a call.
  seconds: number
  callSeconds: number
  // Distance walked, in tiles (about a metre each).
  metres: number
  messages: number
  songs: number
  // Shared focus sessions seen through to the bell.
  pomodoros: number
  // Distinct days visited, and the current run of consecutive days.
  days: number
  streak: number
  // Local calendar day of the last visit, as YYYY-MM-DD.
  lastDay: string
}

export const NEW_PROGRESS: Progress = { seconds: 0, callSeconds: 0, metres: 0, messages: 0, songs: 0, pomodoros: 0, days: 0, streak: 0, lastDay: '' }

export const XP_RULES = {
  perMinuteOnline: 1,
  perMinuteInCall: 2,
  perMessage: 2,
  perSong: 5,
  perPomodoro: 10,
  perHundredMetres: 1,
  perDayVisited: 20,
}

export function xpOf(p: Progress): number {
  return (
    Math.floor(p.seconds / 60) * XP_RULES.perMinuteOnline +
    Math.floor(p.callSeconds / 60) * XP_RULES.perMinuteInCall +
    p.messages * XP_RULES.perMessage +
    p.songs * XP_RULES.perSong +
    p.pomodoros * XP_RULES.perPomodoro +
    Math.floor(p.metres / 100) * XP_RULES.perHundredMetres +
    p.days * XP_RULES.perDayVisited
  )
}

// Each level asks for a little more than the last: 60 to reach level 2, then 100, 140, 180...
const stepTo = (level: number) => 60 + 40 * (level - 2)
export function xpForLevel(level: number): number {
  let total = 0
  for (let l = 2; l <= level; l++) total += stepTo(l)
  return total
}

export function levelOf(xp: number): { level: number; into: number; span: number } {
  let level = 1
  while (xp >= xpForLevel(level + 1)) level++
  const floor = xpForLevel(level)
  return { level, into: xp - floor, span: xpForLevel(level + 1) - floor }
}

const TITLES: [number, string][] = [
  [1, 'Newcomer'],
  [2, 'Apprentice'],
  [4, 'Journeyman'],
  [7, 'Adept'],
  [10, 'Artisan'],
  [14, 'Master'],
  [19, 'Guildmaster'],
  [25, 'Archmage'],
]
export const titleOf = (level: number): string => TITLES.filter(([min]) => level >= min).pop()![1]

export interface Badge {
  id: string
  name: string
  how: string
  earned: (p: Progress) => boolean
}

export const BADGES: Badge[] = [
  { id: 'words', name: 'First Words', how: 'Send a message', earned: (p) => p.messages >= 1 },
  { id: 'dj', name: 'Minstrel', how: 'Add a song to the jukebox', earned: (p) => p.songs >= 1 },
  { id: 'table', name: 'Round Table', how: 'Spend 10 minutes in a call', earned: (p) => p.callSeconds >= 600 },
  { id: 'focus', name: 'Deep Work', how: 'Finish 4 focus sessions', earned: (p) => p.pomodoros >= 4 },
  { id: 'walker', name: 'Wanderer', how: 'Walk 1,000 metres', earned: (p) => p.metres >= 1000 },
  { id: 'regular', name: 'Regular', how: 'Visit 3 days in a row', earned: (p) => p.streak >= 3 },
  { id: 'devoted', name: 'Devoted', how: 'Visit 7 days in a row', earned: (p) => p.streak >= 7 },
  { id: 'hours', name: 'Burning the Candle', how: 'Spend 10 hours here', earned: (p) => p.seconds >= 36000 },
]

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86400000)

// Records a visit on `today` (YYYY-MM-DD). Coming back the next day extends the streak; a gap resets it.
export function visit(p: Progress, today: string): Progress {
  if (p.lastDay === today) return p
  const consecutive = p.lastDay !== '' && dayNumber(today) - dayNumber(p.lastDay) === 1
  return { ...p, days: p.days + 1, streak: consecutive ? p.streak + 1 : 1, lastDay: today }
}

// "<1m", "42m", "1h 05m", "3d 4h"
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  if (m < 1) return '<1m'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

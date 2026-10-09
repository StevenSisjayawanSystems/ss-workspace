import { create } from 'zustand'
import { BADGES, NEW_PROGRESS, levelOf, titleOf, xpOf, type Progress } from '@guildhouse/shared'

// Your own progress: time here, calls, walking, messages, songs, streak. The server does the
// counting and tells us the totals. With an account it also keeps them; a guest's are kept in this
// browser and handed back on the next visit.
const KEY = 'guildhouse.progress'

// What this browser has kept: a guest's progress, or progress from before there were accounts.
export function carried(): Progress {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (saved && typeof saved === 'object') {
      const p = { ...NEW_PROGRESS }
      for (const k of Object.keys(p) as (keyof Progress)[]) if (typeof saved[k] === typeof p[k]) (p[k] as Progress[typeof k]) = saved[k]
      return p
    }
  } catch {
    // Unreadable storage: start fresh.
  }
  return NEW_PROGRESS
}

interface StatsState {
  progress: Progress
  // A short announcement (level up, badge earned) shown briefly.
  toast: { title: string; detail: string } | null
}
export const useStats = create<StatsState>(() => ({ progress: carried(), toast: null }))

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function announce(title: string, detail: string) {
  useStats.setState({ toast: { title, detail } })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => useStats.setState({ toast: null }), 6000)
}

// Takes the server's count. `arriving` is the first word after joining, which is where we stood
// already and so nothing to celebrate.
export function receive(next: Progress, account: boolean, arriving: boolean) {
  const before = useStats.getState().progress
  useStats.setState({ progress: next })
  try {
    // Once an account holds the progress, the copy here has done its job.
    if (account) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // A guest's progress simply will not be remembered.
  }
  if (arriving) return
  const was = levelOf(xpOf(before)).level
  const now = levelOf(xpOf(next)).level
  const badge = BADGES.find((b) => b.earned(next) && !b.earned(before))
  if (now > was) announce(`Level ${now}`, titleOf(now) === titleOf(was) ? 'Level up' : `You are now ${/^[AEIOU]/.test(titleOf(now)) ? 'an' : 'a'} ${titleOf(now)}`)
  else if (badge) announce(badge.name, 'Badge earned')
}

// The headline numbers on a profile card, in the same shape the server gives for other people.
export const standing = (p: Progress) => ({ level: levelOf(xpOf(p)).level, totalSeconds: Math.floor(p.seconds), streak: p.streak, callSeconds: Math.floor(p.callSeconds), pomodoros: p.pomodoros, messages: p.messages, days: p.days, metres: Math.floor(p.metres), songs: p.songs })

import { create } from 'zustand'
import { BADGES, NEW_PROGRESS, levelOf, titleOf, visit, xpOf, type Progress } from '@guildhouse/shared'

// Your own progress: time here, calls, walking, messages, songs, streak. It is kept in this browser
// (there are no accounts yet), and only the headline numbers are shared with others.
const KEY = 'guildhouse.progress'
const TICK_MS = 5000
const REPORT_MS = 30000

function load(): Progress {
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
export const useStats = create<StatsState>(() => ({ progress: load(), toast: null }))

// The headline numbers other people can see on your profile.
export interface Standing {
  level: number
  totalSeconds: number
  streak: number
  callSeconds: number
  pomodoros: number
  messages: number
  days: number
}
export const standing = (p = useStats.getState().progress): Standing => ({
  level: levelOf(xpOf(p)).level,
  totalSeconds: Math.floor(p.seconds),
  streak: p.streak,
  callSeconds: Math.floor(p.callSeconds),
  pomodoros: p.pomodoros,
  messages: p.messages,
  days: p.days,
})

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function announce(title: string, detail: string) {
  useStats.setState({ toast: { title, detail } })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => useStats.setState({ toast: null }), 6000)
}

let onLevelChange: (() => void) | undefined

function commit(next: Progress) {
  const before = useStats.getState().progress
  const was = levelOf(xpOf(before)).level
  const now = levelOf(xpOf(next)).level
  const badge = BADGES.find((b) => b.earned(next) && !b.earned(before))
  useStats.setState({ progress: next })
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Progress simply will not be remembered.
  }
  if (now > was) {
    announce(`Level ${now}`, titleOf(now) === titleOf(was) ? 'Level up' : `You are now ${/^[AEIOU]/.test(titleOf(now)) ? 'an' : 'a'} ${titleOf(now)}`)
    onLevelChange?.()
  } else if (badge) announce(badge.name, 'Badge earned')
}

export const count = (what: 'messages' | 'songs' | 'pomodoros') => commit({ ...useStats.getState().progress, [what]: useStats.getState().progress[what] + 1 })

// Walking is reported every frame; it is folded into the saved progress on the next tick.
let walked = 0
export const addDistance = (metres: number) => {
  walked += metres
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Starts the clock. `report` shares your standing with the server; `inCall` says whether call time is accruing.
export function startStats(report: (s: Standing) => void, inCall: () => boolean): () => void {
  onLevelChange = () => report(standing())
  let last = Date.now()
  let lastReport = 0
  const tick = () => {
    const now = Date.now()
    // A sleeping laptop or a throttled tab should not be credited with hours.
    const elapsed = Math.min((now - last) / 1000, 30)
    last = now
    const p = visit(useStats.getState().progress, today())
    commit({ ...p, seconds: p.seconds + elapsed, callSeconds: p.callSeconds + (inCall() ? elapsed : 0), metres: p.metres + walked })
    walked = 0
    if (now - lastReport > REPORT_MS) {
      lastReport = now
      report(standing())
    }
  }
  tick()
  const timer = setInterval(tick, TICK_MS)
  return () => {
    clearInterval(timer)
    onLevelChange = undefined
  }
}

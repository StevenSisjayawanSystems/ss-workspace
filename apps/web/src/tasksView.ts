import { create } from 'zustand'
import type { Task, TaskList } from '@guildhouse/shared'

// How you like to look at your tasks: which list is in front, how it is grouped, whether the quest
// tracker on the side is folded away, and which tasks you have picked to focus on for your timer. These are this browser's own habits,
// so they are kept here; the tasks themselves live on the server.
const KEY = 'guildhouse.tasks.view'

interface TaskView {
  active: string
  group: Grouping
  folded: boolean
  // The ids of the tasks in focus, in the order they were picked.
  focus: string[]
}

export type Grouping = 'none' | 'category' | 'priority'

function load(): TaskView {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (saved && typeof saved === 'object') return { active: String(saved.active ?? ''), group: saved.group === 'category' || saved.group === 'priority' ? saved.group : saved.grouped === true ? 'category' : 'none', folded: saved.folded === true, focus: (Array.isArray(saved.focus) ? saved.focus : [saved.focus]).filter((id: unknown): id is string => typeof id === 'string' && !!id) }
  } catch {
    // Unreadable storage: the defaults will do.
  }
  return { active: '', group: 'none', folded: false, focus: [] }
}

export const useTaskView = create<TaskView>(load)
useTaskView.subscribe((view) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(view))
  } catch {
    // Not remembered next time; still applies now.
  }
})

// The list in front: the one last chosen if it still exists, otherwise the first.
export const activeList = (lists: TaskList[], active: string): TaskList | undefined => lists.find((l) => l.id === active) ?? lists[0]

// The tasks in focus, in the order they were picked, leaving out any that are gone or already done.
export function focusTasks(lists: TaskList[], focus: string[]): Task[] {
  const open = new Map(lists.flatMap((l) => l.tasks.filter((t) => !t.done).map((t) => [t.id, t] as const)))
  return focus.flatMap((id) => open.get(id) ?? [])
}

// Adds a task to the ones in focus, or takes it out if it is already among them. Returns whether it was added.
export function toggleFocus(id: string): boolean {
  const { focus } = useTaskView.getState()
  const added = !focus.includes(id)
  useTaskView.setState({ focus: added ? [...focus, id] : focus.filter((x) => x !== id) })
  return added
}

// Today as tasks are dated, in this computer's own time zone.
export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A due day in few words: Today, Tomorrow, or the date.
export function dueText(due: string): string {
  const days = Math.round((Date.parse(due) - Date.parse(today())) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  return new Date(`${due}T00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

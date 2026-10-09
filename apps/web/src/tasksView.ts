import { create } from 'zustand'
import type { TaskList } from '@guildhouse/shared'

// How you like to look at your tasks: which list is in front, whether it is grouped by category,
// and whether the quest tracker on the side is folded away. These are this browser's own habits,
// so they are kept here; the tasks themselves live on the server.
const KEY = 'guildhouse.tasks.view'

interface TaskView {
  active: string
  grouped: boolean
  folded: boolean
}

function load(): TaskView {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (saved && typeof saved === 'object') return { active: String(saved.active ?? ''), grouped: saved.grouped === true, folded: saved.folded === true }
  } catch {
    // Unreadable storage: the defaults will do.
  }
  return { active: '', grouped: false, folded: false }
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

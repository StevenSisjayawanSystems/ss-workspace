// Everyone has their own to-do lists for the things they came here to get done: as many lists as
// they like, tasks tagged with categories of their own making, and each list shared with whoever
// they choose.
export interface Task {
  id: string
  title: string
  done: boolean
  // Server time it was ticked off, or 0.
  doneAt: number
  at: number
  // The id of one of its owner's categories, or '' for none.
  category: string
}

export interface TaskCategory {
  id: string
  name: string
  color: string
}

export interface TaskList {
  id: string
  name: string
  tasks: Task[]
  // Members the owner has let see this list.
  sharedWith: string[]
}

// A set of tasks someone declared finished. `titles` is empty when it is not ours to read.
export interface TaskSession {
  // The name of the list it closed.
  list: string
  startedAt: number
  endedAt: number
  done: number
  total: number
  titles: string[]
}

export const MAX_LISTS = 8
export const MAX_LIST_NAME = 30
export const MAX_TASKS = 60
export const MAX_TASK_LENGTH = 120
export const MAX_CATEGORIES = 12
export const MAX_CATEGORY_NAME = 20
export const CATEGORY_COLORS = ['#d8b25e', '#6fb8ad', '#93c46f', '#e07a5f', '#9a7fd1', '#6f9bd8', '#e39ac0', '#b9c2d2']

// Finishing a task gives the plant you are growing this much focus time, up to so many tasks a day.
export const TASK_BONUS_SECONDS = 15 * 60
export const TASK_BONUS_PER_DAY = 8

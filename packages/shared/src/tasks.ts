// Everyone has their own to-do list for the things they came here to get done.
export interface Task {
  id: string
  title: string
  done: boolean
  // Server time it was ticked off, or 0.
  doneAt: number
  at: number
}

// A set of tasks someone declared finished. `titles` is empty when it is not ours to read.
export interface TaskSession {
  startedAt: number
  endedAt: number
  done: number
  total: number
  titles: string[]
}

export const MAX_TASKS = 60
export const MAX_TASK_LENGTH = 120

// Finishing a task gives the plant you are growing this much focus time, up to so many tasks a day.
export const TASK_BONUS_SECONDS = 15 * 60
export const TASK_BONUS_PER_DAY = 8

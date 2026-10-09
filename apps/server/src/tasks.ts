import { MAX_TASKS, MAX_TASK_LENGTH, type Task, type TaskSession } from '@guildhouse/shared'
import { cleanText } from './rules'

// A task as the server keeps it: the shared shape, plus whether it has already helped a plant along.
export interface KeptTask extends Task {
  rewarded: boolean
}

const newId = (now: number) => `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// Each of these changes the list in place and reports whether it did anything.

// New tasks go on top, where the eye lands first.
export function addTask(list: KeptTask[], title: unknown, now: number): KeptTask | null {
  const text = cleanText(title, MAX_TASK_LENGTH)
  if (!text || list.length >= MAX_TASKS) return null
  const task = { id: newId(now), title: text, done: false, doneAt: 0, at: now, rewarded: false }
  list.unshift(task)
  return task
}

export function editTask(list: KeptTask[], id: unknown, title: unknown): boolean {
  const task = list.find((t) => t.id === id)
  const text = cleanText(title, MAX_TASK_LENGTH)
  if (!task || !text || task.title === text) return false
  task.title = text
  return true
}

// Returns the task when its state actually changed.
export function tickTask(list: KeptTask[], id: unknown, done: boolean, now: number): KeptTask | null {
  const task = list.find((t) => t.id === id)
  if (!task || task.done === done) return null
  task.done = done
  task.doneAt = done ? now : 0
  return task
}

export function removeTask(list: KeptTask[], id: unknown): boolean {
  const i = list.findIndex((t) => t.id === id)
  if (i < 0) return false
  list.splice(i, 1)
  return true
}

// Moves a task so that it sits just before `before`, or at the end when that is not given.
export function moveTask(list: KeptTask[], id: unknown, before: unknown): boolean {
  const from = list.findIndex((t) => t.id === id)
  if (from < 0 || id === before) return false
  const [task] = list.splice(from, 1)
  const to = list.findIndex((t) => t.id === before)
  list.splice(to < 0 ? list.length : to, 0, task)
  return true
}

export function clearDone(list: KeptTask[]): boolean {
  const open = list.filter((t) => !t.done)
  if (open.length === list.length) return false
  list.splice(0, list.length, ...open)
  return true
}

// A few short titles to remember a session by.
export const summary = (titles: string[]) => titles.slice(0, 8).map((t) => (t.length > 60 ? `${t.slice(0, 58)}…` : t))

// Closes a session: what was finished is written up and taken off the list, and anything unfinished
// stays for next time. The session runs from when the oldest task in the set was written down to now.
// Returns null, changing nothing, when no task has been finished.
export function finishSession(list: KeptTask[], now: number): TaskSession | null {
  const done = list.filter((t) => t.done).sort((a, b) => a.doneAt - b.doneAt)
  if (!done.length) return null
  const session = { startedAt: Math.min(...list.map((t) => t.at)), endedAt: now, done: done.length, total: list.length, titles: summary(done.map((t) => t.title)) }
  clearDone(list)
  return session
}

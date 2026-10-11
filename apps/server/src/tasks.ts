import { CATEGORY_COLORS, PRIORITIES, isDay, MAX_CATEGORIES, MAX_CATEGORY_NAME, MAX_LISTS, MAX_LIST_NAME, MAX_TASKS, MAX_TASK_LENGTH, type Task, type TaskCategory, type TaskSession } from '@guildhouse/shared'
import { cleanText } from './rules'

// A task as the server keeps it: the shared shape, plus whether it has already helped a plant along.
export interface KeptTask extends Task {
  rewarded: boolean
}

export interface KeptList {
  id: string
  name: string
  sharedWith: string[]
  tasks: KeptTask[]
}

// Everything on one person's to-do: their lists, in order, and the categories they tag tasks with.
export interface Todo {
  lists: KeptList[]
  categories: TaskCategory[]
}

const newId = (now: number) => `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// Everyone starts with one list, and always has at least one.
export const newTodo = (now: number): Todo => ({ lists: [{ id: newId(now), name: 'My tasks', sharedWith: [], tasks: [] }], categories: [] })

const listOf = (todo: Todo, id: unknown) => todo.lists.find((l) => l.id === id)

function find(todo: Todo, taskId: unknown): { list: KeptList; task: KeptTask } | undefined {
  for (const list of todo.lists) {
    const task = list.tasks.find((t) => t.id === taskId)
    if (task) return { list, task }
  }
}

// Each of these changes the to-do in place and reports whether it did anything.

export function addList(todo: Todo, name: unknown, now: number): KeptList | null {
  const text = cleanText(name, MAX_LIST_NAME)
  if (!text || todo.lists.length >= MAX_LISTS) return null
  const list = { id: newId(now), name: text, sharedWith: [], tasks: [] }
  todo.lists.push(list)
  return list
}

export function renameList(todo: Todo, id: unknown, name: unknown): boolean {
  const list = listOf(todo, id)
  const text = cleanText(name, MAX_LIST_NAME)
  if (!list || !text || list.name === text) return false
  list.name = text
  return true
}

export function removeList(todo: Todo, id: unknown): boolean {
  const i = todo.lists.findIndex((l) => l.id === id)
  if (i < 0 || todo.lists.length === 1) return false
  todo.lists.splice(i, 1)
  return true
}

// Sets who can see a list. Returns the people newly let in, or null if nothing changed.
export function shareList(todo: Todo, id: unknown, keys: string[]): string[] | null {
  const list = listOf(todo, id)
  if (!list) return null
  const next = [...new Set(keys)]
  if (next.length === list.sharedWith.length && next.every((k) => list.sharedWith.includes(k))) return null
  const added = next.filter((k) => !list.sharedWith.includes(k))
  list.sharedWith = next
  return added
}

export function addCategory(todo: Todo, name: unknown, color: unknown, now: number): TaskCategory | null {
  const text = cleanText(name, MAX_CATEGORY_NAME)
  if (!text || todo.categories.length >= MAX_CATEGORIES || todo.categories.some((c) => c.name.toLowerCase() === text.toLowerCase())) return null
  const category = { id: newId(now), name: text, color: CATEGORY_COLORS.includes(color as string) ? (color as string) : CATEGORY_COLORS[todo.categories.length % CATEGORY_COLORS.length] }
  todo.categories.push(category)
  return category
}

// Taking a category away leaves its tasks in place, untagged.
export function removeCategory(todo: Todo, id: unknown): boolean {
  const i = todo.categories.findIndex((c) => c.id === id)
  if (i < 0) return false
  todo.categories.splice(i, 1)
  for (const list of todo.lists) for (const task of list.tasks) if (task.category === id) task.category = ''
  return true
}

const categoryOf = (todo: Todo, id: unknown) => (todo.categories.some((c) => c.id === id) ? (id as string) : '')

// New tasks go on top, where the eye lands first.
export function addTask(todo: Todo, listId: unknown, title: unknown, category: unknown, now: number): KeptTask | null {
  const list = listOf(todo, listId)
  const text = cleanText(title, MAX_TASK_LENGTH)
  if (!list || !text || list.tasks.length >= MAX_TASKS) return null
  const task = { id: newId(now), title: text, done: false, doneAt: 0, at: now, category: categoryOf(todo, category), priority: 0, due: '', starred: false, rewarded: false }
  list.tasks.unshift(task)
  return task
}

export function editTask(todo: Todo, id: unknown, title: unknown): boolean {
  const task = find(todo, id)?.task
  const text = cleanText(title, MAX_TASK_LENGTH)
  if (!task || !text || task.title === text) return false
  task.title = text
  return true
}

export function tagTask(todo: Todo, id: unknown, category: unknown): boolean {
  const task = find(todo, id)?.task
  const next = categoryOf(todo, category)
  if (!task || task.category === next) return false
  task.category = next
  return true
}

// Says how pressing a task is: its priority, the day it is due, and whether it is starred as a
// must for today. Anything left out stays as it was.
export function planTask(todo: Todo, id: unknown, plan: { priority?: unknown; due?: unknown; starred?: unknown }): boolean {
  const task = find(todo, id)?.task
  if (!task) return false
  const priority = plan.priority === 0 || PRIORITIES.some((p) => p.id === plan.priority) ? (plan.priority as number) : task.priority
  const due = plan.due === '' || isDay(plan.due) ? plan.due : task.due
  const starred = typeof plan.starred === 'boolean' ? plan.starred : task.starred
  if (priority === task.priority && due === task.due && starred === task.starred) return false
  Object.assign(task, { priority, due, starred })
  return true
}

// Returns the task when its state actually changed.
export function tickTask(todo: Todo, id: unknown, done: boolean, now: number): KeptTask | null {
  const task = find(todo, id)?.task
  if (!task || task.done === done) return null
  task.done = done
  task.doneAt = done ? now : 0
  return task
}

export function removeTask(todo: Todo, id: unknown): boolean {
  const found = find(todo, id)
  if (!found) return false
  found.list.tasks.splice(found.list.tasks.indexOf(found.task), 1)
  return true
}

// Moves a task so that it sits just before `before`, or at the end when that is not given. It stays
// in its own list unless `before` is in another, or `toList` names one.
export function moveTask(todo: Todo, id: unknown, before?: unknown, toList?: unknown): boolean {
  const found = find(todo, id)
  if (!found || id === before) return false
  const target = find(todo, before)?.list ?? listOf(todo, toList) ?? found.list
  if (target !== found.list && target.tasks.length >= MAX_TASKS) return false
  found.list.tasks.splice(found.list.tasks.indexOf(found.task), 1)
  const to = target.tasks.findIndex((t) => t.id === before)
  target.tasks.splice(to < 0 ? target.tasks.length : to, 0, found.task)
  return true
}

export function clearDone(todo: Todo, listId: unknown): boolean {
  const list = listOf(todo, listId)
  const open = list?.tasks.filter((t) => !t.done)
  if (!list || !open || open.length === list.tasks.length) return false
  list.tasks = open
  return true
}

// A few short titles to remember a session by.
export const summary = (titles: string[]) => titles.slice(0, 8).map((t) => (t.length > 60 ? `${t.slice(0, 58)}…` : t))

// Closes a session on one list: what was finished is written up and taken off it, and anything
// unfinished stays for next time. The session runs from when the oldest task in the set was written
// down to now. Returns null, changing nothing, when no task on the list has been finished.
export function finishSession(todo: Todo, listId: unknown, now: number): (TaskSession & { sharedWith: string[] }) | null {
  const list = listOf(todo, listId)
  const done = list?.tasks.filter((t) => t.done).sort((a, b) => a.doneAt - b.doneAt)
  if (!list || !done?.length) return null
  const session = { list: list.name, startedAt: Math.min(...list.tasks.map((t) => t.at)), endedAt: now, done: done.length, total: list.tasks.length, titles: summary(done.map((t) => t.title)), sharedWith: [...list.sharedWith] }
  clearDone(todo, listId)
  return session
}

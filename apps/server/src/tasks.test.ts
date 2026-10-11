import { describe, expect, it } from 'vitest'
import { MAX_LISTS, MAX_TASKS, byUrgency } from '@guildhouse/shared'
import { addCategory, addList, addTask, clearDone, editTask, finishSession, moveTask, newTodo, planTask, removeCategory, removeList, removeTask, renameList, shareList, summary, tagTask, tickTask } from './tasks'

describe('a to-do', () => {
  it('adds on top, edits, ticks, reorders, removes and clears', () => {
    const todo = newTodo(0)
    const list = todo.lists[0]
    const a = addTask(todo, list.id, '  Write the brief  ', '', 1)!
    const b = addTask(todo, list.id, 'Review PR', '', 2)!
    const c = addTask(todo, list.id, 'Lunch', '', 3)!
    expect(addTask(todo, list.id, '   ', '', 4)).toBeNull()
    expect(addTask(todo, 'no such list', 'x', '', 4)).toBeNull()
    expect(list.tasks.map((t) => t.title)).toEqual(['Lunch', 'Review PR', 'Write the brief'])

    expect(editTask(todo, b.id, 'Review the PR')).toBe(true)
    expect(editTask(todo, b.id, 'Review the PR')).toBe(false)
    expect(editTask(todo, 'nope', 'x')).toBe(false)

    expect(tickTask(todo, a.id, true, 9)).toMatchObject({ done: true, doneAt: 9 })
    expect(tickTask(todo, a.id, true, 10)).toBeNull()
    expect(tickTask(todo, a.id, false, 11)).toMatchObject({ done: false, doneAt: 0 })

    expect(moveTask(todo, a.id, c.id)).toBe(true)
    expect(list.tasks.map((t) => t.id)).toEqual([a.id, c.id, b.id])
    expect(moveTask(todo, a.id, undefined)).toBe(true)
    expect(list.tasks.map((t) => t.id)).toEqual([c.id, b.id, a.id])

    tickTask(todo, c.id, true, 12)
    expect(clearDone(todo, list.id)).toBe(true)
    expect(clearDone(todo, list.id)).toBe(false)
    expect(removeTask(todo, b.id)).toBe(true)
    expect(todo.lists[0].tasks.map((t) => t.id)).toEqual([a.id])
  })

  it('plans tasks with a priority, a due day and a star, and moves them between lists', () => {
    const todo = newTodo(0)
    const list = todo.lists[0]
    const a = addTask(todo, list.id, 'Brief', '', 1)!
    const b = addTask(todo, list.id, 'Review', '', 2)!
    expect(a).toMatchObject({ priority: 0, due: '', starred: false })
    expect(planTask(todo, a.id, { priority: 1, due: '2026-10-12', starred: true })).toBe(true)
    expect(a).toMatchObject({ priority: 1, due: '2026-10-12', starred: true })
    // Nonsense is ignored, and what is left out stays as it was.
    expect(planTask(todo, a.id, { priority: 9, due: 'tomorrow', starred: 'yes' })).toBe(false)
    expect(planTask(todo, a.id, { due: '' })).toBe(true)
    expect(a).toMatchObject({ priority: 1, due: '', starred: true })
    expect(planTask(todo, 'nope', { starred: true })).toBe(false)
    expect(byUrgency([b, a]).map((t) => t.id)).toEqual([a.id, b.id])
    planTask(todo, a.id, { starred: false, priority: 3 })
    planTask(todo, b.id, { priority: 2 })
    expect(byUrgency(list.tasks).map((t) => t.id)).toEqual([b.id, a.id])

    const other = addList(todo, 'Later', 3)!
    const c = addTask(todo, other.id, 'Lunch', '', 4)!
    expect(moveTask(todo, a.id, undefined, other.id)).toBe(true)
    expect(other.tasks.map((t) => t.id)).toEqual([c.id, a.id])
    expect(moveTask(todo, b.id, c.id)).toBe(true)
    expect(other.tasks.map((t) => t.id)).toEqual([b.id, c.id, a.id])
    expect(list.tasks).toHaveLength(0)
  })

  it('keeps several lists, always at least one, each shared with whoever is chosen', () => {
    const todo = newTodo(0)
    const work = addList(todo, '  Launch week ', 1)!
    expect(todo.lists.map((l) => l.name)).toEqual(['My tasks', 'Launch week'])
    expect(renameList(todo, work.id, 'Launch')).toBe(true)
    expect(shareList(todo, work.id, ['ben', 'cy', 'ben'])).toEqual(['ben', 'cy'])
    expect(shareList(todo, work.id, ['cy', 'ben'])).toBeNull()
    expect(shareList(todo, work.id, ['cy', 'dee'])).toEqual(['dee'])
    expect(work.sharedWith).toEqual(['cy', 'dee'])
    expect(removeList(todo, todo.lists[0].id)).toBe(true)
    expect(removeList(todo, work.id)).toBe(false)
    for (let i = 0; i < MAX_LISTS + 3; i++) addList(todo, `List ${i}`, i)
    expect(todo.lists).toHaveLength(MAX_LISTS)
  })

  it('tags tasks with categories of its owner, and untags them when a category goes', () => {
    const todo = newTodo(0)
    const deep = addCategory(todo, 'Deep work', '#6fb8ad', 1)!
    expect(addCategory(todo, 'deep WORK', '', 2)).toBeNull()
    const admin = addCategory(todo, 'Admin', 'not a colour', 3)!
    expect(admin.color).toMatch(/^#/)
    const task = addTask(todo, todo.lists[0].id, 'Write', deep.id, 4)!
    const loose = addTask(todo, todo.lists[0].id, 'Email', 'made up', 5)!
    expect([task.category, loose.category]).toEqual([deep.id, ''])
    expect(tagTask(todo, loose.id, admin.id)).toBe(true)
    expect(tagTask(todo, loose.id, admin.id)).toBe(false)
    expect(removeCategory(todo, deep.id)).toBe(true)
    expect(task.category).toBe('')
    expect(todo.categories.map((c) => c.name)).toEqual(['Admin'])
  })

  it('closes a session on one list only when asked: finished tasks are written up, unfinished ones stay', () => {
    const todo = newTodo(0)
    const list = todo.lists[0]
    const other = addList(todo, 'Other', 50)!
    shareList(todo, list.id, ['ben'])
    const a = addTask(todo, list.id, 'Write the brief', '', 100)!
    const b = addTask(todo, list.id, 'Review PR', '', 200)!
    addTask(todo, list.id, 'Lunch', '', 300)
    tickTask(todo, addTask(todo, other.id, 'Elsewhere', '', 350)!.id, true, 360)
    expect(finishSession(todo, list.id, 400)).toBeNull()
    tickTask(todo, b.id, true, 500)
    tickTask(todo, a.id, true, 600)
    expect(finishSession(todo, list.id, 700)).toEqual({ list: 'My tasks', startedAt: 100, endedAt: 700, done: 2, total: 3, titles: ['Review PR', 'Write the brief'], sharedWith: ['ben'] })
    expect(list.tasks.map((t) => t.title)).toEqual(['Lunch'])
    expect(other.tasks).toHaveLength(1)
  })

  it('stops at a sensible length and keeps summaries short', () => {
    const todo = newTodo(0)
    for (let i = 0; i < MAX_TASKS + 5; i++) addTask(todo, todo.lists[0].id, `Task ${i}`, '', i)
    expect(todo.lists[0].tasks).toHaveLength(MAX_TASKS)
    expect(summary(['x'.repeat(100)])[0]).toHaveLength(59)
    expect(summary(Array(20).fill('a'))).toHaveLength(8)
  })
})

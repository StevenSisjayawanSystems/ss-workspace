import { describe, expect, it } from 'vitest'
import { MAX_TASKS } from '@guildhouse/shared'
import { addTask, clearDone, editTask, finishSession, moveTask, removeTask, summary, tickTask, type KeptTask } from './tasks'

describe('a to-do list', () => {
  it('adds on top, edits, ticks, reorders, removes and clears', () => {
    const list: KeptTask[] = []
    const a = addTask(list, '  Write the brief  ', 1)!
    const b = addTask(list, 'Review PR', 2)!
    const c = addTask(list, 'Lunch', 3)!
    expect(addTask(list, '   ', 4)).toBeNull()
    expect(list.map((t) => t.title)).toEqual(['Lunch', 'Review PR', 'Write the brief'])

    expect(editTask(list, b.id, 'Review the PR')).toBe(true)
    expect(editTask(list, b.id, 'Review the PR')).toBe(false)
    expect(editTask(list, 'nope', 'x')).toBe(false)

    expect(tickTask(list, a.id, true, 9)).toMatchObject({ done: true, doneAt: 9 })
    expect(tickTask(list, a.id, true, 10)).toBeNull()
    expect(tickTask(list, a.id, false, 11)).toMatchObject({ done: false, doneAt: 0 })

    expect(moveTask(list, a.id, c.id)).toBe(true)
    expect(list.map((t) => t.id)).toEqual([a.id, c.id, b.id])
    expect(moveTask(list, a.id, undefined)).toBe(true)
    expect(list.map((t) => t.id)).toEqual([c.id, b.id, a.id])

    tickTask(list, c.id, true, 12)
    expect(clearDone(list)).toBe(true)
    expect(clearDone(list)).toBe(false)
    expect(removeTask(list, b.id)).toBe(true)
    expect(list.map((t) => t.id)).toEqual([a.id])
  })

  it('closes a session only when asked: finished tasks are written up, unfinished ones stay', () => {
    const list: KeptTask[] = []
    const a = addTask(list, 'Write the brief', 100)!
    const b = addTask(list, 'Review PR', 200)!
    addTask(list, 'Lunch', 300)
    expect(finishSession(list, 400)).toBeNull()
    expect(list).toHaveLength(3)
    tickTask(list, b.id, true, 500)
    tickTask(list, a.id, true, 600)
    expect(finishSession(list, 700)).toEqual({ startedAt: 100, endedAt: 700, done: 2, total: 3, titles: ['Review PR', 'Write the brief'] })
    expect(list.map((t) => t.title)).toEqual(['Lunch'])
  })

  it('stops at a sensible length and keeps summaries short', () => {
    const list: KeptTask[] = []
    for (let i = 0; i < MAX_TASKS + 5; i++) addTask(list, `Task ${i}`, i)
    expect(list).toHaveLength(MAX_TASKS)
    expect(summary(['x'.repeat(100)])[0]).toHaveLength(59)
    expect(summary(Array(20).fill('a'))).toHaveLength(8)
  })
})

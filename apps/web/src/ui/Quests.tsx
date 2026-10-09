import { useState, type FormEvent } from 'react'
import { MAX_TASK_LENGTH } from '@guildhouse/shared'
import { useGame } from '../game'
import { todo, useNet } from '../net/net'
import { activeList, useTaskView } from '../tasksView'
import { Icon } from './icons'
import { Gem, useLinger } from './Tasks'

// How many tasks the tracker shows before it says "and more".
const SHOWN = 7

// The quest tracker: one of your lists, pinned to the side of the screen like the quest log of a
// game, so what you came to do stays in view. Tick things off here; open the full panel for the rest.
export function Quests() {
  const online = useNet((s) => s.status === 'online')
  const { lists, categories } = useNet((s) => s.tasks)
  const { active, folded } = useTaskView()
  const { lingering, tick } = useLinger()
  const [draft, setDraft] = useState('')
  const list = activeList(lists, active)
  if (!online || !list) return null

  const at = lists.indexOf(list)
  const turn = (by: number) => useTaskView.setState({ active: lists[(at + by + lists.length) % lists.length].id })
  const openTasks = list.tasks.filter((t) => !t.done || lingering.has(t.id))
  const finished = list.tasks.filter((t) => t.done).length
  const full = () => useGame.setState({ tasksOpen: true })
  const add = (e: FormEvent) => {
    e.preventDefault()
    if (draft.trim()) todo.add(list.id, draft.trim())
    setDraft('')
  }

  return (
    <aside className={folded ? 'quests folded' : 'quests'} aria-label="Quest tracker">
      <header>
        <button className="quests-title" title="Open all your tasks" onClick={full}>
          <i />
          Quests
        </button>
        <em>
          {finished}/{list.tasks.length}
        </em>
        <button className="quests-fold" aria-label={folded ? 'Show quests' : 'Hide quests'} title={folded ? 'Show quests' : 'Hide quests'} aria-expanded={!folded} onClick={() => useTaskView.setState({ folded: !folded })}>
          {folded ? '▸' : '▾'}
        </button>
      </header>
      {!folded && (
        <div className="quests-body" key={list.id}>
          <div className="quests-list">
            {lists.length > 1 && (
              <button aria-label="Previous list" title="Previous list" onClick={() => turn(-1)}>
                ‹
              </button>
            )}
            <button className="quests-name" title="Open this list" onClick={full}>
              {list.name}
            </button>
            {lists.length > 1 && (
              <button aria-label="Next list" title="Next list" onClick={() => turn(1)}>
                ›
              </button>
            )}
          </div>
          <div className="journey-bar">
            <div style={{ width: `${list.tasks.length ? Math.round((finished / list.tasks.length) * 100) : 0}%` }} />
          </div>
          <ul>
            {openTasks.slice(0, SHOWN).map((task) => {
              const category = categories.find((c) => c.id === task.category)
              return (
                <li key={task.id} className={`task ${task.done ? 'done' : ''} ${lingering.has(task.id) ? 'lingering' : ''}`}>
                  <button className="task-box" role="checkbox" aria-checked={task.done} aria-label={`Mark "${task.title}" as done`} onClick={() => tick(task)}>
                    {task.done && <Icon.check />}
                  </button>
                  <span className="task-title" title={category?.name}>
                    {task.title}
                  </span>
                  {category && <Gem color={category.color} />}
                </li>
              )
            })}
          </ul>
          {openTasks.length > SHOWN && (
            <button className="quests-more" onClick={full}>
              and {openTasks.length - SHOWN} more
            </button>
          )}
          {openTasks.length === 0 && <p>{list.tasks.length ? 'All done here.' : 'No quests yet.'}</p>}
          <form onSubmit={add}>
            <input value={draft} maxLength={MAX_TASK_LENGTH} placeholder="Add a quest" aria-label="Add a quest" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()} />
          </form>
        </div>
      )}
    </aside>
  )
}

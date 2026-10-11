import { useState, type FormEvent } from 'react'
import { MAX_TASK_LENGTH, byUrgency } from '@guildhouse/shared'
import { useGame } from '../game'
import { todo, useNet } from '../net/net'
import { activeList, focusTasks, useTaskView } from '../tasksView'
import { Icon } from './icons'
import { Gem, focusOn, planOf, useLinger } from './Tasks'

// The quest tracker: one of your lists, sitting just above the chat like the quest log of a game, so
// what you came to do stays in view. The list's name is at the top, with arrows to turn to the next
// one. Tasks are in the order to do them: today's musts, then by priority and due day, each with
// the category it is from. Tick things off here, star one as a must for today, or press its words
// to add it to your focus; press the name to open the full panel.
export function Quests() {
  const online = useNet((s) => s.status === 'online')
  const { lists, categories } = useNet((s) => s.tasks)
  const { active, folded, focus } = useTaskView()
  const { lingering, tick } = useLinger()
  const [draft, setDraft] = useState('')
  const list = activeList(lists, active)
  if (!online || !list) return null

  const at = lists.indexOf(list)
  const turn = (by: number) => useTaskView.setState({ active: lists[(at + by + lists.length) % lists.length].id })
  const openTasks = byUrgency(list.tasks.filter((t) => !t.done || lingering.has(t.id)))
  const focused = new Set(focusTasks(lists, focus).map((t) => t.id))
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
        {lists.length > 1 && (
          <button className="quests-turn" aria-label="Previous list" title="Previous list" onClick={() => turn(-1)}>
            ◂
          </button>
        )}
        <button className="quests-name" title="Open all your tasks" onClick={full}>
          <i />
          <span>{list.name}</span>
        </button>
        {lists.length > 1 && (
          <button className="quests-turn" aria-label="Next list" title="Next list" onClick={() => turn(1)}>
            ▸
          </button>
        )}
        <em>
          {finished}/{list.tasks.length}
        </em>
        <button className="quests-fold" aria-label={folded ? 'Show tasks' : 'Hide tasks'} title={folded ? 'Show tasks' : 'Hide tasks'} aria-expanded={!folded} onClick={() => useTaskView.setState({ folded: !folded })}>
          {folded ? '▸' : '▾'}
        </button>
      </header>
      {!folded && (
        <div className="quests-body" key={list.id}>
          <div className="journey-bar">
            <div style={{ width: `${list.tasks.length ? Math.round((finished / list.tasks.length) * 100) : 0}%` }} />
          </div>
          <ul>
            {openTasks.map((task) => {
              const category = categories.find((c) => c.id === task.category)
              const plan = planOf(task)
              return (
                <li key={task.id} className={`task ${task.done ? 'done' : ''} ${lingering.has(task.id) ? 'lingering' : ''} ${focused.has(task.id) ? 'focus' : ''}`}>
                  <button className="task-box" role="checkbox" aria-checked={task.done} aria-label={`Mark "${task.title}" as done`} onClick={() => tick(task)}>
                    {task.done && <Icon.check />}
                  </button>
                  <button className="task-title" title={focused.has(task.id) ? 'In focus for your timer. Click to let it go' : 'Focus on this for your timer'} onClick={() => !task.done && focusOn(task)}>
                    {focused.has(task.id) && <Icon.target />}
                    {task.title}
                    {plan.text && (
                      <small className={plan.late ? 'late' : ''} style={plan.priority && !plan.late ? { color: plan.priority.color } : undefined}>
                        {plan.text}
                      </small>
                    )}
                  </button>
                  {category && (
                    <span className="task-tag">
                      <Gem color={category.color} />
                      {category.name}
                    </span>
                  )}
                  <button className={task.starred ? 'task-star on' : 'task-star'} aria-pressed={task.starred} aria-label="A must for today" title={task.starred ? 'A must for today. Click to unstar' : 'Star as a must for today'} onClick={() => todo.plan(task.id, { starred: !task.starred })}>
                    <Icon.star />
                  </button>
                </li>
              )
            })}
          </ul>
          {openTasks.length === 0 && <p>{list.tasks.length ? 'All done here.' : 'Nothing on this list yet.'}</p>}
          <form onSubmit={add}>
            <input value={draft} maxLength={MAX_TASK_LENGTH} placeholder="Add a task" aria-label="Add a task" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()} />
          </form>
        </div>
      )}
    </aside>
  )
}

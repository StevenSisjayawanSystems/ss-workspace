import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MAX_TASKS, MAX_TASK_LENGTH, TASK_BONUS_SECONDS, type Task, type TaskSession } from '@guildhouse/shared'
import { useGame } from '../game'
import { setStatus, todo, useNet } from '../net/net'
import { Icon } from './icons'

// A question that has to be answered before something is thrown away.
interface Question {
  title: string
  detail: string
  yes: string
  // The way out, when "Keep" would not read right.
  keep?: string
  run: () => void
}

function Confirm({ ask, onClose }: { ask: Question; onClose: () => void }) {
  return (
    <div className="confirm-scrim" onClick={onClose}>
      <div className="confirm" role="alertdialog" aria-label={ask.title} onClick={(e) => e.stopPropagation()}>
        <b>{ask.title}</b>
        <p>{ask.detail}</p>
        <div>
          <button autoFocus onClick={onClose}>
            {ask.keep ?? 'Keep'}
          </button>
          <button
            className={ask.keep ? 'on' : 'danger'}
            onClick={() => {
              ask.run()
              onClose()
            }}
          >
            {ask.yes}
          </button>
        </div>
      </div>
    </div>
  )
}

// One line of a list that only shows: ticked or not, and what it says.
export function TaskLine({ task }: { task: Task }) {
  return (
    <li className={task.done ? 'task done' : 'task'}>
      <span className="task-box">{task.done && <Icon.check />}</span>
      <span className="task-title">{task.title}</span>
    </li>
  )
}

const day = (at: number) => new Date(at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
const hour = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

// The sessions someone has closed: when, how many tasks, and (when it is ours to read) which.
export function SessionLog({ sessions }: { sessions: TaskSession[] }) {
  if (!sessions.length) return <p className="profile-note">No sessions yet. One is written here each time a set of tasks is closed with "I'm done with this session".</p>
  return (
    <ul className="task-sessions">
      {sessions.map((s) => (
        <li key={s.endedAt}>
          <div>
            <b>{day(s.startedAt)}</b>
            <span>
              {hour(s.startedAt)} to {hour(s.endedAt)}
            </span>
            <em>
              {s.done} of {s.total} done
            </em>
          </div>
          {s.titles.length > 0 && <p>{s.titles.join(' · ')}{s.done > s.titles.length ? ` · and ${s.done - s.titles.length} more` : ''}</p>}
        </li>
      ))}
    </ul>
  )
}

// Your own to-do list: what you came here to get done. Nobody else sees it unless you share it.
export function Tasks() {
  const open = useGame((s) => s.tasksOpen)
  const { list, shared, bonusLeft } = useNet((s) => s.tasks)
  const [draft, setDraft] = useState('')
  // The task being reworded, and the words so far.
  const [editing, setEditing] = useState<string | null>(null)
  const [words, setWords] = useState('')
  const [ask, setAsk] = useState<Question | null>(null)
  const [showDone, setShowDone] = useState(false)
  // The task being dragged, and the one it is held over.
  const [carried, setCarried] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const close = () => useGame.setState({ tasksOpen: false })

  useEffect(() => {
    if (!open) return
    setEditing(null)
    setAsk(null)
    // Escape backs out one step at a time: the question, then the edit, then the panel.
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setAsk((a) => {
        if (!a) setEditing((id) => (id ? null : (close(), null)))
        return null
      })
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])

  if (!open) return null
  const todoList = list.filter((t) => !t.done)
  const done = list.filter((t) => t.done).sort((a, b) => b.doneAt - a.doneAt)
  const full = list.length >= MAX_TASKS

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim() || full) return
    todo.add(draft.trim())
    setDraft('')
  }
  const startEdit = (task: Task) => {
    setEditing(task.id)
    setWords(task.title)
  }
  const saveEdit = () => {
    if (editing && words.trim()) todo.edit(editing, words.trim())
    setEditing(null)
  }
  const drop = (before?: string) => {
    if (carried && carried !== before) todo.move(carried, before)
    setCarried(null)
    setOver(null)
  }

  const row = (task: Task) => (
    <li
      key={task.id}
      className={`task ${task.done ? 'done' : ''} ${over === task.id && carried !== task.id ? 'over' : ''} ${carried === task.id ? 'carried' : ''}`}
      draggable={!task.done && editing !== task.id}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        setCarried(task.id)
      }}
      onDragOver={(e) => {
        if (!carried || task.done) return
        e.preventDefault()
        setOver(task.id)
      }}
      onDrop={() => !task.done && drop(task.id)}
      onDragEnd={() => (setCarried(null), setOver(null))}
    >
      {!task.done && (
        <span className="task-grip" title="Drag to reorder">
          <Icon.grip />
        </span>
      )}
      <button className="task-box" role="checkbox" aria-checked={task.done} aria-label={task.done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`} onClick={() => todo.done(task.id, !task.done)}>
        {task.done && <Icon.check />}
      </button>
      {editing === task.id ? (
        <input className="task-edit" autoFocus maxLength={MAX_TASK_LENGTH} value={words} onChange={(e) => setWords(e.target.value)} onBlur={saveEdit} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
      ) : (
        <span className="task-title" title={task.done ? undefined : 'Click to edit'} onClick={() => !task.done && startEdit(task)}>
          {task.title}
        </span>
      )}
      {!task.done && editing !== task.id && (
        <button className="task-tool" aria-label="Show this as what I am working on" title="Show this as what I am working on" onClick={() => setStatus(task.title)}>
          <Icon.target />
        </button>
      )}
      {editing !== task.id && (
        <button className="task-tool" aria-label="Remove this task" title="Remove this task" onClick={() => setAsk({ title: 'Remove this task?', detail: task.title, yes: 'Remove', run: () => todo.remove(task.id) })}>
          <Icon.trash />
        </button>
      )}
    </li>
  )

  return (
    <div className="tasks-scrim" onClick={close}>
      <div className="tasks" role="dialog" aria-label="My tasks" onClick={(e) => e.stopPropagation()}>
        <div className="tasks-head">
          <span>My tasks</span>
          <em>
            {done.length} of {list.length} done
          </em>
          <button className="icon-btn small" aria-label="Close" title="Close" onClick={close}>
            <Icon.close />
          </button>
        </div>
        {list.length > 0 && (
          <div className="journey-bar">
            <div style={{ width: `${Math.round((done.length / list.length) * 100)}%` }} />
          </div>
        )}
        <form className="tasks-add" onSubmit={add}>
          <input ref={field} autoFocus value={draft} maxLength={MAX_TASK_LENGTH} disabled={full} placeholder={full ? 'That is a full list. Clear some to add more' : 'Add a task and press Enter'} onChange={(e) => setDraft(e.target.value)} />
          <button className="icon-btn on" aria-label="Add task" title="Add task" disabled={!draft.trim() || full}>
            <Icon.plus />
          </button>
        </form>
        <div className="tasks-body">
          {list.length === 0 && <p className="tasks-empty">Nothing down yet. What did you come here to get done?</p>}
          <ul onDragOver={(e) => carried && e.preventDefault()} onDrop={(e) => e.target === e.currentTarget && drop()}>
            {todoList.map(row)}
          </ul>
          {todoList.length === 0 && done.length > 0 && <p className="tasks-empty">All done. Nice work.</p>}
          {done.length > 0 && (
            <>
              <div className="tasks-done-head">
                <button onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
                  {showDone ? '▾' : '▸'} Completed ({done.length})
                </button>
                <button onClick={() => setAsk({ title: 'Clear completed tasks?', detail: `${done.length} finished ${done.length === 1 ? 'task' : 'tasks'} will be removed without being logged. To keep a record, use "I'm done with this session" instead.`, yes: 'Clear', run: () => todo.clear() })}>Clear without logging</button>
              </div>
              {showDone && <ul>{done.map(row)}</ul>}
            </>
          )}
        </div>
        <button
          className="tasks-finish"
          disabled={done.length === 0}
          title={done.length === 0 ? 'Finish at least one task first' : undefined}
          onClick={() =>
            setAsk({
              title: 'Done with this session?',
              detail: `${done.length} finished ${done.length === 1 ? 'task' : 'tasks'} will be logged on your profile and cleared from the list.${todoList.length ? ` The ${todoList.length} unfinished ${todoList.length === 1 ? 'one stays' : 'stay'} for next time.` : ''}`,
              yes: 'Log session',
              keep: 'Not yet',
              run: () => todo.finish(),
            })
          }
        >
          <Icon.check />
          I'm done with this session
        </button>
        <label className="tasks-share">
          <input type="checkbox" checked={shared} onChange={(e) => todo.share(e.target.checked)} />
          <span>
            <b>Let others see my list</b>
            {shared ? 'Anyone here can open your profile and follow along.' : 'Only you can see it. Others see how many you finish, not what.'}
          </span>
        </label>
        <p className="tasks-note">
          Each task you finish grows your plant by {TASK_BONUS_SECONDS / 60} minutes. {bonusLeft > 0 ? `${bonusLeft} more will count today.` : 'That is all that count for today; the rest are for you.'}
        </p>
        {ask && <Confirm ask={ask} onClose={() => setAsk(null)} />}
      </div>
    </div>
  )
}

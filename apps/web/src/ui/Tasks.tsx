import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CATEGORY_COLORS, PRIORITIES, MAX_CATEGORIES, MAX_CATEGORY_NAME, MAX_LISTS, MAX_LIST_NAME, MAX_TASKS, MAX_TASK_LENGTH, TASK_BONUS_SECONDS, type Task, type TaskCategory, type TaskList, type TaskSession } from '@guildhouse/shared'
import { useGame } from '../game'
import { everyone, setStatus, todo, useNet } from '../net/net'
import { activeList, dueText, focusTasks, today, toggleFocus, useTaskView } from '../tasksView'
import { Icon } from './icons'

// A question that has to be answered before something is thrown away or closed.
interface Question {
  title: string
  detail: string
  yes: string
  // The way out, when "Keep" would not read right; its presence also marks the answer as harmless.
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

// The little diamond that stands for a category.
export const Gem = ({ color }: { color?: string }) => <i className="gem" style={color ? { background: color } : undefined} />

// Picks a task to focus on for the timer, alongside any already picked, or lets go of it. Picking one
// also shows it to others as what you are working on.
export function focusOn(task: Task) {
  if (toggleFocus(task.id)) setStatus(task.title)
}

// When a task should be done, in a few words: its priority and its due day. `late` marks one overdue.
export function planOf(task: Task) {
  const priority = PRIORITIES.find((p) => p.id === task.priority)
  return { priority, text: [priority?.name, task.due && dueText(task.due)].filter(Boolean).join(' · '), late: !!task.due && !task.done && task.due < today() }
}

// A task just ticked stays where it is for a moment, struck through, before it moves on. This keeps
// track of which ones those are.
export function useLinger() {
  const [lingering, setLingering] = useState<Set<string>>(new Set())
  const tick = (task: Task) => {
    todo.done(task.id, !task.done)
    if (task.done) return
    setLingering((s) => new Set(s).add(task.id))
    setTimeout(() => setLingering((s) => new Set([...s].filter((id) => id !== task.id))), 700)
  }
  return { lingering, tick }
}

// One line of a list that only shows: ticked or not, what it says, and its category.
export function TaskLine({ task, categories = [] }: { task: Task; categories?: TaskCategory[] }) {
  const category = categories.find((c) => c.id === task.category)
  return (
    <li className={task.done ? 'task done' : 'task'}>
      <span className="task-box">{task.done && <Icon.check />}</span>
      {task.starred && !task.done && (
        <span className="task-star on" title="A must for today">
          <Icon.star />
        </span>
      )}
      <span className="task-title">{task.title}</span>
      {category && (
        <span className="task-tag">
          <Gem color={category.color} />
          {category.name}
        </span>
      )}
    </li>
  )
}

const day = (at: number) => new Date(at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
const hour = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

// The sessions someone has closed: when, on which list, how many tasks, and (when it is ours to read) which.
export function SessionLog({ sessions }: { sessions: TaskSession[] }) {
  if (!sessions.length) return <p className="profile-note">No sessions yet. One is written here each time a set of tasks is closed with "I'm done with this session".</p>
  return (
    <ul className="task-sessions">
      {sessions.map((s) => (
        <li key={s.endedAt}>
          <div>
            <b>{day(s.endedAt)}</b>
            <span>
              {hour(s.endedAt)}
              {s.list && ` · ${s.list}`}
            </span>
            <em>
              {s.done} of {s.total} done
            </em>
          </div>
          {s.titles.length > 0 && (
            <p>
              {s.titles.join(' · ')}
              {s.done > s.titles.length ? ` · and ${s.done - s.titles.length} more` : ''}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

// Who can see a list: tick people who are here now. Anyone let in earlier stays listed until unticked.
function Share({ list, onClose }: { list: TaskList; onClose: () => void }) {
  const me = useNet((s) => s.me)
  useNet((s) => s.ids)
  const people = everyone().filter((p) => p.id !== me && (p.here || list.sharedWith.includes(p.id)))
  const toggle = (id: string) => todo.shareList(list.id, list.sharedWith.includes(id) ? list.sharedWith.filter((k) => k !== id) : [...list.sharedWith, id])
  return (
    <div className="tasks-pop share" role="dialog" aria-label={`Share ${list.name}`}>
      <b>Share "{list.name}" with</b>
      {people.length === 0 && <p>Nobody else is here right now. You can share with people while they are in the guildhouse.</p>}
      {people.map((p) => (
        <label key={p.id}>
          <input type="checkbox" checked={list.sharedWith.includes(p.id)} onChange={() => toggle(p.id)} />
          <span>{p.name}</span>
          <small>{p.here ? 'here now' : 'away'}</small>
        </label>
      ))}
      <p>They can open your profile and watch this list. Only you can change it.</p>
      <button onClick={onClose}>Done</button>
    </div>
  )
}

// Your to-do: several lists, tasks tagged with categories of your own, each list shared with whoever you choose.
export function Tasks() {
  const open = useGame((s) => s.tasksOpen)
  const { lists, categories, bonusLeft } = useNet((s) => s.tasks)
  const { active, group, focus } = useTaskView()
  const { lingering, tick } = useLinger()
  const [draft, setDraft] = useState('')
  const [draftTag, setDraftTag] = useState('')
  // The task being reworded, and the words so far; likewise the list being renamed.
  const [editing, setEditing] = useState<string | null>(null)
  const [words, setWords] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [ask, setAsk] = useState<Question | null>(null)
  // Which small panel is open: the share picker, the tag or planning menu of one task, or the new-list and new-category fields.
  const [pop, setPop] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[0])
  const [showDone, setShowDone] = useState(false)
  const [shut, setShut] = useState<Set<string>>(new Set())
  // The task being dragged, and what it is held over.
  const [carried, setCarried] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const close = () => useGame.setState({ tasksOpen: false })
  const list = activeList(lists, active)

  useEffect(() => {
    if (!open) return
    setEditing(null)
    setAsk(null)
    setPop(null)
    setRenaming(false)
    // Escape backs out one step at a time: a question, a small panel, an edit, then the whole thing.
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      let handled = false
      setAsk((a) => ((handled ||= !!a), null))
      setPop((p) => (handled ? p : ((handled ||= !!p), null)))
      setEditing((id) => (handled ? id : ((handled ||= !!id), null)))
      setRenaming((r) => (handled ? r : ((handled ||= r), false)))
      setTimeout(() => !handled && close())
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])

  useEffect(() => {
    setPop(null)
    setRenaming(false)
    setEditing(null)
  }, [list?.id])

  if (!open || !list) return null
  const todoList = list.tasks.filter((t) => !t.done || lingering.has(t.id))
  const done = list.tasks.filter((t) => t.done && !lingering.has(t.id)).sort((a, b) => b.doneAt - a.doneAt)
  const finished = list.tasks.filter((t) => t.done).length
  const full = list.tasks.length >= MAX_TASKS
  const categoryOf = (id: string) => categories.find((c) => c.id === id)
  const focused = new Set(focusTasks(lists, focus).map((t) => t.id))

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim() || full) return
    todo.add(list.id, draft.trim(), draftTag)
    setDraft('')
  }
  const saveEdit = () => {
    if (editing && words.trim()) todo.edit(editing, words.trim())
    setEditing(null)
  }
  const saveName = () => {
    if (renaming && words.trim()) todo.renameList(list.id, words.trim())
    setRenaming(false)
  }
  const submitNew = (e: FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    if (pop === 'new-list') todo.addList(newName.trim())
    else todo.addCategory(newName.trim(), newColor)
    setNewName('')
    setPop(null)
  }
  const endDrag = () => (setCarried(null), setOver(null))

  // Dropping one task on another puts it just before, and in a grouped view into that one's group too.
  const dropOn = (task: Task) => {
    if (!carried || carried === task.id) return
    if (group === 'priority') todo.plan(carried, { priority: task.priority })
    todo.move(carried, task.id, group === 'category' ? { category: categoryOf(task.category)?.id ?? '' } : {})
  }

  const row = (task: Task) => {
    const category = categoryOf(task.category)
    const plan = planOf(task)
    return (
      <li
        key={task.id}
        className={`task ${task.done ? 'done' : ''} ${lingering.has(task.id) ? 'lingering' : ''} ${over === task.id && carried !== task.id ? 'over' : ''} ${carried === task.id ? 'carried' : ''} ${focused.has(task.id) ? 'focus' : ''}`}
        draggable={!task.done && editing !== task.id}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          setCarried(task.id)
        }}
        onDragOver={(e) => {
          if (!carried || task.done) return
          e.preventDefault()
          e.stopPropagation()
          setOver(task.id)
        }}
        onDrop={(e) => {
          if (task.done) return
          e.stopPropagation()
          dropOn(task)
          endDrag()
        }}
        onDragEnd={endDrag}
      >
        {!task.done && (
          <span className="task-grip" title="Drag to reorder, or onto a group or another list to move it there">
            <Icon.grip />
          </span>
        )}
        <button className="task-box" role="checkbox" aria-checked={task.done} aria-label={task.done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`} onClick={() => tick(task)}>
          {task.done && <Icon.check />}
        </button>
        {!task.done && (
          <button className={task.starred ? 'task-star on' : 'task-star'} aria-pressed={task.starred} aria-label="A must for today" title={task.starred ? 'A must for today. Click to unstar' : 'Star as a must for today'} onClick={() => todo.plan(task.id, { starred: !task.starred })}>
            <Icon.star />
          </button>
        )}
        {editing === task.id ? (
          <input className="task-edit" autoFocus maxLength={MAX_TASK_LENGTH} value={words} onChange={(e) => setWords(e.target.value)} onBlur={saveEdit} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
        ) : (
          <span className="task-title" title={task.done ? undefined : 'Click to edit'} onClick={() => !task.done && (setEditing(task.id), setWords(task.title))}>
            {task.title}
          </span>
        )}
        {editing !== task.id && !task.done && (
          <span className="task-tagger">
            <button className={`task-tag ${plan.text ? '' : 'none'} ${plan.late ? 'late' : ''}`} title="Priority and due date" onClick={() => setPop(pop === `plan:${task.id}` ? null : `plan:${task.id}`)}>
              <span className="task-flag" style={plan.priority ? { color: plan.priority.color } : undefined}>
                <Icon.flag />
              </span>
              {plan.text || 'When'}
            </button>
            {pop === `plan:${task.id}` && (
              <div className="tasks-pop tags plan">
                {[...PRIORITIES, { id: 0, name: 'No priority', color: '' }].map((p) => (
                  <button key={p.id} className={task.priority === p.id ? 'on' : ''} onClick={() => todo.plan(task.id, { priority: p.id })}>
                    <Gem color={p.color || undefined} />
                    {p.name}
                  </button>
                ))}
                <label>
                  <span>Due</span>
                  <input type="date" value={task.due} onChange={(e) => todo.plan(task.id, { due: e.target.value })} />
                </label>
                <div className="tasks-quick">
                  <button onClick={() => todo.plan(task.id, { due: today() })}>Today</button>
                  {task.due && <button onClick={() => todo.plan(task.id, { due: '' })}>No date</button>}
                </div>
              </div>
            )}
          </span>
        )}
        {editing !== task.id && !task.done && (
          <span className="task-tagger">
            <button className={category ? 'task-tag' : 'task-tag none'} title="Change category" onClick={() => setPop(pop === `tag:${task.id}` ? null : `tag:${task.id}`)}>
              <Gem color={category?.color} />
              {category?.name ?? 'Tag'}
            </button>
            {pop === `tag:${task.id}` && (
              <div className="tasks-pop tags">
                {[{ id: '', name: 'No category', color: '' }, ...categories].map((c) => (
                  <button key={c.id} className={task.category === c.id ? 'on' : ''} onClick={() => (todo.tag(task.id, c.id), setPop(null))}>
                    <Gem color={c.color || undefined} />
                    {c.name}
                  </button>
                ))}
                {categories.length === 0 && <p>Make categories in the panel on the left.</p>}
              </div>
            )}
          </span>
        )}
        {!task.done && editing !== task.id && (
          <button className={focused.has(task.id) ? 'task-tool on' : 'task-tool'} aria-pressed={focused.has(task.id)} aria-label="Focus on this for my timer" title={focused.has(task.id) ? 'In focus for your timer. Click to let it go' : 'Focus on this for my timer, and show it as what I am working on'} onClick={() => focusOn(task)}>
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
  }

  // Grouped: one section per category or priority that has tasks (or is being dragged onto), ending with the unsorted ones.
  const sections: { id: string | number; name: string; color?: string; tasks: Task[] }[] =
    group === 'priority'
      ? [...PRIORITIES, { id: 0, name: 'No priority' }].map((p) => ({ ...p, tasks: todoList.filter((t) => t.priority === p.id) }))
      : [...categories.map((c) => ({ ...c, tasks: todoList.filter((t) => t.category === c.id) })), { id: '', name: 'No category', tasks: todoList.filter((t) => !categoryOf(t.category)) }]
  const groups = sections.filter((g) => g.tasks.length || carried)
  // Dropping a task on a group puts it in that group, at the end.
  const dropIn = (g: { id: string | number }) => {
    if (!carried) return
    if (typeof g.id === 'number') todo.plan(carried, { priority: g.id })
    else todo.tag(carried, g.id)
  }

  let body: ReactNode
  if (group === 'none') {
    body = (
      <ul
        className="tasks-open"
        onDragOver={(e) => carried && e.preventDefault()}
        onDrop={(e) => {
          if (e.target === e.currentTarget && carried) todo.move(carried)
          endDrag()
        }}
      >
        {todoList.map(row)}
      </ul>
    )
  } else {
    body = groups.map((g) => (
      <section
        key={g.id}
        className={`tasks-group ${over === `group:${g.id}` ? 'over' : ''}`}
        onDragOver={(e) => {
          if (!carried) return
          e.preventDefault()
          setOver(`group:${g.id}`)
        }}
        onDrop={() => {
          dropIn(g)
          endDrag()
        }}
      >
        <button className="tasks-group-head" aria-expanded={!shut.has(`${g.id}`)} onClick={() => setShut((s) => (s.has(`${g.id}`) ? new Set([...s].filter((x) => x !== `${g.id}`)) : new Set(s).add(`${g.id}`)))}>
          <Gem color={g.color} />
          <span>{g.name}</span>
          <em>{g.tasks.length}</em>
          <i>{shut.has(`${g.id}`) ? '▸' : '▾'}</i>
        </button>
        {!shut.has(`${g.id}`) && <ul>{g.tasks.map(row)}</ul>}
      </section>
    ))
  }

  return (
    <div className="tasks-scrim" onClick={close}>
      <div className="tasks" role="dialog" aria-label="Tasks" onClick={(e) => e.stopPropagation()}>
        <nav className="tasks-rail">
          <h4>Lists</h4>
          <ul>
            {lists.map((l) => {
              const left = l.tasks.filter((t) => !t.done).length
              return (
                <li
                  key={l.id}
                  className={over === `list:${l.id}` ? 'over' : ''}
                  onDragOver={(e) => {
                    // A task held over another list will be sent there.
                    if (!carried || l.id === list.id) return
                    e.preventDefault()
                    setOver(`list:${l.id}`)
                  }}
                  onDrop={() => {
                    if (carried && l.id !== list.id) todo.move(carried, undefined, { list: l.id })
                    endDrag()
                  }}
                >
                  <button className={l.id === list.id ? 'on' : ''} onClick={() => useTaskView.setState({ active: l.id })}>
                    <span>{l.name}</span>
                    {l.sharedWith.length > 0 && <Icon.people />}
                    {left > 0 && <em>{left}</em>}
                  </button>
                </li>
              )
            })}
          </ul>
          {pop === 'new-list' ? (
            <form onSubmit={submitNew}>
              <input autoFocus placeholder="Name the list" maxLength={MAX_LIST_NAME} value={newName} onChange={(e) => setNewName(e.target.value)} onBlur={() => !newName && setPop(null)} />
            </form>
          ) : (
            lists.length < MAX_LISTS && (
              <button className="tasks-new" onClick={() => (setNewName(''), setPop('new-list'))}>
                <Icon.plus />
                New list
              </button>
            )
          )}

          <h4>Categories</h4>
          <ul className="tasks-cats">
            {categories.map((c) => (
              <li key={c.id}>
                <Gem color={c.color} />
                <span>{c.name}</span>
                <button aria-label={`Remove the category ${c.name}`} title="Remove category" onClick={() => setAsk({ title: `Remove "${c.name}"?`, detail: 'Tasks tagged with it stay on their lists, without a category.', yes: 'Remove', run: () => todo.removeCategory(c.id) })}>
                  <Icon.close />
                </button>
              </li>
            ))}
          </ul>
          {pop === 'new-category' ? (
            <form onSubmit={submitNew}>
              <input autoFocus placeholder="Name the category" maxLength={MAX_CATEGORY_NAME} value={newName} onChange={(e) => setNewName(e.target.value)} />
              <div className="tasks-colors">
                {CATEGORY_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Colour ${c}`} className={c === newColor ? 'on' : ''} style={{ background: c }} onClick={() => setNewColor(c)} />
                ))}
              </div>
            </form>
          ) : (
            categories.length < MAX_CATEGORIES && (
              <button
                className="tasks-new"
                onClick={() => {
                  setNewName('')
                  setNewColor(CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length])
                  setPop('new-category')
                }}
              >
                <Icon.plus />
                New category
              </button>
            )
          )}
        </nav>

        <div className="tasks-main" key={list.id}>
          <div className="tasks-head">
            {renaming ? (
              <input className="task-edit" autoFocus maxLength={MAX_LIST_NAME} value={words} onChange={(e) => setWords(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && saveName()} />
            ) : (
              <h3 title="Click to rename" onClick={() => (setWords(list.name), setRenaming(true))}>
                {list.name}
              </h3>
            )}
            <em>
              {finished} of {list.tasks.length} done
            </em>
            <button className={`tasks-chip ${list.sharedWith.length ? 'on' : ''}`} title="Choose who can see this list" onClick={() => setPop(pop === 'share' ? null : 'share')}>
              <Icon.people />
              {list.sharedWith.length ? `Shared with ${list.sharedWith.length}` : 'Share'}
            </button>
            {lists.length > 1 && (
              <button className="task-tool" aria-label="Remove this list" title="Remove this list" onClick={() => setAsk({ title: `Remove "${list.name}"?`, detail: list.tasks.length ? `The list and its ${list.tasks.length} ${list.tasks.length === 1 ? 'task' : 'tasks'} will be gone. Sessions already logged stay on your profile.` : 'The list will be gone.', yes: 'Remove list', run: () => todo.removeList(list.id) })}>
                <Icon.trash />
              </button>
            )}
            <button className="icon-btn small" aria-label="Close" title="Close" onClick={close}>
              <Icon.close />
            </button>
            {pop === 'share' && <Share list={list} onClose={() => setPop(null)} />}
          </div>
          <div className="journey-bar">
            <div style={{ width: `${list.tasks.length ? Math.round((finished / list.tasks.length) * 100) : 0}%` }} />
          </div>

          <form className="tasks-add" onSubmit={add}>
            <input ref={field} autoFocus value={draft} maxLength={MAX_TASK_LENGTH} disabled={full} placeholder={full ? 'That is a full list. Clear some to add more' : 'Add a task and press Enter'} onChange={(e) => setDraft(e.target.value)} />
            {categories.length > 0 && (
              <select aria-label="Category for the new task" value={categoryOf(draftTag) ? draftTag : ''} onChange={(e) => setDraftTag(e.target.value)}>
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <button className="icon-btn on" aria-label="Add task" title="Add task" disabled={!draft.trim() || full}>
              <Icon.plus />
            </button>
          </form>

          <div className="tasks-bar">
            {(['none', 'category', 'priority'] as const).map((g) => (
              <button key={g} className={group === g ? 'on' : ''} onClick={() => useTaskView.setState({ group: g })}>
                {g === 'none' ? 'My order' : g === 'category' ? 'By category' : 'By priority'}
              </button>
            ))}
          </div>

          <div className="tasks-body">
            {list.tasks.length === 0 && <p className="tasks-empty">Nothing down yet. What did you come here to get done?</p>}
            {body}
            {todoList.length === 0 && done.length > 0 && <p className="tasks-empty">All done. Nice work.</p>}
            {done.length > 0 && (
              <>
                <div className="tasks-done-head">
                  <button onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
                    {showDone ? '▾' : '▸'} Completed ({done.length})
                  </button>
                  <button onClick={() => setAsk({ title: 'Clear completed tasks?', detail: `${done.length} finished ${done.length === 1 ? 'task' : 'tasks'} will be removed without being logged. To keep a record, use "I'm done with this session" instead.`, yes: 'Clear', run: () => todo.clear(list.id) })}>Clear without logging</button>
                </div>
                {showDone && <ul>{done.map(row)}</ul>}
              </>
            )}
          </div>

          <div className="tasks-foot">
            <p>
              Each task you finish grows your plant by {TASK_BONUS_SECONDS / 60} minutes. {bonusLeft > 0 ? `${bonusLeft} more will count today.` : 'That is all that count for today; the rest are for you.'}
            </p>
            <button
              className="tasks-finish"
              disabled={finished === 0}
              title={finished === 0 ? 'Finish at least one task first' : undefined}
              onClick={() =>
                setAsk({
                  title: 'Done with this session?',
                  detail: `${finished} finished ${finished === 1 ? 'task' : 'tasks'} on "${list.name}" will be logged on your profile and cleared.${list.tasks.length - finished ? ` The ${list.tasks.length - finished} unfinished ${list.tasks.length - finished === 1 ? 'one stays' : 'stay'} for next time.` : ''}`,
                  yes: 'Log session',
                  keep: 'Not yet',
                  run: () => todo.finish(list.id),
                })
              }
            >
              <Icon.check />
              I'm done with this session
            </button>
          </div>
        </div>
        {ask && <Confirm ask={ask} onClose={() => setAsk(null)} />}
      </div>
    </div>
  )
}

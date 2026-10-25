import { useEffect, useState, type FormEvent } from 'react'
import { byUrgency } from '@guildhouse/shared'
import { useGame } from '../game'
import { alarm, pomodoro, serverNow, stopAlarm, todo, useNet, type PomoState } from '../net/net'
import { focusTasks, toggleFocus, useTaskView } from '../tasksView'
import { Company } from './Company'
import { Icon } from './icons'

const SPLITS: [number, number][] = [
  [25, 5],
  [50, 10],
  [15, 3],
]
const COUNTDOWNS = [5, 10, 15, 30, 60]
const LONG_BREAK_EVERY = 4
// The server enforces the same bounds.
const LIMITS = { focus: [1, 180], rest: [1, 60], timer: [1, 600] } as const

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

const within = (v: number, [min, max]: readonly [number, number]) => Number.isInteger(v) && v >= min && v <= max

function Minutes({ label, value, limits, onChange }: { label: string; value: number; limits: readonly [number, number]; onChange: (v: number) => void }) {
  return (
    <label className="pomo-field">
      <span>{label}</span>
      <input type="number" inputMode="numeric" min={limits[0]} max={limits[1]} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(e.target.valueAsNumber)} />
      <i>min</i>
    </label>
  )
}

// What to start: a repeating focus/break rhythm, or a single countdown. Either way it is your own,
// and others can join it.
function Setup() {
  const [mode, setMode] = useState<'pomodoro' | 'timer'>('pomodoro')
  const [focus, setFocus] = useState(45)
  const [rest, setRest] = useState(10)
  const [length, setLength] = useState(20)

  const startCustom = (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'pomodoro') pomodoro.start(focus, rest)
    else pomodoro.timer(length)
  }
  const valid = mode === 'pomodoro' ? within(focus, LIMITS.focus) && within(rest, LIMITS.rest) : within(length, LIMITS.timer)

  return (
    <>
      <div className="pomo-tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'pomodoro'} className={mode === 'pomodoro' ? 'on' : ''} onClick={() => setMode('pomodoro')}>
          Pomodoro
        </button>
        <button role="tab" aria-selected={mode === 'timer'} className={mode === 'timer' ? 'on' : ''} onClick={() => setMode('timer')}>
          Timer
        </button>
      </div>
      <div className="pomo-note">{mode === 'pomodoro' ? 'Focus and break in turns. It is yours; others can join.' : 'One countdown. It is yours; others can join.'}</div>
      {mode === 'pomodoro' ? (
        <div className="pomo-presets">
          {SPLITS.map(([f, b]) => (
            <button key={f} onClick={() => pomodoro.start(f, b)}>
              <b>{f}</b> min focus
              <span>{b} min break</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="pomo-chips">
          {COUNTDOWNS.map((m) => (
            <button key={m} onClick={() => pomodoro.timer(m)}>
              {m}
            </button>
          ))}
        </div>
      )}
      <form className="pomo-custom" onSubmit={startCustom}>
        <div className="pomo-custom-label">Custom</div>
        {mode === 'pomodoro' ? (
          <>
            <Minutes label="Focus" value={focus} limits={LIMITS.focus} onChange={setFocus} />
            <Minutes label="Break" value={rest} limits={LIMITS.rest} onChange={setRest} />
          </>
        ) : (
          <Minutes label="Length" value={length} limits={LIMITS.timer} onChange={setLength} />
        )}
        <button className="icon-btn on" disabled={!valid} aria-label="Start" title="Start">
          <Icon.play />
        </button>
      </form>
    </>
  )
}

const longBreak = (p: PomoState) => p.phase === 'break' && p.round > 0 && p.round % LONG_BREAK_EVERY === 0
const phaseName = (p: PomoState) => (p.phase === 'timer' ? 'Timer' : p.phase === 'focus' ? 'Focus' : longBreak(p) ? 'Long break' : 'Break')
const timeLeft = (p: PomoState) => (p.paused ? p.remainingMs : p.endsAt - serverNow())

// Redraws twice a second while a clock is showing.
function useTicking(on: boolean) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [on])
}

// The tasks this stretch of focus is for, picked from your own lists: as many as you like. Each can
// be ticked off or let go from here.
function Focus() {
  const lists = useNet((s) => s.tasks.lists)
  const focus = useTaskView((s) => s.focus)
  const tasks = focusTasks(lists, focus)
  const picked = new Set(tasks.map((t) => t.id))
  const open = lists.map((l) => ({ ...l, tasks: byUrgency(l.tasks.filter((t) => !t.done && !picked.has(t.id))) })).filter((l) => l.tasks.length)
  return (
    <div className="pomo-alarm pomo-focus">
      <div className="pomo-custom-label">
        <Icon.target />
        Focusing on
      </div>
      {tasks.length > 0 && (
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              <button className="task-box" role="checkbox" aria-checked={false} aria-label={`Mark "${task.title}" as done`} title="Mark as done" onClick={() => todo.done(task.id, true)} />
              <span>{task.title}</span>
              <button className="task-tool" aria-label={`Take "${task.title}" out of focus`} title="Take out of focus" onClick={() => toggleFocus(task.id)}>
                <Icon.close />
              </button>
            </li>
          ))}
        </ul>
      )}
      <select aria-label="Add a task to focus on" value="" disabled={!open.length} onChange={(e) => e.target.value && toggleFocus(e.target.value)}>
        <option value="">{open.length ? (tasks.length ? 'Add another task…' : 'Add a task…') : tasks.length ? 'No more open tasks' : 'No open tasks'}</option>
        {open.map((l) => (
          <optgroup key={l.id} label={l.name}>
            {l.tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.starred ? '★ ' : ''}
                {t.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

// Other people's timers that are open, or that we have been invited to. Joining one leaves our own.
function Others() {
  const timers = useNet((s) => s.timers)
  useTicking(timers.length > 0)
  if (!timers.length) return null
  return (
    <div className="pomo-alarm pomo-others">
      <div className="pomo-custom-label">
        <Icon.people />
        Join someone
      </div>
      <div className="pomo-presets">
        {timers.map((t) => (
          <button key={t.id} title={`Join ${t.startedBy || 'them'}`} onClick={() => pomodoro.join(t.id)}>
            <b>{t.startedBy || 'Someone'}</b>
            <span>
              {t.paused ? 'Paused' : phaseName(t)} · {mmss(timeLeft(t))}
              {t.members.length > 1 && ` · ${t.members.length} in`}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

const clockTime = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

// Your own alarm, for a time of day. Unlike the timer above it, nobody else hears it.
function AlarmSetup() {
  const set = useNet((s) => s.alarm)
  const [time, setTime] = useState('')
  const [label, setLabel] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const [h, m] = time.split(':').map(Number)
    if (!Number.isInteger(h) || !Number.isInteger(m)) return
    const at = new Date()
    at.setHours(h, m, 0, 0)
    // A time already gone today means that time tomorrow.
    if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1)
    alarm.set(at.getTime(), label.trim())
    setLabel('')
  }

  return (
    <div className="pomo-alarm">
      <div className="pomo-custom-label">
        <Icon.bell />
        Alarm, just for you
      </div>
      {set.at ? (
        <div className="pomo-alarm-set">
          <div>
            <b>{clockTime(alarm.localTime(set.at))}</b>
            {set.label && <span>{set.label}</span>}
          </div>
          <button className="icon-btn danger" aria-label="Cancel the alarm" title="Cancel the alarm" onClick={() => alarm.clear()}>
            <Icon.close />
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <input type="time" aria-label="Alarm time" value={time} required onChange={(e) => setTime(e.target.value)} />
          <input aria-label="What it is for" placeholder="What for?" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="icon-btn on" disabled={!time} aria-label="Set alarm" title="Set alarm">
            <Icon.plus />
          </button>
        </form>
      )}
    </div>
  )
}

// An alarm going off: it keeps ringing until it is answered, or for a minute.
export function Alarm() {
  const ringing = useNet((s) => s.alarmRinging)
  if (!ringing) return null
  return (
    <div className="ring alarm" role="alertdialog" aria-label="Alarm">
      <div className="ring-pulse">
        <Icon.bell />
      </div>
      <div className="ring-text">
        <b>{ringing.label || 'Alarm'}</b>
        <span>It is {clockTime(alarm.localTime(ringing.at))}</span>
      </div>
      <button className="ring-btn accept" onClick={() => stopAlarm()}>
        <Icon.check />
        Dismiss
      </button>
      <button className="ring-btn" onClick={() => stopAlarm(5)}>
        <Icon.timer />
        5 more minutes
      </button>
    </div>
  )
}

// Your timer. It is yours alone until someone joins it; then everyone in on it works and rests in step.
export function Pomodoro() {
  const pomo = useNet((s) => s.pomo)
  const alarmAt = useNet((s) => s.alarm.at)
  const online = useNet((s) => s.status === 'online')
  const open = useGame((s) => s.pomoOpen)
  const setOpen = useGame((s) => s.setPomoOpen)
  const tasksFolded = useTaskView((s) => s.folded)
  const lists = useNet((s) => s.tasks.lists)
  const focusing = focusTasks(lists, useTaskView((s) => s.focus))
  const running = pomo.phase !== 'idle'
  const plain = pomo.phase === 'timer'
  const alone = pomo.members.length < 2
  useTicking(running)

  const left = timeLeft(pomo)
  const label = phaseName(pomo)
  const toggleOpen = () => {
    const nextOpen = !open
    if (nextOpen && !tasksFolded) useTaskView.setState({ folded: true })
    setOpen(nextOpen)
  }

  // The countdown rides in the tab title, so it is visible while you work in another window.
  useEffect(() => {
    document.title = running ? `${mmss(left)} ${label} · Guildhouse` : 'Guildhouse'
    return () => {
      document.title = 'Guildhouse'
    }
  })

  if (!online) return null
  return (
    <>
      <button
        className={`pomo-pill ${pomo.phase} ${pomo.paused ? 'paused' : ''}`}
        aria-expanded={open}
        aria-controls="pomodoro-panel"
        title={focusing.length ? `Timer · focusing on ${focusing.map((t) => t.title).join(', ')}` : 'Timer'}
        onClick={toggleOpen}
      >
        <Icon.timer />
        {running ? (
          <>
            <span>{mmss(left)}</span>
            <i>{pomo.paused ? 'Paused' : label}</i>
          </>
        ) : (
          <span>Timer</span>
        )}
        {alarmAt > 0 && (
          <em title={`Alarm at ${clockTime(alarm.localTime(alarmAt))}`}>
            <Icon.bell />
          </em>
        )}
      </button>
      {open && (
        <div className="pomo" id="pomodoro-panel">
          <button
            className="icon-btn pomo-close"
            aria-label="Close timer"
            title="Close timer"
            onClick={() => setOpen(false)}
          >
            <Icon.close />
          </button>

          {running ? (
            <>
              <div className="pomo-phase">
                {label}
                {pomo.paused && ' · paused'}
              </div>
              <div className="pomo-time">{mmss(left)}</div>
              {!plain && (
                <div className="pomo-rounds" title={`${pomo.round} focus sessions finished`}>
                  {Array.from({ length: LONG_BREAK_EVERY }, (_, i) => (
                    <b key={i} className={i < (pomo.round % LONG_BREAK_EVERY || (pomo.round && pomo.phase === 'break' ? LONG_BREAK_EVERY : 0)) ? 'done' : ''} />
                  ))}
                </div>
              )}
              <div className="pomo-actions">
                <button className="icon-btn on" aria-label={pomo.paused ? 'Resume' : 'Pause'} title={`${pomo.paused ? 'Resume' : 'Pause'}${alone ? '' : ' for everyone in on it'}`} onClick={() => (pomo.paused ? pomodoro.resume() : pomodoro.pause())}>
                  {pomo.paused ? <Icon.play /> : <Icon.pause />}
                </button>
                {!plain && (
                  <button className="icon-btn" aria-label={pomo.phase === 'focus' ? 'Skip to the break' : 'Skip the break'} title={pomo.phase === 'focus' ? 'Skip to the break' : 'Skip the break'} onClick={() => pomodoro.skip()}>
                    <Icon.skip />
                  </button>
                )}
                <button className="icon-btn danger" aria-label={alone ? 'Stop the timer' : 'Leave the timer'} title={alone ? 'Stop the timer' : 'Leave the timer. It carries on for the others'} onClick={() => pomodoro.leave()}>
                  {alone ? <Icon.stop /> : <Icon.leave />}
                </button>
              </div>
              <div className="pomo-note">
                {plain ? `${pomo.focusMin} min timer` : `${pomo.focusMin} min focus · ${pomo.breakMin} min break`}
                {!alone && ` · started by ${pomo.startedBy || 'someone'}`}
              </div>
              <Company members={pomo.members} open={pomo.open} onOpen={pomodoro.open} onBring={pomodoro.bring} />
            </>
          ) : (
            <Setup />
          )}
          <Focus />
          <Others />
          <AlarmSetup />
        </div>
      )}
    </>
  )
}

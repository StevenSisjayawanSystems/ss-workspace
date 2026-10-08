import { useEffect, useState, type FormEvent } from 'react'
import { pomodoro, serverNow, useNet } from '../net/net'
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

// What to start: a repeating focus/break rhythm, or a single countdown. Either way it is one clock for everyone.
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
      <div className="pomo-note">{mode === 'pomodoro' ? 'Focus and break in turns, for everyone here.' : 'One countdown, for everyone here.'}</div>
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
        <button className="icon-btn on" disabled={!valid} aria-label="Start" title="Start for everyone">
          <Icon.play />
        </button>
      </form>
    </>
  )
}

// The shared timer: one clock for everyone, so the whole guildhouse works and rests in step.
export function Pomodoro() {
  const pomo = useNet((s) => s.pomo)
  const online = useNet((s) => s.status === 'online')
  const [open, setOpen] = useState(false)
  const [, tick] = useState(0)
  const running = pomo.phase !== 'idle'
  const plain = pomo.phase === 'timer'

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [running])

  const left = pomo.paused ? pomo.remainingMs : pomo.endsAt - serverNow()
  const longBreak = pomo.phase === 'break' && pomo.round > 0 && pomo.round % LONG_BREAK_EVERY === 0
  const label = plain ? 'Timer' : pomo.phase === 'focus' ? 'Focus' : longBreak ? 'Long break' : 'Break'

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
      <button className={`pomo-pill ${pomo.phase} ${pomo.paused ? 'paused' : ''}`} title="Shared timer" onClick={() => setOpen(!open)}>
        <Icon.timer />
        {running ? (
          <>
            <span>{mmss(left)}</span>
            <i>{pomo.paused ? 'Paused' : label}</i>
          </>
        ) : (
          <span>Timer</span>
        )}
      </button>
      {open && (
        <div className="pomo">
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
                <button className="icon-btn on" aria-label={pomo.paused ? 'Resume for everyone' : 'Pause for everyone'} title={pomo.paused ? 'Resume for everyone' : 'Pause for everyone'} onClick={() => (pomo.paused ? pomodoro.resume() : pomodoro.pause())}>
                  {pomo.paused ? <Icon.play /> : <Icon.pause />}
                </button>
                {!plain && (
                  <button className="icon-btn" aria-label={pomo.phase === 'focus' ? 'Skip to the break' : 'Skip the break'} title={pomo.phase === 'focus' ? 'Skip to the break' : 'Skip the break'} onClick={() => pomodoro.skip()}>
                    <Icon.skip />
                  </button>
                )}
                <button className="icon-btn danger" aria-label="Stop the timer for everyone" title="Stop the timer for everyone" onClick={() => pomodoro.stop()}>
                  <Icon.stop />
                </button>
              </div>
              <div className="pomo-note">
                {plain ? `${pomo.focusMin} min timer` : `${pomo.focusMin} min focus · ${pomo.breakMin} min break`} · started by {pomo.startedBy || 'someone'}
              </div>
            </>
          ) : (
            <Setup />
          )}
        </div>
      )}
    </>
  )
}

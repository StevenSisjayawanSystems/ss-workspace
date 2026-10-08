import { useEffect, useState } from 'react'
import { pomodoro, serverNow, useNet } from '../net/net'
import { Icon } from './icons'

const PRESETS: [number, number][] = [
  [25, 5],
  [50, 10],
  [15, 3],
]
const LONG_BREAK_EVERY = 4

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// The shared focus timer: one clock for everyone, so the whole guildhouse works and rests in step.
export function Pomodoro() {
  const pomo = useNet((s) => s.pomo)
  const online = useNet((s) => s.status === 'online')
  const [open, setOpen] = useState(false)
  const [, tick] = useState(0)
  const running = pomo.phase !== 'idle'

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [running])

  const left = pomo.paused ? pomo.remainingMs : pomo.endsAt - serverNow()
  const longBreak = pomo.phase === 'break' && pomo.round > 0 && pomo.round % LONG_BREAK_EVERY === 0
  const label = pomo.phase === 'focus' ? 'Focus' : longBreak ? 'Long break' : 'Break'

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
      <button className={`pomo-pill ${pomo.phase} ${pomo.paused ? 'paused' : ''}`} title="Shared focus timer" onClick={() => setOpen(!open)}>
        <Icon.timer />
        {running ? (
          <>
            <span>{mmss(left)}</span>
            <i>{pomo.paused ? 'Paused' : label}</i>
          </>
        ) : (
          <span>Focus timer</span>
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
              <div className="pomo-rounds" title={`${pomo.round} focus sessions finished`}>
                {Array.from({ length: LONG_BREAK_EVERY }, (_, i) => (
                  <b key={i} className={i < (pomo.round % LONG_BREAK_EVERY || (pomo.round && pomo.phase === 'break' ? LONG_BREAK_EVERY : 0)) ? 'done' : ''} />
                ))}
              </div>
              <div className="pomo-actions">
                <button className="icon-btn on" aria-label={pomo.paused ? 'Resume for everyone' : 'Pause for everyone'} title={pomo.paused ? 'Resume for everyone' : 'Pause for everyone'} onClick={() => (pomo.paused ? pomodoro.resume() : pomodoro.pause())}>
                  {pomo.paused ? <Icon.play /> : <Icon.pause />}
                </button>
                <button className="icon-btn" aria-label={pomo.phase === 'focus' ? 'Skip to the break' : 'Skip the break'} title={pomo.phase === 'focus' ? 'Skip to the break' : 'Skip the break'} onClick={() => pomodoro.skip()}>
                  <Icon.skip />
                </button>
                <button className="icon-btn danger" aria-label="Stop the timer for everyone" title="Stop the timer for everyone" onClick={() => pomodoro.stop()}>
                  <Icon.stop />
                </button>
              </div>
              <div className="pomo-note">
                {pomo.focusMin} min focus · {pomo.breakMin} min break · started by {pomo.startedBy || 'someone'}
              </div>
            </>
          ) : (
            <>
              <div className="pomo-phase">Focus together</div>
              <div className="pomo-note">Starts one timer for everyone here. Pick a rhythm:</div>
              <div className="pomo-presets">
                {PRESETS.map(([f, b]) => (
                  <button key={f} onClick={() => pomodoro.start(f, b)}>
                    <b>{f}</b> min focus
                    <span>{b} min break</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}

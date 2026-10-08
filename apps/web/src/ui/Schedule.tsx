import { useEffect, useState } from 'react'
import { BOOKING_MINUTES, roomById } from '@guildhouse/shared'
import { useGame } from '../game'
import { rooms, serverNow, useNet } from '../net/net'
import { Icon } from './icons'

// Server times shown on this computer's clock.
export const clockTime = (serverMs: number) => new Date(serverMs - (serverNow() - Date.now())).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

const dayLabel = (serverMs: number) => {
  const d = new Date(serverMs - (serverNow() - Date.now()))
  const today = new Date()
  const tomorrow = new Date(Date.now() + 86400000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

const lengthLabel = (m: number) => (m < 60 ? `${m} min` : `${m / 60} hr`)

// The schedule for one meeting room: what is booked, and a form to book it now or later.
export function Schedule() {
  const zone = useGame((s) => s.scheduleOf)
  const me = useGame((s) => s.profile?.name)
  const all = useNet((s) => s.bookings)
  const closedBy = useNet((s) => (zone ? s.closed[zone] : undefined))
  const [later, setLater] = useState(false)
  const [day, setDay] = useState(0)
  const [time, setTime] = useState('')
  const [minutes, setMinutes] = useState(60)
  const [, refresh] = useState(0)
  const close = () => useGame.setState({ scheduleOf: null })

  useEffect(() => {
    if (!zone) return
    const t = setInterval(() => refresh((n) => n + 1), 15000)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', key)
    return () => {
      clearInterval(t)
      window.removeEventListener('keydown', key)
    }
  }, [zone])

  if (!zone) return null
  const now = serverNow()
  const bookings = all.filter((b) => b.zone === zone && b.until > now)
  const current = bookings.find((b) => b.start <= now)

  // The chosen start on this computer's clock, or null for "now".
  let start: number | null = null
  if (later && time) {
    const [h, m] = time.split(':').map(Number)
    const d = new Date()
    d.setDate(d.getDate() + day)
    d.setHours(h, m, 0, 0)
    start = d.getTime()
  }
  const inPast = start !== null && start < Date.now() - 60000
  const canBook = !later || (!!time && !inPast)

  return (
    <div className="board-scrim" onClick={close}>
      <div className="schedule" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${roomById(zone).name} schedule`}>
        <div className="board-head">
          <span>{roomById(zone).name}</span>
          <button className="icon-btn small" aria-label="Close" title="Close" onClick={close}>
            <Icon.close />
          </button>
        </div>
        <div className={`schedule-now ${current || closedBy ? 'busy' : ''}`}>
          {current ? `Booked by ${current.by} until ${clockTime(current.until)}` : 'Free right now'}
          {closedBy && <span>Door closed by {closedBy}: knock to enter</span>}
        </div>

        <div className="schedule-label">Book it</div>
        <div className="pomo-tabs">
          <button className={!later ? 'on' : ''} onClick={() => setLater(false)}>
            Now
          </button>
          <button className={later ? 'on' : ''} onClick={() => setLater(true)}>
            Later
          </button>
        </div>
        {later && (
          <div className="schedule-when">
            <div className="status-chips">
              {['Today', 'Tomorrow'].map((d, i) => (
                <button key={d} className={day === i ? 'on' : ''} onClick={() => setDay(i)}>
                  {d}
                </button>
              ))}
            </div>
            <input type="time" value={time} aria-label="Start time" onChange={(e) => setTime(e.target.value)} />
          </div>
        )}
        <div className="status-chips">
          {BOOKING_MINUTES.map((m) => (
            <button key={m} className={minutes === m ? 'on' : ''} onClick={() => setMinutes(m)}>
              {lengthLabel(m)}
            </button>
          ))}
        </div>
        {inPast && <div className="field-note">That time has already passed.</div>}
        <button className="primary" disabled={!canBook} onClick={() => rooms.book(zone, start, minutes)}>
          Book
        </button>

        <div className="schedule-label">Coming up</div>
        <ul className="schedule-list">
          {bookings.length === 0 && <li className="empty">Nothing booked.</li>}
          {bookings.map((b) => (
            <li key={b.id} className={b.start <= now ? 'current' : ''}>
              <div>
                <b>
                  {dayLabel(b.start)} · {clockTime(b.start)} – {clockTime(b.until)}
                </b>
                <span>{b.by === me ? 'You' : b.by}</span>
              </div>
              {b.by === me && (
                <button className="icon-btn small" aria-label="Cancel this booking" title="Cancel this booking" onClick={() => rooms.cancel(b.id)}>
                  <Icon.close />
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="profile-note">A booking shows the room is spoken for; it does not keep anyone out. For a private meeting, sit down and close the door from the call panel. Anyone new then knocks.</p>
      </div>
    </div>
  )
}

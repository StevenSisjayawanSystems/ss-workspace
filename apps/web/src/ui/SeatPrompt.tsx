import { useEffect, useState } from 'react'
import { BOOKABLE_ZONES, QUIET_ZONES, ROOMS, SEATS, deskOfSeat, roomById, seatById, type ZoneId } from '@guildhouse/shared'
import { useGame } from '../game'
import { joinCallIn, joinNow, requestSit, seatInReach, sitNearby, useNet } from '../net/net'
import { Icon } from './icons'

// Standing next to a free seat: one key, or one tap, sits you down and joins that room's call.
export function SeatPrompt() {
  const seated = useGame((s) => !!s.seat)
  const walking = useGame((s) => !!s.pendingSeat)
  const me = useGame((s) => s.profile?.name)
  const desks = useNet((s) => s.desks)
  const zone = useGame((s) => s.zone)
  const [near, setNear] = useState<string | null>(null)
  useEffect(() => {
    const t = setInterval(() => setNear(seatInReach()?.id ?? null), 150)
    return () => clearInterval(t)
  }, [])

  const seat = seatById(near ?? '')
  if (seated || walking) return null
  // Inside a meeting room but not beside a chair: E still gets you into the call.
  if (!seat)
    return BOOKABLE_ZONES.includes(zone) ? (
      <button className="seat-prompt" onClick={sitNearby}>
        <kbd>E</kbd>
        <span>Join the {roomById(zone).name} call</span>
      </button>
    ) : null
  const room = roomById(seat.zone).name
  const desk = deskOfSeat(seat.id)
  const what = desk && desks[desk.id] === me ? 'Sit at your desk' : QUIET_ZONES.includes(seat.zone) ? `Sit · ${room} is quiet` : `Sit · join the ${room} call`
  return (
    <button className="seat-prompt" onClick={() => requestSit(seat.id)}>
      <kbd>E</kbd>
      <span>{what}</span>
    </button>
  )
}

// Rooms with a call, meeting rooms first.
const CALL_ROOMS: ZoneId[] = ROOMS.map((r) => r.id)
  .filter((z) => !QUIET_ZONES.includes(z) && SEATS.some((s) => s.zone === z))
  .sort((a, b) => Number(BOOKABLE_ZONES.includes(b)) - Number(BOOKABLE_ZONES.includes(a)))

// The backup way into any call: walk there, or drop straight into a free seat if walking is not working out.
export function MeetMenu({ onClose }: { onClose: () => void }) {
  const taken = useNet((s) => s.taken)
  const mine = useGame((s) => seatById(s.seat ?? '')?.zone)
  const online = useNet((s) => s.status === 'online')
  const inRoom = (z: ZoneId) => Object.keys(taken).filter((id) => seatById(id)?.zone === z).length + (mine === z ? 1 : 0)
  const go = (f: () => void) => {
    f()
    onClose()
  }
  return (
    <div className="meet-menu" role="dialog" aria-label="Join a call">
      <div className="meet-head">
        <b>Join a call</b>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon.close />
        </button>
      </div>
      {!online && <p className="meet-note">Calls need a connection to the guildhouse.</p>}
      <ul>
        {CALL_ROOMS.map((z) => {
          const n = inRoom(z)
          const here = mine === z
          return (
            <li key={z}>
              <div className="meet-room">
                <span>{roomById(z).name}</span>
                <i>{here ? "You're here" : n ? `${n} in call` : 'Empty'}</i>
              </div>
              {!here && (
                <>
                  <button className="meet-btn" disabled={!online} title="Walk over and take a seat" onClick={() => go(() => joinCallIn(z))}>
                    Walk
                  </button>
                  <button className="meet-btn primary" disabled={!online} title="Take a free seat straight away" onClick={() => go(() => joinNow(z))}>
                    Join now
                  </button>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

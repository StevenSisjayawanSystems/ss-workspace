import { useEffect, useState } from 'react'
import { BADGES, QUIET_ZONES, formatDuration, levelOf, roomById, seatById, titleOf, xpOf, type ZoneId } from '@guildhouse/shared'
import { useGame } from '../game'
import { joinCallIn, remotes, ringPerson, serverNow, useNet } from '../net/net'
import { useStats } from '../stats'
import { Icon } from './icons'

interface Row {
  id: string
  name: string
  level: number
  zone: ZoneId
  inCall: boolean
  // The room whose call they are seated in, if any.
  callZone?: ZoneId
  onlineSeconds: number
  streak: number
  self?: boolean
}

const inCallAt = (seat: string | null | undefined) => {
  const s = seatById(seat ?? '')
  return !!s && !QUIET_ZONES.includes(s.zone)
}

function Person({ row }: { row: Row }) {
  return (
    <li className={row.self ? 'self' : ''}>
      <div className="roster-level" title={`Level ${row.level}`}>
        {row.level}
      </div>
      <div className="roster-who">
        <b>
          {row.name}
          {row.self && <i> (you)</i>}
        </b>
        <span>
          {titleOf(row.level)} · {roomById(row.zone).name}
        </span>
      </div>
      <div className="roster-meta">
        <span title="Online this visit">{formatDuration(row.onlineSeconds)}</span>
        <span className="roster-icons">
          {row.streak > 1 && (
            <em title={`${row.streak}-day streak`}>
              <Icon.flame />
              {row.streak}
            </em>
          )}
          {row.inCall && (
            <em title="In a call">
              <Icon.phone />
            </em>
          )}
        </span>
      </div>
      {!row.self &&
        (row.callZone ? (
          <button className="icon-btn on" aria-label={`Join ${row.name}'s call`} title={`Join ${row.name}'s call in ${roomById(row.callZone).name}`} onClick={() => joinCallIn(row.callZone!)}>
            <Icon.phone />
          </button>
        ) : (
          <button className="icon-btn" aria-label={`Call ${row.name}`} title={`Call ${row.name} to join you`} onClick={() => ringPerson(row.id)}>
            <Icon.phone />
          </button>
        ))}
    </li>
  )
}

// Who is here, where, and for how long, plus your own progress.
export function Roster({ onClose }: { onClose: () => void }) {
  const ids = useNet((s) => s.ids)
  const selfJoinedAt = useNet((s) => s.selfJoinedAt)
  const profile = useGame((s) => s.profile)
  const zone = useGame((s) => s.zone)
  const seat = useGame((s) => s.seat)
  const progress = useStats((s) => s.progress)
  // Durations and other people's rooms change without any event we subscribe to.
  const [, refresh] = useState(0)
  useEffect(() => {
    const t = setInterval(() => refresh((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])

  const now = serverNow()
  const xp = xpOf(progress)
  const { level, into, span } = levelOf(xp)
  const rows: Row[] = [
    { id: 'self', name: profile?.name ?? 'You', level, zone, inCall: inCallAt(seat), onlineSeconds: selfJoinedAt ? (now - selfJoinedAt) / 1000 : 0, streak: progress.streak, self: true },
    ...ids.flatMap((id) => {
      const r = remotes.get(id)
      return r ? [{ id, name: r.name, level: r.level || 1, zone: r.zone as ZoneId, inCall: inCallAt(r.seat), callZone: inCallAt(r.seat) ? seatById(r.seat)!.zone : undefined, onlineSeconds: (now - r.joinedAt) / 1000, streak: r.streak }] : []
    }),
  ]
  const facts: [string, string][] = [
    ['Time here', formatDuration(progress.seconds)],
    ['In calls', formatDuration(progress.callSeconds)],
    ['Walked', `${Math.round(progress.metres).toLocaleString()} m`],
    ['Messages', progress.messages.toLocaleString()],
    ['Focus sessions', progress.pomodoros.toLocaleString()],
    ['Days visited', progress.days.toLocaleString()],
  ]

  return (
    <div className="roster">
      <div className="roster-head">
        <span>In the guildhouse</span>
        <button className="icon-btn small" aria-label="Close" title="Close" onClick={onClose}>
          <Icon.close />
        </button>
      </div>
      <ul className="roster-list">
        {rows.map((r) => (
          <Person key={r.id} row={r} />
        ))}
      </ul>

      <div className="roster-head">
        <span>Your journey</span>
      </div>
      <div className="journey">
        <div className="journey-rank">
          <b>Level {level}</b> {titleOf(level)}
          <span>
            {into} / {span} xp
          </span>
        </div>
        <div className="journey-bar">
          <div style={{ width: `${Math.round((into / span) * 100)}%` }} />
        </div>
        <dl>
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <ul className="badges">
          {BADGES.map((b) => {
            const earned = b.earned(progress)
            return (
              <li key={b.id} className={earned ? 'earned' : ''} title={earned ? 'Earned' : b.how}>
                <Icon.cheer />
                <div>
                  <b>{b.name}</b>
                  <span>{b.how}</span>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { BADGES, PLANT_SECONDS, QUIET_ZONES, bedOf, formatDuration, levelOf, roomById, seatById, titleOf, xpOf, type ZoneId } from '@guildhouse/shared'
import { signOut, useAccount } from '../account'
import { useGame } from '../game'
import { bedFor, joinCallIn, remotes, ringPerson, seedOf, serverNow, setStatus, useNet } from '../net/net'
import { LEVELS_EXPLAINED } from './Profile'
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
  status: string
  self?: boolean
}

const STATUSES = ['Available', 'Focusing', 'In a meeting', 'On a break', 'Away']

const inCallAt = (seat: string | null | undefined) => {
  const s = seatById(seat ?? '')
  return !!s && !QUIET_ZONES.includes(s.zone)
}

function Person({ row }: { row: Row }) {
  return (
    <li className={row.self ? 'self' : ''}>
      <button className="roster-open" title={`View ${row.self ? 'your' : `${row.name}'s`} profile`} onClick={() => useGame.setState({ profileOf: row.id })}>
        <div className="roster-level">{row.level}</div>
      </button>
      <div className="roster-who" onClick={() => useGame.setState({ profileOf: row.id })}>
        <b>
          {row.name}
          {row.self && <i> (you)</i>}
        </b>
        <span>
          {row.status || titleOf(row.level)} · {roomById(row.zone).name}
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
  const email = useAccount((s) => s.email)
  const myStatus = useGame((s) => s.status)
  const myBed = useNet((s) => bedFor(s.garden, s.me, profile?.name ?? ''))
  const myFocus = myBed?.seconds ?? 0
  const bed = bedOf(seedOf(myBed, profile?.name ?? ''), myFocus)
  const [custom, setCustom] = useState('')
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
    { id: 'self', name: profile?.name ?? 'You', level, zone, inCall: inCallAt(seat), onlineSeconds: selfJoinedAt ? (now - selfJoinedAt) / 1000 : 0, streak: progress.streak, status: myStatus, self: true },
    ...ids.flatMap((id) => {
      const r = remotes.get(id)
      return r ? [{ id, name: r.name, level: r.level || 1, zone: r.zone as ZoneId, inCall: inCallAt(r.seat), callZone: inCallAt(r.seat) ? seatById(r.seat)!.zone : undefined, onlineSeconds: (now - r.joinedAt) / 1000, streak: r.streak, status: r.status }] : []
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
      {email && (
        <div className="card-account">
          Signed in as {email}
          <button className="card-link" onClick={() => void signOut()?.then(() => location.reload())}>
            Sign out
          </button>
        </div>
      )}

      <div className="roster-head">
        <span>Your status</span>
      </div>
      <div className="status-chips">
        {STATUSES.map((s) => {
          const value = s === 'Available' ? '' : s
          return (
            <button key={s} className={myStatus === value ? 'on' : ''} onClick={() => setStatus(value)}>
              {s}
            </button>
          )
        })}
      </div>
      <form
        className="status-custom"
        onSubmit={(e) => {
          e.preventDefault()
          if (custom.trim()) setStatus(custom)
          setCustom('')
        }}
      >
        <input value={custom} maxLength={40} placeholder={STATUSES.includes(myStatus) || !myStatus ? 'Or write your own…' : myStatus} onChange={(e) => setCustom(e.target.value)} />
      </form>

      <div className="roster-head">
        <span>Your garden</span>
      </div>
      <div className="journey">
        <div className="journey-rank">
          <b>{bed.grown}</b> {bed.grown === 1 ? 'plant grown' : 'plants grown'}
          <span>
            {formatDuration(bed.towardsNext)} / 24h
          </span>
        </div>
        <div className="journey-bar">
          <div style={{ width: `${Math.max(1, Math.round((bed.towardsNext / PLANT_SECONDS) * 100))}%` }} />
        </div>
        <p className="profile-note">Every 24 hours of shared focus sessions grows a plant in your bed in the Focus Garden, out the front door.</p>
      </div>

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
        <p className="profile-note">{LEVELS_EXPLAINED}</p>
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

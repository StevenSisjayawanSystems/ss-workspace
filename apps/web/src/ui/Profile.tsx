import { useEffect, useState } from 'react'
import { QUIET_ZONES, formatDuration, levelOf, roomById, seatById, titleOf, xpOf, type ZoneId } from '@guildhouse/shared'
import { useGame } from '../game'
import { joinCallIn, remotes, ringPerson, serverNow, useNet } from '../net/net'
import { standing, useStats } from '../stats'
import { Icon } from './icons'

// What a level is, in one breath. Shown wherever levels appear, since the number alone explains nothing.
export const LEVELS_EXPLAINED =
  'Levels are a tally of time and taking part: being here, calls, finished focus sessions, messages, songs, and coming back day after day. They are for fun and unlock nothing.'

// A person's card: who they are, what they are doing, and how to reach them.
export function Profile() {
  const id = useGame((s) => s.profileOf)
  const ids = useNet((s) => s.ids)
  const selfJoinedAt = useNet((s) => s.selfJoinedAt)
  const me = useGame((s) => s.profile)
  const myZone = useGame((s) => s.zone)
  const mySeat = useGame((s) => s.seat)
  const myStatus = useGame((s) => s.status)
  const progress = useStats((s) => s.progress)
  const [, refresh] = useState(0)
  const close = () => useGame.setState({ profileOf: null })

  useEffect(() => {
    if (!id) return
    const t = setInterval(() => refresh((n) => n + 1), 5000)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', key)
    return () => {
      clearInterval(t)
      window.removeEventListener('keydown', key)
    }
  }, [id])

  if (!id) return null
  const self = id === 'self'
  const r = self ? undefined : remotes.get(id)
  // They left while the card was open.
  if (!self && (!r || !ids.includes(id))) return null

  const s = self ? standing(progress) : r!
  const level = self ? levelOf(xpOf(progress)).level : r!.level || 1
  const name = self ? (me?.name ?? 'You') : r!.name
  const zone = (self ? myZone : r!.zone) as ZoneId
  const seat = seatById((self ? mySeat : r!.seat) ?? '')
  const callZone = seat && !QUIET_ZONES.includes(seat.zone) ? seat.zone : undefined
  const status = self ? myStatus : r!.status
  const joinedAt = self ? selfJoinedAt : r!.joinedAt
  const facts: [string, string][] = [
    ['Online now', formatDuration(joinedAt ? (serverNow() - joinedAt) / 1000 : 0)],
    ['Time here', formatDuration(s.totalSeconds)],
    ['In calls', formatDuration(s.callSeconds)],
    ['Focus sessions', s.pomodoros.toLocaleString()],
    ['Messages', s.messages.toLocaleString()],
    ['Days visited', s.days.toLocaleString()],
  ]

  return (
    <div className="profile" role="dialog" aria-label={`${name}'s profile`}>
      <button className="icon-btn small" aria-label="Close" title="Close" onClick={close}>
        <Icon.close />
      </button>
      <div className="profile-top">
        <div className="profile-initial">{name.slice(0, 1).toUpperCase()}</div>
        <div>
          <b>{name}</b>
          <span>{status || (callZone ? 'In a call' : 'Around')}</span>
        </div>
      </div>
      <div className="profile-where">
        {roomById(zone).name}
        {callZone ? ' · in a call' : seat ? ' · seated' : ''}
        {s.streak > 1 && (
          <em title={`${s.streak}-day streak`}>
            <Icon.flame />
            {s.streak} days running
          </em>
        )}
      </div>
      <div className="profile-rank" title={LEVELS_EXPLAINED}>
        <b>Level {level}</b> {titleOf(level)}
      </div>
      <dl>
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="profile-note">{LEVELS_EXPLAINED}</p>
      {!self &&
        (callZone ? (
          <button
            className="profile-action"
            onClick={() => {
              joinCallIn(callZone)
              close()
            }}
          >
            <Icon.phone />
            Join their call in {roomById(callZone).name}
          </button>
        ) : (
          <button
            className="profile-action"
            onClick={() => {
              ringPerson(id)
              close()
            }}
          >
            <Icon.phone />
            Call {name} over
          </button>
        ))}
    </div>
  )
}

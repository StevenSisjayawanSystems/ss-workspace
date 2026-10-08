import { roomById } from '@guildhouse/shared'
import { answerRing, useNet } from '../net/net'
import { Icon } from './icons'

// Someone is calling you over. Accepting walks you to a free seat in their room and joins the call.
export function Ring() {
  const ring = useNet((s) => s.ringing)
  if (!ring) return null
  return (
    <div className="ring" role="alertdialog" aria-label={`${ring.name} is calling`}>
      <div className="ring-pulse">
        <Icon.phone />
      </div>
      <div className="ring-text">
        <b>{ring.name} is calling</b>
        <span>Join them in {roomById(ring.zone).name}</span>
      </div>
      <button className="ring-btn accept" onClick={() => answerRing(true)}>
        <Icon.phone />
        Join
      </button>
      <button className="ring-btn" onClick={() => answerRing(false)}>
        <Icon.close />
        Not now
      </button>
    </div>
  )
}

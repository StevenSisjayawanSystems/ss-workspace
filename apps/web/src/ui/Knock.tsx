import { roomById } from '@guildhouse/shared'
import { answerKnock, useNet } from '../net/net'
import { Icon } from './icons'

// Someone is at the closed door of the room you are in.
export function Knock() {
  const knock = useNet((s) => s.knock)
  if (!knock) return null
  return (
    <div className="ring" role="alertdialog" aria-label={`${knock.name} is knocking`}>
      <div className="ring-pulse">
        <Icon.door />
      </div>
      <div className="ring-text">
        <b>{knock.name} is knocking</b>
        <span>at {roomById(knock.zone).name}</span>
      </div>
      <button className="ring-btn accept" onClick={() => answerKnock(true)}>
        <Icon.door />
        Let in
      </button>
      <button className="ring-btn" onClick={() => answerKnock(false)}>
        <Icon.close />
        Not now
      </button>
    </div>
  )
}

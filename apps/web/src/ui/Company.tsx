import { answerInvite, everyone, namesOf, useNet } from '../net/net'
import { Icon } from './icons'

// Who is in on your timer or your music, and who else may come: anyone who likes, or only the
// people you add. Everyone else who is here is one press away from being added.
export function Company({ members, open, onOpen, onBring }: { members: string[]; open: boolean; onOpen: (open: boolean) => void; onBring: (member: string) => void }) {
  const me = useNet((s) => s.me)
  useNet((s) => s.ids)
  const others = namesOf(members.filter((k) => k !== me))
  const free = everyone().filter((p) => p.here && !members.includes(p.id))
  return (
    <div className="company">
      <div className="company-head">
        <span>Who is in</span>
        <button className={open ? 'on' : ''} aria-pressed={open} title={open ? 'Anyone here can join. Click to keep it to people you add' : 'Only people you add can join. Click to open it to anyone'} onClick={() => onOpen(!open)}>
          <Icon.people />
          {open ? 'Open to join' : 'Added only'}
        </button>
      </div>
      <ul>
        <li>You</li>
        {others.map((name) => (
          <li key={name}>{name}</li>
        ))}
        {free.map((p) => (
          <li key={p.id}>
            <button title={`Add ${p.name}`} onClick={() => onBring(p.id)}>
              <Icon.plus />
              {p.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Someone has asked you into their timer or their music. Saying yes leaves whichever you were in.
export function Invites() {
  const invite = useNet((s) => s.invites[0])
  if (!invite) return null
  const timer = invite.what === 'timer'
  return (
    <div className="ring" role="alertdialog" aria-label={`${invite.name} invited you`}>
      <div className="ring-pulse">{timer ? <Icon.timer /> : <Icon.note />}</div>
      <div className="ring-text">
        <b>{invite.name} invited you</b>
        <span>{timer ? 'Join their timer and focus together' : 'Listen to their music with them'}</span>
      </div>
      <button className="ring-btn accept" onClick={() => answerInvite(true)}>
        <Icon.check />
        Join
      </button>
      <button className="ring-btn" onClick={() => answerInvite(false)}>
        <Icon.close />
        Not now
      </button>
    </div>
  )
}

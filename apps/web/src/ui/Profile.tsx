import { useEffect, useState, type FormEvent } from 'react'
import { BADGES, PLANT_SECONDS, QUIET_ZONES, bedOf, bondPoints, bondTier, formatDuration, levelOf, roomById, seatById, speciesFor, titleOf, xpOf, type BondWith, type Progress, type ZoneId } from '@guildhouse/shared'
import { useGame } from '../game'
import { HAIRS, ROBES } from '../look'
import { askBonds, friends, joinCallIn, openTalk, remotes, ringPerson, saveCard, serverNow, useNet } from '../net/net'
import { useStats } from '../stats'
import { when } from '../time'
import { Icon } from './icons'
import { Swatches } from './Join'
import { PlantIcon } from './PlantIcon'
import { Portrait } from './Portrait'
import { RichText } from './RichText'

// What a level is, in one breath. Shown wherever levels appear, since the number alone explains nothing.
export const LEVELS_EXPLAINED =
  'Levels are a tally of time and taking part: being here, calls, finished focus sessions, messages, songs, and coming back day after day. They are for fun and unlock nothing.'

const MAX_ABOUT = 160

// Changing your own name, look and introduction.
function Edit({ about, onDone }: { about: string; onDone: () => void }) {
  const [profile, setProfile] = useState(() => useGame.getState().profile!)
  const [words, setWords] = useState(about)
  const setLook = (patch: Partial<typeof profile.look>) => setProfile((p) => ({ ...p, look: { ...p.look, ...patch } }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!profile.name.trim()) return
    saveCard({ ...profile, name: profile.name.trim() }, words.trim())
    onDone()
  }
  return (
    <form className="profile-edit" onSubmit={submit}>
      <div className="profile-edit-look">
        <Portrait look={profile.look} />
        <div>
          <label className="field">
            <span>Name</span>
            <input autoFocus maxLength={20} value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
          </label>
          <Swatches label="Cloak" colors={ROBES} value={profile.look.robe} onPick={(robe) => setLook({ robe })} />
          <Swatches label="Hair" colors={HAIRS} value={profile.look.hair} onPick={(hair) => setLook({ hair })} />
          <label className="field check">
            <input type="checkbox" checked={profile.look.hat} onChange={(e) => setLook({ hat: e.target.checked })} />
            <span>Wizard's hat</span>
          </label>
        </div>
      </div>
      <label className="field">
        <span>About you</span>
        <textarea rows={3} maxLength={MAX_ABOUT} value={words} placeholder="What you do, what you are into, when you are usually around…" onChange={(e) => setWords(e.target.value)} />
      </label>
      <div className="profile-actions">
        <button type="button" className="profile-action quiet" onClick={onDone}>
          Cancel
        </button>
        <button className="profile-action" disabled={!profile.name.trim()}>
          Save
        </button>
      </div>
    </form>
  )
}

const TABS = ['About', 'Stats', 'Relationships', 'Plants', 'Accolades'] as const
type Tab = (typeof TABS)[number]

// What two people have done together, in a line.
const together = (b: BondWith) =>
  [b.callSeconds >= 60 && `${formatDuration(b.callSeconds)} in calls`, b.focusSeconds >= 60 && `${formatDuration(b.focusSeconds)} focusing`, b.messages > 0 && `${b.messages} ${b.messages === 1 ? 'message' : 'messages'}`].filter(Boolean).join(' · ') || 'Nothing shared yet'

// One bond in a list: who with, what kind, and what it is made of.
function BondRow({ bond, children }: { bond: BondWith; children?: React.ReactNode }) {
  const ids = useNet((s) => s.ids)
  const session = ids.find((id) => remotes.get(id)?.member === bond.id)
  const tier = bondTier(bondPoints(bond))
  return (
    <li>
      <i className={session ? 'here' : ''} title={session ? 'Here now' : 'Away'} />
      <div>
        {session ? (
          <button className="profile-link" onClick={() => useGame.setState({ profileOf: session })}>
            {bond.name}
          </button>
        ) : (
          <b>{bond.name}</b>
        )}
        <span>
          {tier.name} · {together(bond)}
        </span>
      </div>
      {children}
    </li>
  )
}

// Someone's full profile, in tabs: who they are, what they have done here, who they are close to,
// what they have grown, and what they have earned.
export function Profile() {
  const id = useGame((s) => s.profileOf)
  const ids = useNet((s) => s.ids)
  const selfJoinedAt = useNet((s) => s.selfJoinedAt)
  const me = useGame((s) => s.profile)
  const myKey = useNet((s) => s.me)
  const myZone = useGame((s) => s.zone)
  const mySeat = useGame((s) => s.seat)
  const myStatus = useGame((s) => s.status)
  const mySince = useNet((s) => s.since)
  const myAbout = useNet((s) => s.about)
  const myProgress = useStats((s) => s.progress)
  const garden = useNet((s) => s.garden)
  const desks = useNet((s) => s.desks)
  const notes = useNet((s) => s.notes)
  const allBonds = useNet((s) => s.bonds)
  const online = useNet((s) => s.status === 'online')
  const [tab, setTab] = useState<Tab>('About')
  const [editing, setEditing] = useState(false)
  const [, refresh] = useState(0)
  const close = () => useGame.setState({ profileOf: null })
  const key = id === 'self' ? myKey : id ? (remotes.get(id)?.member ?? '') : ''

  useEffect(() => {
    setEditing(false)
    setTab('About')
    if (!id) return
    const t = setInterval(() => refresh((n) => n + 1), 5000)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', esc)
    return () => {
      clearInterval(t)
      window.removeEventListener('keydown', esc)
    }
  }, [id])

  // Bonds are fetched when the tab is opened, and again whenever our own change, which is what
  // happens when a friend request is made or answered.
  useEffect(() => {
    if (key && tab === 'Relationships') askBonds(key)
  }, [key, tab, allBonds[myKey]])

  if (!id) return null
  const self = id === 'self'
  const r = self ? undefined : remotes.get(id)
  // They left while their profile was open.
  if (!self && (!r || !ids.includes(id))) return null
  if (self && !me) return null

  const name = self ? me!.name : r!.name
  const look = self ? me!.look : r!.look
  // The counters behind a level, whoever they belong to.
  const p: Progress = self ? myProgress : { seconds: r!.totalSeconds, callSeconds: r!.callSeconds, metres: r!.metres, messages: r!.messages, songs: r!.songs, pomodoros: r!.pomodoros, days: r!.days, streak: r!.streak, lastDay: '' }
  const { level, into, span } = levelOf(xpOf(p))
  const zone = (self ? myZone : r!.zone) as ZoneId
  const seat = seatById((self ? mySeat : r!.seat) ?? '')
  const callZone = seat && !QUIET_ZONES.includes(seat.zone) ? seat.zone : undefined
  const status = self ? myStatus : r!.status
  const joinedAt = self ? selfJoinedAt : r!.joinedAt
  const since = self ? mySince : r!.since
  const about = self ? myAbout : r!.about
  const focus = garden.find((g) => g.name === name)?.seconds ?? 0
  const bed = bedOf(name, focus)
  const hasDesk = Object.values(desks).includes(name)
  const pinned = notes.filter((n) => n.author === name).slice(-3).reverse()
  const earned = BADGES.filter((b) => b.earned(p))
  const facts: [string, string][] = [
    ['Online now', formatDuration(joinedAt ? (serverNow() - joinedAt) / 1000 : 0)],
    ['Time here', formatDuration(p.seconds)],
    ['In calls', formatDuration(p.callSeconds)],
    ['Focus sessions', p.pomodoros.toLocaleString()],
    ['Messages', p.messages.toLocaleString()],
    ['Songs queued', p.songs.toLocaleString()],
    ['Walked', `${Math.round(p.metres).toLocaleString()} m`],
    ['Days visited', p.days.toLocaleString()],
    ['Current streak', `${p.streak} ${p.streak === 1 ? 'day' : 'days'}`],
  ]

  // Their bonds, strongest first; and the one between them and us, which our own list always has fresh.
  const bonds = [...(allBonds[key] ?? [])].sort((a, b) => bondPoints(b) - bondPoints(a))
  const ours = self ? undefined : allBonds[myKey]?.find((b) => b.id === key)
  const ourTier = bondTier(ours ? bondPoints(ours) : 0)
  const asking = self ? bonds.filter((b) => b.askedBy === b.id) : []
  const theirFriends = bonds.filter((b) => b.friends)
  const others = bonds.filter((b) => !b.friends && !asking.includes(b) && b.id !== myKey && bondPoints(b) > 0)

  return (
    <div className="profile-scrim" onClick={close}>
      <div className="profile" role="dialog" aria-modal="true" aria-label={`${name}'s profile`} onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn small" aria-label="Close" title="Close" onClick={close}>
          <Icon.close />
        </button>
        {editing ? (
          <Edit about={about} onDone={() => setEditing(false)} />
        ) : (
          <>
            <header className="profile-top">
              <Portrait look={look} />
              <div>
                <h2>{name}</h2>
                <div className="profile-rank" title={LEVELS_EXPLAINED}>
                  Level {level} · {titleOf(level)}
                  {ours?.friends && <em>Friend</em>}
                </div>
                <div className="profile-now">
                  <i className={['Focusing', 'In a meeting', 'Away'].includes(status) ? 'busy' : ''} />
                  {status || (callZone ? 'In a call' : 'Around')} · {roomById(zone).name}
                  {callZone ? ', in a call' : seat ? ', seated' : ''}
                </div>
              </div>
            </header>

            <div className="profile-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
                  {t}
                  {t === 'Relationships' && self && (allBonds[myKey] ?? []).some((b) => b.askedBy === b.id) && <i />}
                </button>
              ))}
            </div>

            <div className="profile-body" role="tabpanel">
              {tab === 'About' && (
                <>
                  <p className={about ? 'profile-about' : 'profile-about none'}>{about || (self ? 'Tell people a little about yourself: use Edit profile below.' : `${name} has not written an introduction yet.`)}</p>
                  <ul className="profile-around">
                    {since > 0 && <li>Member since {new Date(since).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</li>}
                    <li>Online for {formatDuration(joinedAt ? (serverNow() - joinedAt) / 1000 : 0)} this visit</li>
                    <li>{hasDesk ? 'Has a desk of their own in the workroom' : 'No desk claimed in the workroom'}</li>
                    {p.streak > 1 && <li>{p.streak} days running</li>}
                  </ul>
                  {pinned.length > 0 && (
                    <>
                      <h3>Latest on the board</h3>
                      <ul className="profile-notes">
                        {pinned.map((n) => (
                          <li key={n.id} style={{ background: n.color }}>
                            <RichText text={n.text} />
                            <small>{when(n.at)}</small>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}

              {tab === 'Stats' && (
                <>
                  <h3>
                    Level {level} <span>{into} / {span} xp to level {level + 1}</span>
                  </h3>
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
                  <p className="profile-note">{LEVELS_EXPLAINED}</p>
                </>
              )}

              {tab === 'Relationships' && (
                <>
                  {!self && (
                    <div className="profile-bond">
                      <h3>
                        You and {name} <span>{ourTier.name}</span>
                      </h3>
                      {ourTier.span > 0 && (
                        <div className="journey-bar">
                          <div style={{ width: `${Math.round((ourTier.into / ourTier.span) * 100)}%` }} />
                        </div>
                      )}
                      <p>{ours ? together(ours) : 'Nothing shared yet'}. Bonds grow from calls and focus sessions together, and from messages and mentions.</p>
                      <div className="profile-friend">
                        {ours?.friends ? (
                          <>
                            <span>You are friends</span>
                            <button onClick={() => friends.remove(key)}>Unfriend</button>
                          </>
                        ) : ours?.askedBy === key ? (
                          <>
                            <span>{name} asked to be friends</span>
                            <button className="on" onClick={() => friends.add(key)}>
                              Accept
                            </button>
                            <button onClick={() => friends.remove(key)}>Decline</button>
                          </>
                        ) : ours?.askedBy === myKey ? (
                          <>
                            <span>Friend request sent</span>
                            <button onClick={() => friends.remove(key)}>Take it back</button>
                          </>
                        ) : (
                          <button className="on" disabled={!online} onClick={() => friends.add(key)}>
                            Add friend
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {asking.length > 0 && (
                    <>
                      <h3>Friend requests</h3>
                      <ul className="profile-bonds">
                        {asking.map((b) => (
                          <BondRow key={b.id} bond={b}>
                            <button className="on" onClick={() => friends.add(b.id)}>
                              Accept
                            </button>
                            <button onClick={() => friends.remove(b.id)}>Decline</button>
                          </BondRow>
                        ))}
                      </ul>
                    </>
                  )}
                  <h3>
                    Friends <span>{theirFriends.length}</span>
                  </h3>
                  {theirFriends.length === 0 && <p className="profile-note">{self ? 'No friends added yet. Open someone’s profile and choose Add friend.' : `${name} has not added any friends yet.`}</p>}
                  <ul className="profile-bonds">
                    {theirFriends.map((b) => (
                      <BondRow key={b.id} bond={b} />
                    ))}
                  </ul>
                  {others.length > 0 && (
                    <>
                      <h3>Others {self ? 'you' : 'they'} spend time with</h3>
                      <ul className="profile-bonds">
                        {others.map((b) => (
                          <BondRow key={b.id} bond={b} />
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}

              {tab === 'Plants' && (
                <>
                  <h3>
                    Focus Garden <span>{bed.grown} grown · {formatDuration(focus)} of shared focus</span>
                  </h3>
                  <ul className="profile-plants">
                    {Array.from({ length: bed.grown + 1 }, (_, n) => {
                      const species = speciesFor(name, n)
                      const growing = n === bed.grown
                      return (
                        <li key={n} className={growing ? 'growing' : ''}>
                          <PlantIcon species={species} />
                          <b>{species}</b>
                          <span>{growing ? `${Math.floor((bed.towardsNext / PLANT_SECONDS) * 100)}% grown` : 'Full grown'}</span>
                        </li>
                      )
                    }).reverse()}
                  </ul>
                  <p className="profile-note">Every 24 hours of shared focus sessions grows a plant in their bed in the Focus Garden, out the front door.</p>
                </>
              )}

              {tab === 'Accolades' && (
                <>
                  <h3>
                    Title <span>Level {level}</span>
                  </h3>
                  <p className="profile-title">{titleOf(level)}</p>
                  <h3>
                    Badges <span>{earned.length} of {BADGES.length}</span>
                  </h3>
                  <ul className="profile-badges">
                    {BADGES.map((b) => (
                      <li key={b.id} className={b.earned(p) ? 'on' : ''}>
                        <b>{b.name}</b>
                        <span>{b.how}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="profile-actions">
              {self ? (
                <button className="profile-action" disabled={!online} onClick={() => setEditing(true)}>
                  Edit profile
                </button>
              ) : (
                <>
                  <button
                    className="profile-action quiet"
                    onClick={() => {
                      openTalk(r!.member)
                      close()
                    }}
                  >
                    <Icon.message />
                    Message
                  </button>
                  <button
                    className="profile-action"
                    onClick={() => {
                      if (callZone) joinCallIn(callZone)
                      else ringPerson(id)
                      close()
                    }}
                  >
                    <Icon.phone />
                    {callZone ? `Join their call in ${roomById(callZone).name}` : `Call ${name} over`}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

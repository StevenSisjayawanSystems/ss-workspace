import { useState, type FormEvent } from 'react'
import { loadProfile, useGame } from '../game'
import { loadInvite, rememberInvite } from '../invite'
import { HAIRS, ROBES } from '../look'
import { connect, useNet } from '../net/net'

function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="swatches">
        {colors.map((c) => (
          <button key={c} type="button" aria-label={`${label} ${c}`} className={c === value ? 'on' : ''} style={{ background: c }} onClick={() => onPick(c)} />
        ))}
      </div>
    </div>
  )
}

export function Join() {
  const enter = useGame((s) => s.enter)
  const [profile, setProfile] = useState(loadProfile)
  const [code, setCode] = useState(loadInvite)
  // The invite field stays out of the way unless this guildhouse turns out to need one.
  const [needsCode, setNeedsCode] = useState(() => useNet.getState().inviteNeeded)
  const [refused, setRefused] = useState(false)
  const [busy, setBusy] = useState(false)
  const setLook = (patch: Partial<typeof profile.look>) => setProfile((p) => ({ ...p, look: { ...p.look, ...patch } }))
  const name = profile.name.trim()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name || busy) return
    setBusy(true)
    const entering = { ...profile, name }
    const result = await connect(entering, code.trim())
    setBusy(false)
    if (result === 'invite') {
      setRefused(needsCode || !!code.trim())
      setNeedsCode(true)
      return
    }
    if (result === 'online') {
      rememberInvite(code.trim())
      useNet.setState({ inviteNeeded: false })
    }
    // If the server cannot be reached you still get in, alone, and it keeps trying in the background.
    enter(entering)
  }

  return (
    <div className="join">
      <header className="logo">
        <div className="logo-the">The</div>
        <h1>
          <b>G</b>uild<b>h</b>ouse
        </h1>
        <div className="logo-bar">A workplace in another world</div>
      </header>
      <form className="card" onSubmit={submit}>
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
        {needsCode && (
          <label className="field">
            <span>Invite code</span>
            <input
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setRefused(false)
              }}
            />
            <div className="field-note">{refused ? 'That code was not accepted.' : 'This guildhouse is invite-only. Ask a member for the code.'}</div>
          </label>
        )}
        <button className="primary" disabled={!name || busy || (needsCode && !code.trim())}>
          {busy ? 'Entering' : 'Enter'}
        </button>
      </form>
    </div>
  )
}

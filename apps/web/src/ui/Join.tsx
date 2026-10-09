import { useEffect, useState, type FormEvent } from 'react'
import { accounts, savedProfile, signIn, signOut, signUp, useAccount } from '../account'
import { loadProfile, useGame } from '../game'
import { loadInvite, rememberInvite } from '../invite'
import { HAIRS, ROBES } from '../look'
import { connect, useNet } from '../net/net'

// Matches minimum_password_length in supabase/config.toml.
const MIN_PASSWORD = 6

export function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (c: string) => void }) {
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

// Signing in with an email and password, or making an account with them.
function SignIn({ again }: { again: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const address = email.trim()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setProblem(await (creating ? signUp : signIn)(address, password))
    setBusy(false)
  }

  return (
    <form className="card" onSubmit={submit}>
      <label className="field">
        <span>Email</span>
        <input autoFocus inputMode="email" autoComplete="email" autoCapitalize="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" autoComplete={creating ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className={problem ? 'field-note' : 'field-note calm'}>{problem ?? (again ? 'Please sign in again to carry on.' : creating ? `At least ${MIN_PASSWORD} characters. Your progress will follow you to any device.` : 'Sign in to pick up where you left off.')}</div>
      </label>
      <button className="primary" disabled={busy || !/^\S+@\S+\.\S+$/.test(address) || password.length < (creating ? MIN_PASSWORD : 1)}>
        {creating ? (busy ? 'Creating' : 'Create account') : busy ? 'Signing in' : 'Sign in'}
      </button>
      <button
        type="button"
        className="card-link"
        onClick={() => {
          setCreating(!creating)
          setProblem(null)
        }}
      >
        {creating ? 'I already have an account' : 'New here? Create an account'}
      </button>
    </form>
  )
}

export function Join() {
  const enter = useGame((s) => s.enter)
  const ready = useAccount((s) => s.ready)
  const email = useAccount((s) => s.email)
  const [again, setAgain] = useState(() => useNet.getState().loginNeeded)
  // Set when the server wants sign-in and this copy of the app was built without it.
  const [unable, setUnable] = useState(false)
  const [profile, setProfile] = useState(loadProfile)
  const [code, setCode] = useState(loadInvite)
  // The invite field stays out of the way unless this guildhouse turns out to need one.
  const [needsCode, setNeedsCode] = useState(() => useNet.getState().inviteNeeded)
  const [refused, setRefused] = useState(false)
  const [busy, setBusy] = useState(false)
  const setLook = (patch: Partial<typeof profile.look>) => setProfile((p) => ({ ...p, look: { ...p.look, ...patch } }))
  const name = profile.name.trim()

  // Whether we have looked for a character already made on this account.
  const [looked, setLooked] = useState(!accounts)

  // A character is made once and belongs to the account. Whoever already has one walks straight in,
  // on any device; this form is only for a first visit.
  useEffect(() => {
    if (!accounts) return
    setLooked(false)
    if (!email) return
    let stale = false
    void savedProfile().then(async (saved) => {
      if (stale) return
      if (saved) {
        setProfile(saved)
        await go(saved)
      }
      if (!stale) setLooked(true)
    })
    return () => {
      stale = true
    }
  }, [email])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name && !busy) void go({ ...profile, name })
  }

  const go = async (entering: typeof profile) => {
    setBusy(true)
    const result = await connect(entering, code.trim())
    setBusy(false)
    if (result === 'invite') {
      setRefused(needsCode || !!code.trim())
      setNeedsCode(true)
      return
    }
    if (result === 'login') {
      // Our sign-in was not taken: start it over, if this app can.
      setAgain(true)
      setUnable(!accounts)
      void signOut()
      return
    }
    if (result === 'online') {
      rememberInvite(code.trim())
      useNet.setState({ inviteNeeded: false, loginNeeded: false })
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
      {!ready ? null : accounts && !email ? (
        <SignIn again={again} />
      ) : !looked ? (
        <div className="card card-wait">Opening the door</div>
      ) : (
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
          {unable && <div className="field-note">This guildhouse asks people to sign in, and this copy of the app is not set up for it.</div>}
          {email && (
            <div className="card-account">
              Signed in as {email}
              <button type="button" className="card-link" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}

import { useState, type FormEvent } from 'react'
import { loadProfile, useGame } from '../game'
import { HAIRS, ROBES } from '../look'

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
  const setLook = (patch: Partial<typeof profile.look>) => setProfile((p) => ({ ...p, look: { ...p.look, ...patch } }))
  const name = profile.name.trim()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name) enter({ ...profile, name })
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
        <button className="primary" disabled={!name}>
          Enter
        </button>
      </form>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { GRID_H, GRID_W, ROOMS, roomById } from '@guildhouse/shared'
import { player, useGame } from '../game'
import { remotes, useNet } from '../net/net'
import { clockText, localHour, skyAt } from '../time'
import { useStats } from '../stats'
import { Icon } from './icons'
import { Roster } from './Roster'

function MiniMap() {
  const dot = useRef<SVGCircleElement>(null)
  const zone = useGame((s) => s.zone)
  const walkTo = useGame((s) => s.walkTo)
  const others = useRef(new Map<string, SVGCircleElement>())
  const ids = useNet((s) => s.ids)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      dot.current?.setAttribute('cx', String(player.x))
      dot.current?.setAttribute('cy', String(player.z))
      for (const [id, el] of others.current) {
        const r = remotes.get(id)
        if (!r) continue
        el.setAttribute('cx', String(r.x))
        el.setAttribute('cy', String(r.z))
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <svg className="minimap" viewBox={`-0.5 -0.5 ${GRID_W} ${GRID_H}`} aria-label="Office map">
      {ROOMS.map((r) => (
        <rect
          key={r.id}
          className={`${r.id === zone ? 'here' : ''} ${r.outdoor ? 'outdoor' : ''}`}
          x={r.x0 - 0.5}
          y={r.z0 - 0.5}
          width={r.x1 - r.x0 + 1}
          height={r.z1 - r.z0 + 1}
          rx={0.6}
          onClick={() => walkTo((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2)}
        >
          <title>{r.name}</title>
        </rect>
      ))}
      {ids.map((id) => (
        <circle
          key={id}
          r={0.65}
          className="them"
          ref={(el) => {
            if (el) others.current.set(id, el)
            else others.current.delete(id)
          }}
        />
      ))}
      <circle ref={dot} r={0.8} className="me" />
    </svg>
  )
}

// Local time, in the viewer's own zone, with a sun or moon to match the sky outside.
function Clock() {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])
  const { time, zone } = clockText()
  return (
    <div className="clock" title="Your local time">
      {skyAt(localHour()).night > 0.5 ? <Icon.moon /> : <Icon.sun />}
      <span>{time}</span>
      <i>{zone}</i>
    </div>
  )
}

export function Hud() {
  const zone = useGame((s) => s.zone)
  const room = roomById(zone)
  const status = useNet((s) => s.status)
  const count = useNet((s) => s.ids.length)
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
  const [roster, setRoster] = useState(false)
  const toast = useStats((s) => s.toast)
  return (
    <div className="hud">
      <div className="banner" key={zone}>
        <div className="banner-name">{room.name}</div>
        <div className="banner-blurb">{room.blurb}</div>
      </div>
      <button className={`status ${status}`} title="Who is here, and your progress" onClick={() => setRoster(!roster)}>
        {status === 'online' ? `${count + 1} in the guildhouse` : status === 'connecting' ? 'Connecting…' : 'Offline, exploring solo'}
      </button>
      {roster && <Roster onClose={() => setRoster(false)} />}
      {toast && (
        <div className="toast" key={toast.title}>
          <Icon.cheer />
          <div>
            <b>{toast.title}</b>
            <span>{toast.detail}</span>
          </div>
        </div>
      )}
      <Clock />
      <MiniMap />
      <div className="hint">{touch ? 'Tap to walk · pinch to zoom' : 'Click to walk · WASD to move · scroll to zoom'}</div>
    </div>
  )
}

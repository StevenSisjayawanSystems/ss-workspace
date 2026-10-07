import { useRef, useState, type PointerEvent } from 'react'
import { input } from '../game'

const RADIUS = 46

// Thumb stick for touch screens. Writes a screen-space vector into `input`.
export function Joystick() {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const update = (e: PointerEvent) => {
    const r = base.current!.getBoundingClientRect()
    let x = e.clientX - (r.left + r.width / 2)
    let y = e.clientY - (r.top + r.height / 2)
    const len = Math.hypot(x, y)
    if (len > RADIUS) {
      x = (x / len) * RADIUS
      y = (y / len) * RADIUS
    }
    setKnob({ x, y })
    input.jx = x / RADIUS
    input.jy = -y / RADIUS
  }
  const release = () => {
    setKnob({ x: 0, y: 0 })
    input.jx = input.jy = 0
  }

  return (
    <div
      ref={base}
      className="joystick"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        update(e)
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && update(e)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}

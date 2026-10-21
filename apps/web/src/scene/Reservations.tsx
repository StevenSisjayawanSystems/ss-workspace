import { useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { BOOKABLE_ZONES, DESKS, DOORS, roomById, zoneAt, type Desk, type ZoneId } from '@guildhouse/shared'
import { useGame } from '../game'
import { requestSit, serverNow, useNet } from '../net/net'
import { clockTime } from '../ui/Schedule'
import { Label } from './Label'
import { PAL, glow, toon } from './toon'

const point = (on: boolean) => {
  document.body.style.cursor = on ? 'pointer' : ''
}

// A workroom desk: clicking it sits you in its chair (claiming and giving up happen from the seat prompt).
// A claimed desk shows whose it is.
function DeskSpot({ desk }: { desk: Desk }) {
  const owner = useNet((s) => s.desks[desk.id])
  const me = useGame((s) => s.profile?.name)
  const [hover, setHover] = useState(false)
  const mine = !!owner && owner === me

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHover(true)
    point(!owner || mine)
  }
  const out = () => {
    setHover(false)
    point(false)
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > 8) return
    if (!owner || mine) requestSit(desk.seatId)
  }
  const text = hover ? (mine ? 'Your desk · click to sit' : owner ? `${owner}'s desk` : 'Free desk · click to sit') : owner ? (mine ? 'Your desk' : `${owner}'s desk`) : null

  return (
    <group position={[desk.x, 0, desk.z]}>
      <mesh position={[0, 0.72, 0]} visible={false} onPointerOver={over} onPointerOut={out} onClick={click}>
        <boxGeometry args={[1.8, 0.7, 0.82]} />
      </mesh>
      {/* a small brass plate on the claimed desk */}
      {owner && (
        <mesh position={[0.68, 0.685, 0.28]} material={toon(PAL.brass)}>
          <boxGeometry args={[0.3, 0.04, 0.12]} />
        </mesh>
      )}
      {text && <Label text={text} y={1.2} />}
    </group>
  )
}

export function Desks() {
  return (
    <>
      {DESKS.map((d) => (
        <DeskSpot key={d.id} desk={d} />
      ))}
    </>
  )
}

// The schedule plate beside a council chamber door: green when free, red when booked or the door is closed.
function Sign({ x, z, zone }: { x: number; z: number; zone: ZoneId }) {
  const bookings = useNet((s) => s.bookings)
  const closedBy = useNet((s) => s.closed[zone])
  const [hover, setHover] = useState(false)
  const now = serverNow()
  const current = bookings.find((b) => b.zone === zone && b.start <= now && now < b.until)
  const next = bookings.find((b) => b.zone === zone && b.start > now)
  const busy = !!current || !!closedBy
  const room = roomById(zone).name
  const text = closedBy
    ? `${room} · door closed, knock to enter`
    : current
      ? `${room} · booked by ${current.by} until ${clockTime(current.until)}`
      : next
        ? `${room} · free until ${clockTime(next.start)}`
        : `${room} · free · click for the schedule`

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.68, 0]} material={toon(PAL.woodDark)}>
        <boxGeometry args={[0.62, 0.5, 0.05]} />
      </mesh>
      <mesh position={[0, 0.64, 0.03]} material={toon(PAL.parchment)}>
        <boxGeometry args={[0.52, 0.34, 0.02]} />
      </mesh>
      {[0.07, 0, -0.07].map((dy) => (
        <mesh key={dy} position={[-0.02, 0.64 + dy, 0.042]} material={toon(PAL.ink)}>
          <boxGeometry args={[0.36, 0.018, 0.005]} />
        </mesh>
      ))}
      <mesh position={[0, 0.87, 0.03]} material={glow(busy ? '#ff6a55' : '#6fe08a', 1.5)}>
        <boxGeometry args={[0.52, 0.06, 0.02]} />
      </mesh>
      <mesh
        position={[0, 0.7, 0.1]}
        visible={false}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
          point(true)
        }}
        onPointerOut={() => {
          setHover(false)
          point(false)
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (e.delta <= 8) useGame.setState({ scheduleOf: zone })
        }}
      >
        <boxGeometry args={[0.8, 0.8, 0.3]} />
      </mesh>
      {hover && <Label text={text} y={1.15} />}
    </group>
  )
}

// One sign per bookable room, on the wall just right of its door, facing the workroom.
const SIGNS = DOORS.flatMap((d) => {
  const zone = zoneAt(d.x, d.z - 1)
  return zone && BOOKABLE_ZONES.includes(zone) ? [{ x: d.x + 1.2, z: d.z + 0.24, zone }] : []
})

export function ScheduleSigns() {
  return (
    <>
      {SIGNS.map((s) => (
        <Sign key={s.zone} {...s} />
      ))}
    </>
  )
}

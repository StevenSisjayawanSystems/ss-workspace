import { useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { QUIET_ZONES, seatById } from '@guildhouse/shared'
import { joinCallIn, remotes, ringPerson, useNet } from '../net/net'
import { Avatar } from './Avatar'
import { Label } from './Label'

function RemoteAvatar({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null!)
  const moving = useRef(false)
  const seated = useRef(false)
  const bubble = useNet((s) => s.bubbles[id]?.text)
  const rank = useNet((s) => s.ranks[id])
  const [hover, setHover] = useState(false)
  const info = remotes.get(id)

  useFrame((_, dt) => {
    const r = remotes.get(id)
    if (!r) return
    // Ease towards the latest server position; snap if we fell far behind (join, teleport, tab wake).
    const gap = Math.hypot(r.tx - r.x, r.tz - r.z)
    if (gap > 4) {
      r.x = r.tx
      r.z = r.tz
    } else {
      r.x = THREE.MathUtils.damp(r.x, r.tx, 12, dt)
      r.z = THREE.MathUtils.damp(r.z, r.tz, 12, dt)
    }
    const turn = Math.atan2(Math.sin(r.tfacing - r.facing), Math.cos(r.tfacing - r.facing))
    r.facing += turn * Math.min(1, dt * 12)
    seated.current = !!r.seat
    moving.current = !r.seat && (r.moving || gap > 0.08)
    group.current.position.set(r.x, 0, r.z)
    group.current.rotation.y = r.facing
  })

  if (!info) return null

  // Clicking a person calls them over, or takes you to the call they are already in.
  const theirCall = () => {
    const seat = seatById(remotes.get(id)?.seat ?? '')
    return seat && !QUIET_ZONES.includes(seat.zone) ? seat.zone : undefined
  }
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHover(true)
    document.body.style.cursor = 'pointer'
  }
  const out = () => {
    setHover(false)
    document.body.style.cursor = ''
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > 8) return
    const zone = theirCall()
    if (zone) joinCallIn(zone)
    else ringPerson(id)
  }

  return (
    <group ref={group} position={[info.x, 0, info.z]}>
      <Avatar name={info.name} rank={rank} look={info.look} moving={moving} seated={seated} bubble={bubble} />
      <mesh position={[0, 0.7, 0]} visible={false} onPointerOver={over} onPointerOut={out} onClick={click}>
        <cylinderGeometry args={[0.34, 0.34, 1.4, 10]} />
      </mesh>
      {hover && !bubble && <Label text={theirCall() ? `Join ${info.name}'s call` : `Call ${info.name}`} y={info.look.hat ? 2.08 : 1.82} />}
    </group>
  )
}

export function Remotes() {
  const ids = useNet((s) => s.ids)
  return (
    <>
      {ids.map((id) => (
        <RemoteAvatar key={id} id={id} />
      ))}
    </>
  )
}

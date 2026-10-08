import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { remotes, useNet } from '../net/net'
import { Avatar } from './Avatar'

function RemoteAvatar({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null!)
  const moving = useRef(false)
  const seated = useRef(false)
  const bubble = useNet((s) => s.bubbles[id]?.text)
  const rank = useNet((s) => s.ranks[id])
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
  return (
    <group ref={group} position={[info.x, 0, info.z]}>
      <Avatar name={info.name} rank={rank} look={info.look} moving={moving} seated={seated} bubble={bubble} />
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

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { QUIET_ZONES, SEATS, deskOfSeat, roomById, seatById, type Seat } from '@guildhouse/shared'
import { useGame } from '../game'
import { requestSit, useNet } from '../net/net'
import { Label } from './Label'

const GOLD = new THREE.Color('#ffd98a')

function seatHint(seat: Seat, takenBy: string | undefined, mine: boolean, deskOwner: string | undefined, knock: boolean) {
  if (mine) return 'Your seat'
  if (takenBy) return `Taken by ${takenBy}`
  if (deskOwner) return `${deskOwner}'s desk`
  if (knock) return `The door is closed · click to knock`
  const room = roomById(seat.zone).name
  return QUIET_ZONES.includes(seat.zone) ? `Sit · ${room} is a quiet room` : `Sit to join voice · ${room}`
}

function SeatSpot({ seat, show }: { seat: Seat; show: boolean }) {
  const hovered = useGame((s) => s.hoverSeat === seat.id)
  const mine = useGame((s) => s.seat === seat.id)
  const takenBy = useNet((s) => s.taken[seat.id])
  // A claimed desk keeps its chair for its owner; a closed door means newcomers knock.
  const me = useGame((s) => s.profile?.name)
  const desk = deskOfSeat(seat.id)
  const owner = useNet((s) => (desk ? s.desks[desk.id] : undefined))
  const deskOwner = owner && owner !== me ? owner : undefined
  const inside = useGame((s) => seatById(s.seat ?? '')?.zone === seat.zone)
  const knock = useNet((s) => !!s.closed[seat.zone]) && !inside
  const ring = useRef<THREE.Mesh>(null!)
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, depthWrite: false, toneMapped: false }), [])
  const free = !takenBy && !mine && !deskOwner

  useFrame(({ clock }) => {
    // Free seats in your room carry a faint ring; the one under the pointer lights up and pulses.
    material.opacity = hovered && free ? 1 : 0.4
    material.color.copy(GOLD).multiplyScalar(hovered && free ? 1.7 : 1)
    ring.current.scale.setScalar(hovered && free ? 1.15 + Math.sin(clock.elapsedTime * 6) * 0.08 : 1)
  })

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    useGame.getState().setHoverSeat(seat.id)
  }
  const out = () => useGame.getState().hoverSeat === seat.id && useGame.getState().setHoverSeat(null)
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta <= 8) requestSit(seat.id)
  }

  return (
    <group position={[seat.x, 0, seat.z]}>
      <mesh position={[0, 0.65, 0]} visible={false} onPointerOver={over} onPointerOut={out} onClick={click}>
        <cylinderGeometry args={[0.5, 0.5, 1.3, 12]} />
      </mesh>
      <mesh ref={ring} position={[0, 0.045, 0]} rotation-x={-Math.PI / 2} material={material} visible={free && (show || hovered)} renderOrder={3}>
        <ringGeometry args={[0.3, 0.37, 28]} />
      </mesh>
      {hovered && <Label text={seatHint(seat, takenBy, mine, deskOwner, knock)} y={1.25} />}
    </group>
  )
}

// Every chair, stool, sofa and bench is a way into its room's voice channel.
export function Seats() {
  const zone = useGame((s) => s.zone)
  const hover = useGame((s) => s.hoverSeat)
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hover])
  return (
    <>
      {SEATS.map((seat) => (
        <SeatSpot key={seat.id} seat={seat} show={seat.zone === zone} />
      ))}
    </>
  )
}

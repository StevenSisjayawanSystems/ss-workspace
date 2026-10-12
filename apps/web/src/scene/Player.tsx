import { useEffect, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { GRID_H, GRID_W, WALK_SPEED, circleFree, route, seatById, zoneAt, type Point } from '@guildhouse/shared'
import { inReach, input, player, useGame } from '../game'
import type { AvatarLook } from '../look'
import { requestSit, standUp, useNet } from '../net/net'
import { useStats } from '../stats'
import { Avatar } from './Avatar'
import { Label } from './Label'
import { glow } from './toon'

const KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
}

export function Player({ name, look }: { name: string; look: AvatarLook }) {
  const group = useRef<THREE.Group>(null!)
  const marker = useRef<THREE.Mesh>(null!)
  const moving = useRef(false)
  const seated = useRef(false)
  const path = useRef<Point[]>([])
  const held = useRef(new Set<string>())
  const walkTarget = useGame((s) => s.walkTarget)
  const snaps = useGame((s) => s.snaps)
  const status = useGame((s) => s.status)
  const streak = useStats((s) => s.progress.streak)
  const bubble = useNet((s) => (s.selfId ? s.bubbles[s.selfId]?.text : undefined))

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable)
      if (e.code in KEYS && !typing) held.current.add(e.code)
    }
    const up = (e: KeyboardEvent) => held.current.delete(e.code)
    const clear = () => held.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useEffect(() => {
    if (!walkTarget) return
    // Walking anywhere means getting up first.
    standUp()
    const r = route(player, walkTarget)
    if (r?.length) path.current = r
  }, [walkTarget])

  useEffect(() => {
    path.current = []
  }, [snaps])

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05)
    let sx = input.jx
    let sy = input.jy
    for (const k of held.current) {
      sx += KEYS[k][0]
      sy += KEYS[k][1]
    }
    const len = Math.hypot(sx, sy)
    const game = useGame.getState()
    const seat = seatById(game.seat ?? '')
    seated.current = !!seat
    if (seat && len > 0.12) standUp()
    if (len > 0.12 && game.pendingSeat) useGame.setState({ pendingSeat: null })
    let dx = 0
    let dz = 0
    if (seat && len <= 0.12) {
      player.x = seat.x
      player.z = seat.z
      const turn = Math.atan2(Math.sin(seat.facing - player.facing), Math.cos(seat.facing - player.facing))
      player.facing += turn * Math.min(1, dt * 10)
    } else if (len > 0.12) {
      // Direct control cancels any tap-to-move route. Screen axes map onto the isometric ground plane.
      path.current = []
      const k = Math.min(1, len) / len
      const wx = ((sx - sy) * k) / Math.SQRT2
      const wz = ((-sx - sy) * k) / Math.SQRT2
      const nx = player.x + wx * WALK_SPEED * dt
      const nz = player.z + wz * WALK_SPEED * dt
      if (circleFree(nx, player.z)) dx = nx - player.x
      if (circleFree(player.x + dx, nz)) dz = nz - player.z
    } else if (path.current.length) {
      const next = path.current[0]
      const tx = next.x - player.x
      const tz = next.z - player.z
      const dist = Math.hypot(tx, tz)
      const step = WALK_SPEED * dt
      if (dist <= step) {
        dx = tx
        dz = tz
        path.current.shift()
      } else {
        dx = (tx / dist) * step
        dz = (tz / dist) * step
      }
    }
    player.x += dx
    player.z += dz
    moving.current = player.moving = Math.hypot(dx, dz) > 1e-4
    if (moving.current) {
      const want = Math.atan2(dx, dz)
      const diff = Math.atan2(Math.sin(want - player.facing), Math.cos(want - player.facing))
      player.facing += diff * Math.min(1, dt * 14)
    }
    // Arrived beside the seat we were heading for: sit down.
    if (game.pendingSeat && !path.current.length && !moving.current && inReach(game.pendingSeat)) {
      requestSit(game.pendingSeat)
      useGame.setState({ pendingSeat: null })
    }
    // Cushions sit on the ground, so the sitter eases down further than on a chair.
    const drop = seatById(useGame.getState().seat ?? '')?.drop ?? 0
    group.current.position.set(player.x, THREE.MathUtils.damp(group.current.position.y, drop, 9, dt), player.z)
    group.current.rotation.y = player.facing

    const zone = zoneAt(Math.round(player.x), Math.round(player.z))
    if (zone && zone !== useGame.getState().zone) useGame.getState().setZone(zone)

    const goal = path.current[path.current.length - 1]
    marker.current.visible = !!goal
    if (goal) {
      marker.current.position.set(goal.x, 0.04, goal.z)
      marker.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 6) * 0.12)
    }
  })

  // Clicking yourself opens your own profile, the same way clicking anyone else opens theirs.
  const [hover, setHover] = useState(false)
  const overSelf = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHover(true)
    document.body.style.cursor = 'pointer'
  }
  const outSelf = () => {
    setHover(false)
    document.body.style.cursor = ''
  }
  const clickSelf = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta <= 8) useGame.setState({ profileOf: 'self' })
  }

  const onGround = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return // a drag or pinch, not a tap
    useGame.getState().walkTo(e.point.x, e.point.z)
  }

  return (
    <>
      <mesh position={[GRID_W / 2, 0, GRID_H / 2]} rotation-x={-Math.PI / 2} onClick={onGround} visible={false}>
        <planeGeometry args={[GRID_W + 20, GRID_H + 20]} />
      </mesh>
      <mesh ref={marker} rotation-x={-Math.PI / 2} material={glow('#ffe9a8', 1.5)} visible={false}>
        <ringGeometry args={[0.22, 0.3, 24]} />
      </mesh>
      <group ref={group}>
        <Avatar name={name} status={status} streak={streak} look={look} moving={moving} seated={seated} bubble={bubble} />
        <mesh position={[0, 0.7, 0]} visible={false} onPointerOver={overSelf} onPointerOut={outSelf} onClick={clickSelf}>
          <cylinderGeometry args={[0.34, 0.34, 1.4, 10]} />
        </mesh>
        {hover && !bubble && <Label text="Your profile" y={look.hat ? 2.35 : 2.09} />}›      </group>
    </>
  )
}

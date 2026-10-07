import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { player } from '../game'

const OFFSET = new THREE.Vector3(30, 30, 30)
const MIN_ZOOM = 26
const MAX_ZOOM = 120

// Fixed isometric follow camera with wheel and pinch zoom.
export function CameraRig({ tour = false }: { tour?: boolean }) {
  const { camera, gl, size } = useThree()
  const focus = useRef(new THREE.Vector3(player.x, 0, player.z))
  const zoom = useRef(0)

  useEffect(() => {
    // Show roughly the same slice of the office on a phone as on a desktop.
    zoom.current = THREE.MathUtils.clamp(Math.min(size.width, size.height) / 16, 28, 64)
    camera.position.copy(focus.current).add(OFFSET)
    camera.lookAt(focus.current)
  }, [camera, size.width, size.height])

  useEffect(() => {
    const el = gl.domElement
    const clamp = (z: number) => THREE.MathUtils.clamp(z, MIN_ZOOM, MAX_ZOOM)
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      zoom.current = clamp(zoom.current * Math.exp(-e.deltaY * 0.0015))
    }
    const touches = new Map<number, { x: number; y: number }>()
    let lastDist = 0
    const spread = () => {
      const [a, b] = [...touches.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const down = (e: PointerEvent) => {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touches.size === 2) lastDist = spread()
    }
    const move = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touches.size !== 2) return
      const d = spread()
      if (lastDist > 0) zoom.current = clamp((zoom.current * d) / lastDist)
      lastDist = d
    }
    const up = (e: PointerEvent) => touches.delete(e.pointerId)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [gl])

  useFrame(({ clock }, dt) => {
    // On the title screen the camera drifts in a slow loop over the guildhouse instead of following anyone.
    const t = clock.elapsedTime * 0.07
    const tx = tour ? 15 + Math.cos(t) * 9 : player.x
    const tz = tour ? 12 + Math.sin(t) * 6 : player.z
    focus.current.x = THREE.MathUtils.damp(focus.current.x, tx, tour ? 1.5 : 5, dt)
    focus.current.z = THREE.MathUtils.damp(focus.current.z, tz, tour ? 1.5 : 5, dt)
    camera.position.copy(focus.current).add(OFFSET)
    if (Math.abs(camera.zoom - zoom.current) > 0.01) {
      camera.zoom = THREE.MathUtils.damp(camera.zoom, zoom.current, 10, dt)
      camera.updateProjectionMatrix()
    }
  })
  return null
}

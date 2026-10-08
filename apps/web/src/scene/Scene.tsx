import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import { Bloom, EffectComposer, HueSaturation, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { GRID_H, GRID_W, ROOMS, SPAWN } from '@guildhouse/shared'
import { Building } from './Building'
import { CameraRig } from './CameraRig'
import { Bush, FurnitureLayer, Piece, Rock } from './Furniture'
import { Ink } from './Ink'
import { CloudShadows, Grass, Path, Wildflowers } from './Nature'
import { Player } from './Player'
import { Remotes } from './Remotes'
import { Seats } from './Seats'
import { Desks, ScheduleSigns } from './Reservations'
import { FocusGarden } from './FocusGarden'
import type { Profile } from '../game'
import { localHour, sky, skyAt } from '../time'

// Sun, moon and ambient light follow the viewer's local time of day.
function Daylight() {
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight()
    l.target.position.set(GRID_W / 2, 0, GRID_H / 2)
    l.castShadow = true
    // Crisp cel-style shadow edges; phones get a lighter map.
    const size = matchMedia('(pointer: coarse)').matches ? 2048 : 4096
    l.shadow.mapSize.set(size, size)
    const c = l.shadow.camera
    c.left = -32
    c.right = 32
    c.top = 30
    c.bottom = -30
    c.near = 1
    c.far = 90
    l.shadow.bias = -0.0004
    l.shadow.normalBias = 0.04
    return l
  }, [])
  const last = useRef(-1)
  useFrame(({ clock }) => {
    // The sky moves slowly; a refresh every couple of seconds is plenty.
    if (last.current >= 0 && clock.elapsedTime - last.current < 2) return
    last.current = clock.elapsedTime
    const s = (sky.current = skyAt(localHour()))
    light.color.set(s.sun)
    light.intensity = s.sunPower
    // Always somewhere in the southern half, so the two tall back walls stay lit and shadows stay readable.
    light.position.set(GRID_W / 2 + Math.sin(s.azimuth) * 24, s.height, GRID_H / 2 + Math.cos(s.azimuth) * 24)
    hemi.current.color.set(s.skyTint)
    hemi.current.groundColor.set(s.bounce)
    hemi.current.intensity = s.ambient
  })
  return (
    <>
      <hemisphereLight ref={hemi} />
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  )
}

// After dark each room is lit from within by warm lamplight.
function Lamplight() {
  const group = useRef<THREE.Group>(null!)
  const rooms = ROOMS.filter((r) => !r.outdoor)
  useFrame(() => {
    const n = sky.current.night
    group.current.visible = n > 0.02
    for (const l of group.current.children as THREE.PointLight[]) l.intensity = n * (l.userData.power as number)
  })
  return (
    <group ref={group}>
      {rooms.map((r) => {
        const span = Math.max(r.x1 - r.x0, r.z1 - r.z0) + 1
        return <pointLight key={r.id} position={[(r.x0 + r.x1) / 2, 2.6, (r.z0 + r.z1) / 2]} color="#ffc98a" distance={span * 1.15} decay={1.3} userData={{ power: 5 + span * 0.7 }} />
      })}
    </group>
  )
}

// Glow and vignette deepen at night.
function Mood({ bloom, vignette }: { bloom: React.RefObject<any>; vignette: React.RefObject<any> }) {
  useFrame(() => {
    const n = sky.current.night
    if (bloom.current) bloom.current.intensity = 0.45 + n * 0.75
    if (vignette.current) vignette.current.darkness = 0.5 + n * 0.25
  })
  return null
}

// Trees behind the building, where they frame the diorama without hiding it.
const BACKDROP: [number, number, number][] = [
  [-3, 2, 1.2], [-4, 9, 1], [-3.5, 16, 1.3], [-5, 22, 1.1], [3, -3.5, 1.2], [10, -4.5, 1], [17, -3.5, 1.3],
  [24, -4.5, 1.1], [30, -3, 1.2], [36.5, -2, 1], [-7, -4, 1.4], [-8, 13, 1.2], [14, -8, 1.3], [27, -8, 1.2],
  [-10, 5, 1.5], [-9, 20, 1.3], [6, -9, 1.4], [21, -10, 1.5], [37, 6, 1.1], [38, 15, 1.2],
]
const BUSHES: [number, number, number][] = [
  [-2, 5, 1], [-2.4, 12.5, 1.2], [-2, 19.5, 0.9], [6.5, -2.6, 1.1], [13.5, -2.8, 0.9], [20.5, -2.6, 1.2], [27, -1.6, 1],
  [33, -1.8, 1.1], [35.8, 4, 1], [36, 11, 1.2], [35.8, 19, 0.9], [4, 33.2, 1], [9, 33.6, 1.2], [16, 33.2, 1], [22.5, 33.4, 1.1],
  [28, 25.8, 1], [-1.8, 25.5, 1.1], [0.5, 29, 1], [24, 29.5, 1.1],
]
const ROCKS: [number, number, number][] = [[-5.5, 5.5, 1.3], [8, -6, 1.6], [31.5, -5.5, 1.2], [-6, 25, 1.1], [12.5, 34.5, 0.8], [37.5, 23.5, 1.3]]

export function Scene({ profile }: { profile: Profile | null }) {
  const bloom = useRef<any>(null)
  const vignette = useRef<any>(null)
  return (
    <Canvas
      orthographic
      flat
      shadows
      dpr={[1, 2]}
      camera={{ position: [SPAWN.x + 30, 30, SPAWN.z + 30], zoom: 60, near: 0.1, far: 200 }}
    >
      <color attach="background" args={['#699f49']} />
      <Daylight />
      <Lamplight />
      <Mood bloom={bloom} vignette={vignette} />
      <Building />
      <FurnitureLayer />
      {BACKDROP.map(([x, z, s], i) => (
        <group key={i} position={[x, 0, z]} scale={s}>
          <Piece type="tree" />
        </group>
      ))}
      {BUSHES.map(([x, z, s], i) => (
        <group key={i} position={[x, 0, z]} scale={s}>
          <Bush />
        </group>
      ))}
      {ROCKS.map(([x, z, s], i) => (
        <group key={i} position={[x, 0, z]} scale={s} rotation-y={i * 1.7}>
          <Rock />
        </group>
      ))}
      <Path />
      <Grass />
      <Wildflowers />
      <CloudShadows />
      {profile && <Player name={profile.name} look={profile.look} />}
      <FocusGarden />
      <Remotes />
      {profile && <Seats />}
      {profile && <Desks />}
      {profile && <ScheduleSigns />}
      <Sparkles position={[29, 1.3, 12]} scale={[9, 1.6, 23]} count={45} size={14} speed={0.35} color="#fff3a0" />
      <Sparkles position={[12, 1.4, 12]} scale={[23, 1.8, 23]} count={70} size={6} speed={0.2} opacity={0.5} color="#fff8e0" />
      <CameraRig tour={!profile} />
      <EffectComposer multisampling={8}>
        <Ink />
        <Bloom ref={bloom} mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.45} />
        <HueSaturation saturation={0.04} />
        <Vignette ref={vignette} offset={0.22} darkness={0.55} />
      </EffectComposer>
    </Canvas>
  )
}

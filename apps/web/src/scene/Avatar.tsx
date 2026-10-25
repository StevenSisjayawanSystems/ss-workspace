import { Suspense, useMemo, useRef, type RefObject } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import { Outlines, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { DEFAULT_LOOK, type AvatarLook } from '../look'
import { Label, labelOverlayScene } from './Label'
import { PAL, toon } from './toon'

const Line = () => <Outlines thickness={0.02} color={PAL.ink} />
const TROUSERS = '#3d5f96'
const BOOTS = '#7a4a2e'

type EmoteItem = { id: number; emoji: string; until: number }

const EMOTE_IMAGES: Record<string, string> = {
  wave: '/emotes/wave.png',
  heart: '/emotes/heart.png',
  laugh: '/emotes/laugh.png',
  cheer: '/emotes/cheer.png',
}

Object.values(EMOTE_IMAGES).forEach((url) => {
  useTexture.preload(url)
})

function EmoteSprite({
  item,
  y,
  order,
}: {
  item: EmoteItem
  y: number
  order: number
}) {
  const anchor = useRef<THREE.Group>(null!)
  const sprite = useRef<THREE.Sprite>(null!)
  const material = useRef<THREE.SpriteMaterial>(null!)
  const screenRight = useMemo(() => new THREE.Vector3(), [])
  const screenUp = useMemo(() => new THREE.Vector3(), [])
  const [offsetX, offsetY] = useMemo(() => {
    const angle = Math.random() * Math.PI * 2
    const radius = 0.62 + Math.random() * 0.22
    return [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.72]
  }, [item.id])
  const image = useTexture(EMOTE_IMAGES[item.emoji])

  const texture = useMemo(() => {
    image.colorSpace = THREE.SRGBColorSpace
    image.anisotropy = 4
    return image
  }, [image])

  useFrame(({ camera }) => {
    if (!anchor.current || !sprite.current || !material.current) return
    const duration = 1800
    const startedAt = item.until - duration
    const progress = THREE.MathUtils.clamp((Date.now() - startedAt) / duration, 0, 1)
    const rise = offsetY + progress * 0.22

    anchor.current.position.set(0, y, 0)
    anchor.current.getWorldPosition(sprite.current.position)
    screenRight.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(offsetX)
    screenUp.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(rise)
    sprite.current.position.add(screenRight).add(screenUp)

    const pop = Math.min(1, progress / 0.12)
    const fade = progress < 0.58 ? 1 : 1 - (progress - 0.58) / 0.42
    const scale = 0.78 * (0.82 + pop * 0.18)
    sprite.current.scale.set(scale, scale, 1)
    material.current.opacity = THREE.MathUtils.clamp(fade, 0, 1)
  })

  return (
    <>
      <group ref={anchor} />
      {createPortal(
        <sprite ref={sprite} renderOrder={12 + order}>
          <spriteMaterial
            ref={material}
            map={texture}
            transparent
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>,
        labelOverlayScene,
      )}
    </>
  )
}

function EmoteBurst({ emotes, y }: { emotes: EmoteItem[]; y: number }) {
  return (
    <>
      {emotes.map((item, index) => (
        <Suspense key={item.id} fallback={null}>
          <EmoteSprite item={item} y={y} order={index} />
        </Suspense>
      ))}
    </>
  )
}

// Spiky anime hair: a cap plus tufts swept back and a fringe over the brow.
const TUFTS: [number, number, number, number, number, number][] = [
  [0, 0.2, -0.04, -0.5, 0, 0.26], [-0.13, 0.15, -0.06, -0.5, 0.7, 0.22], [0.13, 0.15, -0.06, -0.5, -0.7, 0.22],
  [0, 0.08, -0.17, -1.4, 0, 0.24], [-0.14, 0.04, -0.13, -1.3, 0.6, 0.2], [0.14, 0.04, -0.13, -1.3, -0.6, 0.2],
  [-0.08, 0.13, 0.14, 1.9, 0.3, 0.16], [0.03, 0.14, 0.15, 2.0, -0.1, 0.17], [0.12, 0.12, 0.12, 1.9, -0.5, 0.15],
]

// A young storybook adventurer built from primitives. Faces +z; the parent group places and turns it.
export function Avatar({ look = DEFAULT_LOOK, name, moving, seated, bubble, status, streak, emotes = [] }: { look?: AvatarLook; name?: string; status?: string; streak?: number; moving: RefObject<boolean>; seated?: RefObject<boolean>; bubble?: string; emotes?: EmoteItem[] }) {
  const body = useRef<THREE.Group>(null!)
  const legL = useRef<THREE.Group>(null!)
  const legR = useRef<THREE.Group>(null!)
  const armL = useRef<THREE.Group>(null!)
  const armR = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const cape = useRef<THREE.Group>(null!)
  const gait = useRef(0)
  const sit = useRef(0)
  const phase = useRef(0)

  useFrame(({ clock }, dt) => {
    gait.current = THREE.MathUtils.damp(gait.current, moving.current ? 1 : 0, 10, dt)
    phase.current += dt * 12 * gait.current
    const g = gait.current
    const swing = Math.sin(phase.current) * g
    const breathe = Math.sin(clock.elapsedTime * 2.2) * (1 - g)
    // Seated: hips drop onto the seat and the legs swing forward.
    sit.current = THREE.MathUtils.damp(sit.current, seated?.current ? 1 : 0, 9, dt)
    const s = sit.current
    body.current.position.y = Math.abs(Math.cos(phase.current)) * 0.05 * g + breathe * 0.008 + s * 0.05
    body.current.rotation.x = 0.12 * g
    legL.current.rotation.x = -swing * 0.9 - s * 1.45
    legR.current.rotation.x = swing * 0.9 - s * 1.45
    armL.current.rotation.x = swing * 0.9
    armR.current.rotation.x = -swing * 0.9
    head.current.rotation.z = breathe * 0.03
    cape.current.rotation.x = 0.1 + 0.45 * g + Math.sin(clock.elapsedTime * 3) * 0.04
  })

  const leg = (ref: RefObject<THREE.Group>, x: number) => (
    <group ref={ref} position={[x, 0.36, 0]}>
      <mesh position={[0, -0.13, 0]} material={toon(TROUSERS)} castShadow>
        <capsuleGeometry args={[0.062, 0.16, 4, 8]} />
        <Line />
      </mesh>
      <mesh position={[0, -0.3, 0.035]} scale={[1, 0.75, 1.45]} material={toon(BOOTS)} castShadow>
        <sphereGeometry args={[0.075, 10, 8]} />
        <Line />
      </mesh>
    </group>
  )
  const arm = (ref: RefObject<THREE.Group>, side: number) => (
    <group ref={ref} position={[side * 0.165, 0.66, 0]}>
      <mesh position={[side * 0.03, -0.12, 0]} rotation-z={side * 0.22} material={toon(look.robe)} castShadow>
        <capsuleGeometry args={[0.048, 0.17, 4, 8]} />
        <Line />
      </mesh>
      <mesh position={[side * 0.06, -0.27, 0]} material={toon(look.skin)}>
        <sphereGeometry args={[0.048, 8, 6]} />
      </mesh>
    </group>
  )

  return (
    <group>
      {/* Stretched a little taller, with the head scaled back down: older, leaner proportions. */}
      <group scale={[0.95, 1.14, 0.95]}>
        <group ref={body}>
          {leg(legL, -0.075)}
          {leg(legR, 0.075)}
          {/* tunic with a belt */}
          <mesh position={[0, 0.53, 0]} material={toon(look.robe)} castShadow>
            <cylinderGeometry args={[0.12, 0.17, 0.36, 14]} />
            <Line />
          </mesh>
          <mesh position={[0, 0.43, 0]} material={toon(BOOTS)}>
            <cylinderGeometry args={[0.158, 0.165, 0.05, 14]} />
          </mesh>
          <mesh position={[0, 0.43, 0.16]} material={toon(look.trim)}>
            <boxGeometry args={[0.06, 0.06, 0.02]} />
          </mesh>
          {arm(armL, -1)}
          {arm(armR, 1)}
          {/* short cape pinned at the collar */}
          <mesh position={[0, 0.71, 0]} material={toon(look.trim)}>
            <cylinderGeometry args={[0.09, 0.15, 0.07, 14]} />
          </mesh>
          <group ref={cape} position={[0, 0.72, -0.1]}>
            <mesh position={[0, -0.2, -0.02]} material={toon(look.trim)} castShadow>
              <boxGeometry args={[0.34, 0.42, 0.035]} />
              <Line />
            </mesh>
          </group>
          <mesh position={[0, 0.76, 0]} material={toon(look.skin)}>
            <cylinderGeometry args={[0.045, 0.05, 0.08, 8]} />
          </mesh>
          <group ref={head} position={[0, 0.93, 0]} scale={[0.97, 0.81, 0.97]}>
            <mesh scale={[1, 1.04, 0.98]} material={toon(look.skin)} castShadow>
              <sphereGeometry args={[0.2, 18, 14]} />
              <Line />
            </mesh>
            <mesh position={[0, 0.025, -0.025]} material={toon(look.hair)}>
              <sphereGeometry args={[0.212, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
              <Line />
            </mesh>
            {TUFTS.map(([x, y, z, rx, rz, len], i) => (
              <mesh key={i} position={[x, y, z]} rotation={[rx, 0, rz]} material={toon(look.hair)}>
                <coneGeometry args={[0.07, len, 6]} />
              </mesh>
            ))}
            {[-1, 1].map((sx) => (
              <group key={sx} position={[sx * 0.075, -0.015, 0.178]}>
                <mesh scale={[1, 1.35, 0.35]} material={toon('#ffffff')}>
                  <sphereGeometry args={[0.042, 10, 8]} />
                </mesh>
                <mesh position={[0, -0.004, 0.012]} scale={[1, 1.3, 0.35]} material={toon('#3b2a20')}>
                  <sphereGeometry args={[0.03, 10, 8]} />
                </mesh>
                <mesh position={[0.01, 0.014, 0.022]} material={toon('#ffffff')}>
                  <sphereGeometry args={[0.009, 6, 4]} />
                </mesh>
                <mesh position={[0, 0.062, 0.004]} rotation-z={sx * -0.15} material={toon(look.hair)}>
                  <boxGeometry args={[0.07, 0.014, 0.01]} />
                </mesh>
              </group>
            ))}
            {[-1, 1].map((sx) => (
              <mesh key={sx} position={[sx * 0.125, -0.07, 0.15]} scale={[1, 0.55, 0.3]} material={toon('#ffa99a')}>
                <sphereGeometry args={[0.036, 8, 6]} />
              </mesh>
            ))}
            <mesh position={[0, -0.095, 0.19]} scale={[1, 0.45, 0.4]} material={toon('#c9705f')}>
              <sphereGeometry args={[0.022, 8, 6]} />
            </mesh>
            {look.hat && (
              <group position={[0, 0.17, -0.02]} rotation-x={-0.14}>
                <mesh material={toon(look.robe)} castShadow>
                  <cylinderGeometry args={[0.32, 0.32, 0.03, 18]} />
                  <Line />
                </mesh>
                <mesh position={[0, 0.2, 0]} material={toon(look.robe)} castShadow>
                  <coneGeometry args={[0.19, 0.42, 14]} />
                  <Line />
                </mesh>
                <mesh position={[0, 0.045, 0]} material={toon(look.trim)}>
                  <cylinderGeometry args={[0.175, 0.19, 0.06, 14]} />
                </mesh>
              </group>
            )}
          </group>
        </group>
      </group>
      {name && <Label text={status ? `${name} · ${status}` : name} streak={streak} y={-0.18} placement="below" />}
      {bubble && <Label text={bubble} y={look.hat ? 1.75 : 1.49} bubble />}
      {!!emotes.length && <EmoteBurst emotes={emotes} y={look.hat ? 1.02 : 0.92} />}
    </group>
  )
}

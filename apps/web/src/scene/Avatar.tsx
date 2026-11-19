import { Suspense, useMemo, useRef, type RefObject } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { DEFAULT_LOOK, type AvatarLook } from '../look'
import { Label, labelOverlayScene } from './Label'
import { WIZARD_HEIGHT, WizardModel } from './WizardModel'

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

// The wizard character from assets/characters/wizard, loaded as a skinned glTF. Faces +z; the parent group places and turns it.
// `look` tints her skin, cloak, trim and hair. `seated` is accepted but she has no sitting pose yet.
export function Avatar({ look = DEFAULT_LOOK, name, moving, bubble, status, streak, emotes = [] }: { look?: AvatarLook; name?: string; status?: string; streak?: number; moving: RefObject<boolean>; seated?: RefObject<boolean>; bubble?: string; emotes?: EmoteItem[] }) {
  return (
    <group>
      <Suspense fallback={null}>
        <WizardModel look={look} moving={moving} />
      </Suspense>
      {name && <Label text={status ? `${name} · ${status}` : name} streak={streak} y={-0.18} placement="below" />}
      {bubble && <Label text={bubble} y={WIZARD_HEIGHT + 0.25} bubble />}
      {!!emotes.length && <EmoteBurst emotes={emotes} y={WIZARD_HEIGHT * 0.8} />}
    </group>
  )
}

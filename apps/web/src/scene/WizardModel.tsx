import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { trimFor, type AvatarLook } from '../look'
import { PAL, toonRamp } from './toon'

export const WIZARD_URL = '/models/characters/wizard.glb'
// The Blender model is about 6 units tall; this brings her to roughly 1.2, matching the old avatar.
export const WIZARD_SCALE = 0.2
export const WIZARD_HEIGHT = 1.2
// Draco decoder served from public/draco (copied from three/examples/jsm/libs/draco/gltf) rather than a CDN.
const DRACO_PATH = '/draco/'

useGLTF.preload(WIZARD_URL, DRACO_PATH)

// Parts of the model that follow the player's look. Everything else keeps its modelled colour.
const BAKED_SKIN = new THREE.Color('#f0c6b3') // the skin colour baked into the face texture
function tintFor(src: THREE.Material, look: AvatarLook): THREE.Color | null {
  switch (src.name) {
    case 'M_CloakPurple':
      return new THREE.Color(look.robe)
    case 'M_GoldTrim':
      return new THREE.Color(trimFor(look.robe))
    case 'M_HairBrown':
      return new THREE.Color(look.hair)
    case 'M_Skin':
      return new THREE.Color(look.skin)
    case 'M_Face': {
      // The face texture already holds her skin, so scale it from the baked tone to the chosen one;
      // the drawn lines stay dark and keep their shape.
      const c = new THREE.Color(look.skin)
      return c.setRGB(c.r / BAKED_SKIN.r, c.g / BAKED_SKIN.g, c.b / BAKED_SKIN.b)
    }
    default:
      return null
  }
}

// One cel-shaded material per source material and colour, shared by everyone who looks the same.
const toonCache = new Map<string, THREE.MeshToonMaterial>()
function toToon(src: THREE.Material, look: AvatarLook): THREE.MeshToonMaterial {
  const std = src as THREE.MeshStandardMaterial
  const tint = tintFor(src, look)
  const key = tint ? `${src.uuid}|${tint.r.toFixed(4)},${tint.g.toFixed(4)},${tint.b.toFixed(4)}` : src.uuid
  let m = toonCache.get(key)
  if (!m) {
    // Keep the file's double-sidedness: the hair ribbons and cloth are open shells that vanish with back faces culled.
    m = new THREE.MeshToonMaterial({ color: tint ?? std.color, map: std.map ?? null, gradientMap: toonRamp, side: std.side })
    m.name = src.name
    toonCache.set(key, m)
  }
  return m
}

// Inverted-hull ink outline that follows the skeleton, like the drei <Outlines> on the old avatar.
const OUTLINE_THICKNESS = 0.035 // model units, before WIZARD_SCALE
// Eyes and the thin hair ribbons read better without an ink hull (on thin shells the hull shows through).
const NO_OUTLINE = new Set(['M_Eyes', 'M_HairBrown'])
const outlineMaterial = new THREE.MeshBasicMaterial({ color: PAL.ink, side: THREE.BackSide })
outlineMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>\ntransformed += normalize(objectNormal) * ${OUTLINE_THICKNESS.toFixed(3)};`,
  )
}
outlineMaterial.customProgramCacheKey = () => 'wizard-outline'

const noRaycast = () => {}

export function WizardModel({ look, moving }: { look: AvatarLook; moving: RefObject<boolean> }) {
  const root = useRef<THREE.Group>(null!)
  const { scene, animations } = useGLTF(WIZARD_URL, DRACO_PATH)

  // Each player needs its own skeleton, so clone with SkeletonUtils rather than Object3D.clone().
  const model = useMemo(() => {
    const copy = cloneSkinned(scene)
    const skinned: THREE.SkinnedMesh[] = []
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      // Remember the material from the file; the toon version is chosen from it and the look below.
      mesh.userData.source = mesh.material
      mesh.material = toToon(mesh.material as THREE.Material, look)
      // Her real shadow, so the walk and the swing of the cloak show on the floor too.
      mesh.castShadow = true
      // Clicks use the invisible hit cylinder in Player/Remotes; skinned raycasts are expensive.
      mesh.raycast = noRaycast
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh)
    })
    // Added after the traversal so the outlines are not visited (and outlined) themselves.
    for (const body of skinned) {
      if (NO_OUTLINE.has((body.material as THREE.Material).name)) continue
      const line = new THREE.SkinnedMesh(body.geometry, outlineMaterial)
      line.position.copy(body.position)
      line.quaternion.copy(body.quaternion)
      line.scale.copy(body.scale)
      line.bind(body.skeleton, body.bindMatrix)
      line.raycast = noRaycast
      body.parent?.add(line)
    }
    return copy
    // The look is applied (and kept up to date) by the effect below; this only needs a first value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  useEffect(() => {
    model.traverse((o) => {
      const source = o.userData.source as THREE.Material | undefined
      if (source) (o as THREE.Mesh).material = toToon(source, look)
    })
  }, [model, look.robe, look.hair, look.skin])

  const { actions } = useAnimations(animations, root)
  const current = useRef<'Walk' | 'Idle' | null>(null)

  useEffect(() => {
    actions.Idle?.reset().play()
    current.current = 'Idle'
    return () => {
      actions.Idle?.stop()
      actions.Walk?.stop()
    }
  }, [actions])

  useFrame(() => {
    const want = moving.current ? 'Walk' : 'Idle'
    if (want === current.current) return
    const next = actions[want]
    const prev = current.current ? actions[current.current] : undefined
    if (!next) return
    next.reset().setEffectiveWeight(1).fadeIn(0.2).play()
    prev?.fadeOut(0.2)
    current.current = want
  })

  return (
    <group ref={root} scale={WIZARD_SCALE}>
      <primitive object={model} />
    </group>
  )
}

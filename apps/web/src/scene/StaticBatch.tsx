import { useLayoutEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Merges the many little parts of the props inside it (every box, cylinder and sphere is its own mesh)
// into a handful of meshes. Each part's colour is written into its vertices, so parts of different colours
// can share one material and be drawn together. The scene looks exactly the same, but the GPU is asked to
// draw a few dozen things each frame instead of well over a thousand, and the shadow pass shrinks with it.
//
// Rules, so that nothing changes in behaviour:
// - Only plain cel-shaded parts are merged (MeshToonMaterial with a flat colour and no texture). Glowing
//   parts stay separate, because bloom picks them out one by one.
// - A group marked `userData.batchUnit` moves as a whole (Sway, Flicker, Bob). Its parts are merged with
//   each other inside that group, so it keeps moving.
// - Anything under a group marked `userData.noBatch` is left alone (clickable props like the gramophone).
// - The merged parts must not change after mounting: their colour is copied once. This is for scenery,
//   not for anything driven by state.

const shared = new Map<string, THREE.MeshToonMaterial>()
function sharedMaterial(src: THREE.MeshToonMaterial): THREE.MeshToonMaterial {
  const key = `${src.gradientMap?.uuid ?? ''}|${src.side}`
  let m = shared.get(key)
  if (!m) {
    m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: src.gradientMap, side: src.side })
    m.name = 'StaticBatch'
    shared.set(key, m)
  }
  return m
}

const mergeable = (m: THREE.Mesh) => {
  const mat = m.material as THREE.MeshToonMaterial
  return (
    m.isMesh &&
    !(m as THREE.InstancedMesh).isInstancedMesh &&
    !(m as THREE.SkinnedMesh).isSkinnedMesh &&
    m.visible &&
    !Array.isArray(m.material) &&
    mat.isMeshToonMaterial &&
    !mat.map &&
    !mat.transparent &&
    !mat.vertexColors &&
    !!m.geometry.attributes.position &&
    !!m.geometry.attributes.normal &&
    !Object.keys(m.geometry.morphAttributes).length
  )
}

const keyOf = (m: THREE.Mesh) => {
  const mat = m.material as THREE.MeshToonMaterial
  return [mat.gradientMap?.uuid ?? '', mat.side, m.castShadow, m.receiveShadow, m.renderOrder].join('|')
}

// A copy of the part's geometry in the unit's space, carrying the part's colour in every vertex.
function prepared(m: THREE.Mesh, toUnit: THREE.Matrix4): THREE.BufferGeometry {
  const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', src.attributes.position)
  g.setAttribute('normal', src.attributes.normal)
  const n = src.attributes.position.count
  const c = (m.material as THREE.MeshToonMaterial).color
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.applyMatrix4(toUnit)
  return g
}

function batch(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true)
  // Parts grouped by the unit that carries them (the root, or a moving group) and then by draw state.
  const units = new Map<THREE.Object3D, Map<string, THREE.Mesh[]>>()
  const visit = (o: THREE.Object3D, unit: THREE.Object3D) => {
    if (o.userData.noBatch) return
    if (o !== root && o.userData.batchUnit) unit = o
    const m = o as THREE.Mesh
    if (m.isMesh && mergeable(m)) {
      let byKey = units.get(unit)
      if (!byKey) units.set(unit, (byKey = new Map()))
      const k = keyOf(m)
      const list = byKey.get(k)
      if (list) list.push(m)
      else byKey.set(k, [m])
    }
    for (const c of o.children) visit(c, unit)
  }
  visit(root, root)

  const made: THREE.Mesh[] = []
  const hidden: THREE.Mesh[] = []
  const inv = new THREE.Matrix4()
  const rel = new THREE.Matrix4()
  for (const [unit, byKey] of units) {
    inv.copy(unit.matrixWorld).invert()
    for (const parts of byKey.values()) {
      if (parts.length < 2) continue
      const geoms = parts.map((p) => prepared(p, rel.multiplyMatrices(inv, p.matrixWorld)))
      const merged = mergeGeometries(geoms)
      geoms.forEach((g) => g.dispose())
      if (!merged) continue
      const first = parts[0]
      const mesh = new THREE.Mesh(merged, sharedMaterial(first.material as THREE.MeshToonMaterial))
      mesh.castShadow = first.castShadow
      mesh.receiveShadow = first.receiveShadow
      mesh.renderOrder = first.renderOrder
      mesh.userData.batched = true
      unit.add(mesh)
      made.push(mesh)
      for (const p of parts) {
        p.visible = false
        hidden.push(p)
      }
    }
  }
  return () => {
    for (const m of made) {
      m.removeFromParent()
      m.geometry.dispose()
    }
    for (const p of hidden) p.visible = true
  }
}

export function StaticBatch({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null!)
  // Children are attached by the time a parent's layout effect runs.
  useLayoutEffect(() => batch(ref.current), [])
  return <group ref={ref}>{children}</group>
}

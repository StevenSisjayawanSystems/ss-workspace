import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GRID_H, GRID_W, ROOMS, isWalkable, onBed, tileAt, zoneAt } from '@guildhouse/shared'
import { sky } from '../time'

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const OUTDOORS = new Set<string>(ROOMS.filter((r) => r.outdoor).map((r) => r.id))

// One tuft: three tapered blades fanned around the centre, dark at the root and sunlit at the tip.
function tuftGeometry() {
  const pos: number[] = []
  const col: number[] = []
  const uv: number[] = []
  const root = new THREE.Color('#3f8a3c')
  const tip = new THREE.Color('#b3d36a')
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI + 0.3
    const dx = Math.cos(a) * 0.07
    const dz = Math.sin(a) * 0.07
    const lean = (i - 1) * 0.12
    pos.push(-dx, 0, -dz, dx, 0, dz, lean, 1, lean * 0.6)
    col.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b)
    uv.push(0, 0, 1, 0, 0.5, 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  // Every normal points up so the meadow is evenly sunlit and still takes cast shadows.
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(27).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  return g
}

// Wind-blown grass: tall in the meadow around the guildhouse, mown short on the garden terrace.
export function Grass({ count = 24000 }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const time = useRef({ value: 0 })
  const geometry = useMemo(tuftGeometry, [])
  const material = useMemo(() => {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, depthWrite: false })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time.current
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 root = instanceMatrix[3].xyz;
            float gust = sin(uTime * 1.6 + root.x * 0.55 + root.z * 0.4) + 0.5 * sin(uTime * 3.1 + root.x * 1.3 - root.z * 0.9);
            transformed.x += gust * 0.16 * uv.y * uv.y;
            transformed.z += gust * 0.08 * uv.y * uv.y;
          #endif`,
        )
      // Light both faces of a blade as if it faced the sky; otherwise back faces render black.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);',
      )
    }
    return m
  }, [])

  const tufts = useMemo(() => {
    const r = rng(42)
    const out: { x: number; z: number; h: number; tint: number }[] = []
    let guard = 0
    while (out.length < count && guard++ < count * 6) {
      const x = -16 + r() * (GRID_W + 30)
      const z = -14 + r() * (GRID_H + 28)
      const tx = Math.round(x), tz = Math.round(z)
      const tile = tileAt(tx, tz)
      const garden = OUTDOORS.has(zoneAt(tx, tz) ?? '')
      if (tile === 'wall' || tile === 'door' || tile === 'hedge') continue
      if (onPath(x, z, 0.75) || onBed(x, z)) continue
      if (tile === 'floor' && (!garden || !isWalkable(tx, tz))) continue
      // Thin the terrace so furniture and feet stay readable.
      if (garden && r() > 0.45) continue
      out.push({ x, z, h: garden ? 0.16 + r() * 0.12 : 0.3 + r() * 0.35, tint: r() })
    }
    return out
  }, [count])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const c = new THREE.Color()
    tufts.forEach((t, i) => {
      q.setFromAxisAngle(up, t.tint * Math.PI * 2)
      m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(1, t.h, 1))
      ref.current.setMatrixAt(i, m)
      ref.current.setColorAt(i, c.setHSL(0.27 + t.tint * 0.06, 0.25, 0.86 + t.tint * 0.14))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [tufts])

  useFrame((_, dt) => {
    time.current.value += dt
  })

  // Drawn after the solid world and kept out of the depth buffer, so the ink pass does not outline every blade.
  return <instancedMesh ref={ref} args={[geometry, material, tufts.length]} receiveShadow frustumCulled={false} renderOrder={1} />
}

// The lane that winds from the front door down through the meadow.
// It starts at the front door (the building's south wall is at z = 24) and runs through the focus garden.
const PATH_Z0 = 24.7
const PATH_Z1 = 30.6
const pathX = (_z: number) => 12
const onPath = (x: number, z: number, half: number) => z > PATH_Z0 && z < PATH_Z1 && Math.abs(x - pathX(z)) < half

export function Path() {
  const stones = useMemo(() => {
    const r = rng(5)
    const out: { x: number; z: number; rx: number; rz: number; rot: number; tone: number }[] = []
    const MIN_GAP = 0.14
    for (let z = PATH_Z0 + 0.5; z < PATH_Z1 - 1.0; z += 0.68) {
      const rx = 0.27 + r() * 0.16
      const rz = 0.22 + r() * 0.13
      const zAdjustment = out.length === 4 ? -0.18 : 0
      let bestX = pathX(z)
      let bestZ = z - 0.2 + zAdjustment
      let bestClearance = -Infinity

      for (let attempt = 0; attempt < 40; attempt++) {
        const x = pathX(z) + (r() - 0.5) * 0.9
        const candidateZ = z - 0.2 + zAdjustment + (r() - 0.5) * 0.18
        const clearance = out.reduce((smallest, stone) => {
          const dx = x - stone.x
          const dz = candidateZ - stone.z
          const requiredX = rx + stone.rx + MIN_GAP
          const requiredZ = rz + stone.rz + MIN_GAP
          const separation = Math.hypot(dx / requiredX, dz / requiredZ)
          return Math.min(smallest, separation)
        }, Infinity)

        if (clearance > bestClearance) {
          bestClearance = clearance
          bestX = x
          bestZ = candidateZ
        }
        if (clearance >= 1.08) break
      }

      // Preserve the best candidate, then reduce size only when a full-size stone cannot fit.
      // This prevents the fallback from leaving two large stones almost touching.
      let fittedRx = rx
      let fittedRz = rz
      for (let attempt = 0; attempt < 8; attempt++) {
        const tooClose = out.some((stone) => {
          const dx = bestX - stone.x
          const dz = bestZ - stone.z
          return Math.hypot(
            dx / (fittedRx + stone.rx + MIN_GAP),
            dz / (fittedRz + stone.rz + MIN_GAP),
          ) < 1
        })
        if (!tooClose) break
        fittedRx *= 0.94
        fittedRz *= 0.94
      }

      out.push({ x: bestX, z: bestZ, rx: fittedRx, rz: fittedRz, rot: r() * 3, tone: r() })
    }
    // Apply size-only adjustments after all positions are calculated so they cannot move neighboring stones.
    const thirdFromBench = out[out.length - 3]
    if (thirdFromBench) {
      thirdFromBench.rx *= 1.06
      thirdFromBench.rz *= 1.06
    }
    const fifthFromBench = out[out.length - 5]
    if (fifthFromBench) {
      fifthFromBench.rx *= 0.97
      fifthFromBench.rz *= 0.97
    }
    const fourthFromBench = out[out.length - 4]
    if (fourthFromBench) {
      fourthFromBench.z += 0.68 * 0.2
    }
    const seventhFromBench = out[out.length - 7]
    if (seventhFromBench) {
      seventhFromBench.rx *= 0.95 * 0.95 * 0.95
      seventhFromBench.rz *= 0.95 * 0.95 * 0.95
    }
    return out
  }, [])
  const mats = useMemo(() => ['#d8cfb8', '#c5bba3', '#b6ad98'].map((c) => new THREE.MeshLambertMaterial({ color: c })), [])
  return (
    <group>
      {stones.map((s, i) => (
        <mesh key={i} position={[s.x, 0.03, s.z]} rotation-y={s.rot} scale={[s.rx, 0.05, s.rz]} material={mats[Math.floor(s.tone * 3)]} receiveShadow>
          <cylinderGeometry args={[1, 1.08, 1, 9]} />
        </mesh>
      ))}
    </group>
  )
}

const BLOOMS = ['#ffffff', '#ffe36a', '#ff9fc2', '#c9a6ff', '#ffb37a']

// Wildflowers dotted through the meadow.
export function Wildflowers({ count = 520 }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const flowers = useMemo(() => {
    const r = rng(11)
    const out: { x: number; y: number; z: number; c: number }[] = []
    let guard = 0
    while (out.length < count && guard++ < count * 8) {
      // Clustered in drifts rather than spread evenly.
      const cx = -15 + r() * (GRID_W + 28), cz = -13 + r() * (GRID_H + 26)
      const kind = Math.floor(r() * BLOOMS.length)
      for (let k = 0; k < 7 && out.length < count; k++) {
        const x = cx + (r() - 0.5) * 2.4, z = cz + (r() - 0.5) * 2.4
        if (tileAt(Math.round(x), Math.round(z)) !== 'void' || onPath(x, z, 0.7)) continue
        out.push({ x, y: 0.3 + r() * 0.2, z, c: kind })
      }
    }
    return out
  }, [count])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    flowers.forEach((f, i) => {
      m.makeTranslation(f.x, f.y, f.z)
      ref.current.setMatrixAt(i, m)
      ref.current.setColorAt(i, c.set(BLOOMS[f.c]))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [flowers])
  // Petals are unlit, so they are dimmed by hand as night falls.
  const mat = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame(() => mat.current.color.setScalar(1 - sky.current.night * 0.62))
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, flowers.length]} frustumCulled={false} renderOrder={2}>
      <sphereGeometry args={[0.065, 7, 5]} />
      <meshBasicMaterial ref={mat} toneMapped={false} depthWrite={false} />
    </instancedMesh>
  )
}

function cloudTexture() {
  const S = 512
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')!
  const r = rng(7)
  for (let i = 0; i < 9; i++) {
    const cx = r() * S, cy = r() * S
    for (let k = 0; k < 6; k++) {
      const x = cx + (r() - 0.5) * 150, y = cy + (r() - 0.5) * 80, rad = 40 + r() * 55
      for (const ox of [-S, 0, S])
        for (const oy of [-S, 0, S]) {
          const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad)
          grad.addColorStop(0, 'rgba(255,255,255,0.55)')
          grad.addColorStop(1, 'rgba(255,255,255,0)')
          g.fillStyle = grad
          g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2)
        }
    }
  }
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2.2, 2.2)
  return t
}

// Soft cool shadows of clouds drifting over the whole scene.
export function CloudShadows() {
  const tex = useMemo(cloudTexture, [])
  const mat = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame((_, dt) => {
    tex.offset.x += dt * 0.006
    tex.offset.y += dt * 0.0025
    mat.current.opacity = 0.36 * (1 - sky.current.night * 0.7)
  })
  return (
    <mesh position={[GRID_W / 2, 7, GRID_H / 2]} rotation-x={-Math.PI / 2} renderOrder={5}>
      <planeGeometry args={[170, 170]} />
      <meshBasicMaterial ref={mat} color="#17406b" alphaMap={tex} transparent opacity={0.36} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

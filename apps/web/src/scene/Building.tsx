import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DOORS, GRID_H, GRID_W, ROOMS, WALL_DECOR, tileAt, type Room, zoneAt } from '@guildhouse/shared'
import { player, useGame } from '../game'
import { useNet } from '../net/net'
import { PAL, floorTexture, glow, shingleTexture, toon, toonRamp } from './toon'

type V3 = [number, number, number]
interface BoxItem {
  p: V3
  s: V3
}

const TALL = 2.6
const LOW = 1.0
const HEDGE = 0.7
const THICK = 0.4

function Boxes({ items, color }: { items: BoxItem[]; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    items.forEach((it, i) => {
      m.compose(new THREE.Vector3(...it.p), q, new THREE.Vector3(...it.s))
      ref.current.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [items])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} material={toon(color)} castShadow receiveShadow frustumCulled={false}>
      <boxGeometry />
    </instancedMesh>
  )
}

const open = (x: number, z: number) => {
  const t = tileAt(x, z)
  return t === 'floor' || t === 'door'
}

function useWalls() {
  return useMemo(() => {
    const body: BoxItem[] = []
    const cap: BoxItem[] = []
    const skirt: BoxItem[] = []
    const timber: BoxItem[] = []
    const hedge: BoxItem[] = []
    const hedgeTop: BoxItem[] = []
    const skip = new Set(WALL_DECOR.filter((d) => d.type === 'frontDoor').map((d) => `${d.x},${d.z}`))
    for (let x = 0; x < GRID_W; x++)
      for (let z = 0; z < GRID_H; z++) {
        const t = tileAt(x, z)
        if (t === 'hedge') {
          hedge.push({ p: [x, HEDGE / 2, z], s: [1, HEDGE, 1] })
          hedgeTop.push({ p: [x, HEDGE, z], s: [0.86, 0.16, 0.86] })
        }
        if (t !== 'wall') continue
        const h = open(x - 1, z) || open(x, z - 1) || open(x - 1, z - 1) ? LOW : TALL
        const parts: [number, number, number, number][] = skip.has(`${x},${z}`) ? [] : [[x, z, THICK, THICK]]
        const arm = 0.5 - THICK / 2
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = tileAt(x + dx, z + dz)
          if (n !== 'wall' && n !== 'door') continue
          const off = THICK / 2 + arm / 2
          parts.push([x + dx * off, z + dz * off, dx ? arm : THICK, dz ? arm : THICK])
        }
        if (h === TALL) {
          const face = THICK / 2 + 0.025
          if (open(x, z + 1) || open(x + 1, z + 1) || open(x - 1, z + 1)) {
            if (x % 2) timber.push({ p: [x + 0.5, TALL / 2, z + face], s: [0.13, TALL, 0.06] })
            timber.push({ p: [x, 0.66, z + face], s: [1, 0.12, 0.06] })
          }
          if (open(x + 1, z) || open(x + 1, z + 1) || open(x + 1, z - 1)) {
            if (z % 2) timber.push({ p: [x + face, TALL / 2, z + 0.5], s: [0.06, TALL, 0.13] })
            timber.push({ p: [x + face, 0.66, z], s: [0.06, 0.12, 1] })
          }
        }
        for (const [cx, cz, sx, sz] of parts) {
          body.push({ p: [cx, h / 2, cz], s: [sx, h, sz] })
          cap.push({ p: [cx, h + 0.05, cz], s: [sx + 0.1, 0.12, sz + 0.1] })
          skirt.push({ p: [cx, 0.15, cz], s: [sx + 0.05, 0.3, sz + 0.05] })
        }
      }
    return { body, cap, skirt, timber, hedge, hedgeTop }
  }, [])
}

function Roof() {
  const indoor = ROOMS.filter((r) => !r.outdoor)
  const x1 = Math.max(...indoor.map((r) => r.x1)) + 1
  const z1 = Math.max(...indoor.map((r) => r.z1)) + 1
  const depth = 2.6
  const pitch = 0.6
  const drop = (Math.sin(pitch) * depth) / 2
  const run = (Math.cos(pitch) * depth) / 2
  const north = useMemo(() => new THREE.MeshToonMaterial({ map: shingleTexture((x1 + 2) / 2, 1.3), gradientMap: toonRamp }), [x1])
  const west = useMemo(() => new THREE.MeshToonMaterial({ map: shingleTexture((z1 + 2) / 2, 1.3), gradientMap: toonRamp }), [z1])
  return (
    <group>
      <mesh position={[x1 / 2 - 0.5, TALL + 0.32 - drop, 0.25 - run]} rotation-x={-pitch} material={north} castShadow>
        <boxGeometry args={[x1 + 2, 0.14, depth]} />
      </mesh>
      <group position={[0.25 - run, TALL + 0.32 - drop, z1 / 2 - 0.5]} rotation-y={Math.PI / 2}>
        <mesh rotation-x={-pitch} material={west} castShadow>
          <boxGeometry args={[z1 + 2, 0.14, depth]} />
        </mesh>
      </group>
      <mesh position={[x1 / 2 - 0.5, TALL + 0.32, 0.2]} material={toon(PAL.woodDark)}>
        <boxGeometry args={[x1 + 2.2, 0.2, 0.24]} />
      </mesh>
      <mesh position={[0.2, TALL + 0.32, z1 / 2 - 0.5]} material={toon(PAL.woodDark)}>
        <boxGeometry args={[0.24, 0.2, z1 + 2.2]} />
      </mesh>
    </group>
  )
}

function Floor({ room }: { room: Room }) {
  const w = room.x1 - room.x0 + 2
  const d = room.z1 - room.z0 + 2
  const mat = useMemo(
    () => new THREE.MeshToonMaterial({ map: floorTexture(room.floor, w, d), gradientMap: toonRamp }),
    [room.floor, w, d],
  )
  useFrame((_, dt) => {
    const target = useGame.getState().zone === room.id ? 1 : 0.74
    const v = THREE.MathUtils.damp(mat.color.r, target, 6, dt)
    mat.color.setScalar(v)
  })
  return (
    <mesh position={[(room.x0 + room.x1) / 2, 0, (room.z0 + room.z1) / 2]} rotation-x={-Math.PI / 2} material={mat} receiveShadow>
      <planeGeometry args={[w, d]} />
    </mesh>
  )
}

function Door({ x, z, locked = false }: { x: number; z: number; locked?: boolean }) {
  const leaf = useRef<THREE.Group>(null!)
  const alongX = tileAt(x - 1, z) !== 'floor' && tileAt(x + 1, z) !== 'floor'
  const zone = zoneAt(x, z - 1)
  const shut = useNet((s) => !!zone && !!s.closed[zone])
  useFrame((_, dt) => {
    const near = !locked && !shut && Math.hypot(player.x - x, player.z - z) < 1.9
    leaf.current.rotation.y = THREE.MathUtils.damp(leaf.current.rotation.y, near ? -1.9 : 0, 8, dt)
  })
  return (
    <group position={[x, 0, z]} rotation-y={alongX ? 0 : Math.PI / 2}>
      <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2} material={toon(PAL.wood)} receiveShadow>
        <planeGeometry args={[1, 1]} />
      </mesh>
      {[-0.46, 0.46].map((px) => (
        <mesh key={px} position={[px, 1, 0]} material={toon(PAL.woodDark)} castShadow>
          <boxGeometry args={[0.14, 2, 0.52]} />
        </mesh>
      ))}
      <mesh position={[0, 2.06, 0]} material={toon(PAL.woodDark)} castShadow>
        <boxGeometry args={[1.2, 0.2, 0.58]} />
      </mesh>
      <group ref={leaf} position={[-0.39, 0, 0]}>
        <mesh position={[0.39, 0.92, 0]} material={toon(locked || shut ? PAL.red : PAL.teal)} castShadow>
          <boxGeometry args={[0.78, 1.84, 0.1]} />
        </mesh>
        <mesh position={[0.66, 0.9, 0.08]} material={toon(PAL.brass)}>
          <sphereGeometry args={[0.06, 8, 6]} />
        </mesh>
      </group>
    </group>
  )
}

function DoorKnob({ x }: { x: number }) {
  return (
    <mesh position={[x, 0.95, 0.085]} material={toon(PAL.brass)}>
      <sphereGeometry args={[0.055, 8, 6]} />
    </mesh>
  )
}

function GardenDoubleEntrance() {
  const leftLeaf = useRef<THREE.Group>(null!)
  const rightLeaf = useRef<THREE.Group>(null!)
  const x = 24
  const z = 11.5

  useFrame((_, dt) => {
    const near = Math.hypot(player.x - x, player.z - z) < 2.4
    const angle = near ? 1.35 : 0
    leftLeaf.current.rotation.y = THREE.MathUtils.damp(leftLeaf.current.rotation.y, angle, 8, dt)
    rightLeaf.current.rotation.y = THREE.MathUtils.damp(rightLeaf.current.rotation.y, -angle, 8, dt)
  })

  const doorMaterial = toon('#8b5a3c')
  const frameMaterial = toon(PAL.woodDark)

  return (
    <group position={[x, 0, z]} rotation-y={Math.PI / 2}>
      <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2} material={toon(PAL.wood)} receiveShadow>
        <planeGeometry args={[2, 1]} />
      </mesh>

      {[-0.96, 0.96].map((px) => (
        <mesh key={px} position={[px, 1, 0]} material={frameMaterial} castShadow>
          <boxGeometry args={[0.14, 2, 0.52]} />
        </mesh>
      ))}

      <mesh position={[0, 2.06, 0]} material={frameMaterial} castShadow>
        <boxGeometry args={[2.2, 0.2, 0.58]} />
      </mesh>

      <group ref={leftLeaf} position={[-0.87, 0, 0]}>
        <mesh position={[0.435, 0.95, 0]} material={doorMaterial} castShadow>
          <boxGeometry args={[0.87, 1.9, 0.09]} />
        </mesh>
        <DoorKnob x={0.695} />
      </group>

      <group ref={rightLeaf} position={[0.87, 0, 0]}>
        <mesh position={[-0.435, 0.95, 0]} material={doorMaterial} castShadow>
          <boxGeometry args={[0.87, 1.9, 0.09]} />
        </mesh>
        <DoorKnob x={-0.695} />
      </group>
    </group>
  )
}

function WallDecor({ type }: { type: 'window' | 'stainedGlass' | 'mirror' }) {
  if (type === 'window')
    return (
      <group position={[0, 1.7, 0]}>
        <mesh material={toon(PAL.woodDark)}>
          <torusGeometry args={[0.36, 0.07, 8, 20]} />
        </mesh>
        <mesh material={glow('#cfefff', 1.25)}>
          <circleGeometry args={[0.34, 20]} />
        </mesh>
        <mesh position={[0, 0, 0.01]} material={toon(PAL.woodDark)}>
          <boxGeometry args={[0.7, 0.05, 0.03]} />
        </mesh>
        <mesh position={[0, 0, 0.01]} material={toon(PAL.woodDark)}>
          <boxGeometry args={[0.05, 0.7, 0.03]} />
        </mesh>
      </group>
    )
  if (type === 'mirror')
    return (
      <group position={[0, 1.55, 0]} scale={[1, 1.35, 1]}>
        <mesh material={toon(PAL.brass)}>
          <torusGeometry args={[0.36, 0.06, 8, 22]} />
        </mesh>
        <mesh material={glow('#9be8e0', 1.3)}>
          <circleGeometry args={[0.34, 22]} />
        </mesh>
      </group>
    )
  const panes = ['#ff8f6b', '#ffd45c', '#6bd0ff', '#8be07a', '#c79bff', '#ff9bc0']
  return (
    <group position={[0, 1.55, 0]}>
      <mesh material={toon(PAL.woodDark)}>
        <boxGeometry args={[0.84, 1.5, 0.06]} />
      </mesh>
      {panes.map((c, i) => (
        <mesh key={c} position={[(i % 2) * 0.36 - 0.18, Math.floor(i / 2) * 0.44 - 0.44, 0.035]} material={glow(c, 1.35)}>
          <planeGeometry args={[0.32, 0.4]} />
        </mesh>
      ))}
    </group>
  )
}

export function Building() {
  const walls = useWalls()
  const grass = useMemo(() => new THREE.MeshToonMaterial({ map: floorTexture('grass', 160, 160), gradientMap: toonRamp }), [])
  return (
    <group>
      <mesh position={[GRID_W / 2, -0.03, GRID_H / 2]} rotation-x={-Math.PI / 2} material={grass} receiveShadow>
        <planeGeometry args={[160, 160]} />
      </mesh>
      {ROOMS.map((r) => (
        <Floor key={r.id} room={r} />
      ))}
      <Boxes items={walls.body} color={PAL.plaster} />
      <Boxes items={walls.cap} color={PAL.woodDark} />
      <Boxes items={walls.skirt} color={PAL.stone} />
      <Boxes items={walls.timber} color={PAL.woodDark} />
      <Roof />
      <Boxes items={walls.hedge} color={PAL.hedge} />
      <Boxes items={walls.hedgeTop} color={PAL.leafLight} />
      {DOORS.filter((d) => !(d.x === 24 && (d.z === 11 || d.z === 12))).map((d) => (
        <Door key={`${d.x},${d.z}`} x={d.x} z={d.z} />
      ))}
      <GardenDoubleEntrance />
      {WALL_DECOR.map((d) =>
        d.type === 'frontDoor' ? (
          <Door key={`${d.x},${d.z}`} x={d.x} z={d.z} locked />
        ) : (
          <group
            key={`${d.x},${d.z}`}
            position={[d.x + (d.face === 'e' ? THICK / 2 + 0.015 : 0), 0, d.z + (d.face === 's' ? THICK / 2 + 0.015 : 0)]}
            rotation-y={d.face === 'e' ? Math.PI / 2 : 0}
          >
            <WallDecor type={d.type} />
          </group>
        ),
      )}
    </group>
  )
}

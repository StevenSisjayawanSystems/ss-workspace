import { useRef, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { FURNITURE, type FurnitureType } from '@guildhouse/shared'
import { useGame } from '../game'
import { PAL, glow, toon } from './toon'

type V3 = [number, number, number]

// Small primitives so each prop reads as a short list of parts.
const B = ({ s, p, c, r }: { s: V3; p: V3; c: string; r?: V3 }) => (
  <mesh position={p} rotation={r} material={toon(c)} castShadow receiveShadow>
    <boxGeometry args={s} />
  </mesh>
)
const C = ({ r, h, p, c, seg = 14, rot }: { r: number | [number, number]; h: number; p: V3; c: string; seg?: number; rot?: V3 }) => (
  <mesh position={p} rotation={rot} material={toon(c)} castShadow receiveShadow>
    <cylinderGeometry args={[typeof r === 'number' ? r : r[0], typeof r === 'number' ? r : r[1], h, seg]} />
  </mesh>
)
const S = ({ r, p, c, s }: { r: number; p: V3; c: string; s?: V3 }) => (
  <mesh position={p} scale={s} material={toon(c)} castShadow receiveShadow>
    <sphereGeometry args={[r, 14, 10]} />
  </mesh>
)
const G = ({ r, p, c, k = 1.8 }: { r: number; p: V3; c: string; k?: number }) => (
  <mesh position={p} material={glow(c, k)}>
    <sphereGeometry args={[r, 10, 8]} />
  </mesh>
)

const Legs = ({ w, d, h, c = PAL.woodDark }: { w: number; d: number; h: number; c?: string }) => (
  <>
    {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <B key={`${sx}${sz}`} s={[0.09, h, 0.09]} p={[(sx * w) / 2, h / 2, (sz * d) / 2]} c={c} />))}
  </>
)

const Stool = ({ p }: { p: V3 }) => (
  <group position={p}>
    <C r={0.2} h={0.08} p={[0, 0.36, 0]} c={PAL.red} />
    <C r={[0.1, 0.16]} h={0.34} p={[0, 0.17, 0]} c={PAL.woodDark} seg={8} />
  </group>
)

function Flicker({ children, speed = 9, amount = 0.12 }: { children: ReactNode; speed?: number; amount?: number }) {
  const ref = useRef<THREE.Group>(null!)
  const seed = useRef(Math.random() * 10)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed + seed.current
    ref.current.scale.setScalar(1 + Math.sin(t) * amount * 0.6 + Math.sin(t * 2.7) * amount * 0.4)
  })
  return <group ref={ref}>{children}</group>
}

function Sway({ children, amount = 0.04 }: { children: ReactNode; amount?: number }) {
  const ref = useRef<THREE.Group>(null!)
  const seed = useRef(Math.random() * 10)
  useFrame(({ clock }) => {
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 1.3 + seed.current) * amount
    ref.current.rotation.x = Math.cos(clock.elapsedTime * 1.1 + seed.current) * amount * 0.6
  })
  return <group ref={ref}>{children}</group>
}

const BOOKS = [PAL.red, PAL.teal, PAL.blue, PAL.brass, PAL.purple, PAL.green]
const BookRow = ({ y, w, d, seed }: { y: number; w: number; d: number; seed: number }) => (
  <>
    {[0, 1, 2, 3, 4].map((i) => (
      <B key={i} s={[w / 5 - 0.03, 0.3 - ((i + seed) % 3) * 0.04, d]} p={[-w / 2 + (i + 0.5) * (w / 5), y + 0.15 - ((i + seed) % 3) * 0.02, 0.04]} c={BOOKS[(i * 2 + seed) % BOOKS.length]} />
    ))}
  </>
)

const PIECES: Record<FurnitureType, () => ReactNode> = {
  desk: () => (
    <>
      <B s={[1.8, 0.09, 0.82]} p={[0, 0.62, 0]} c={PAL.wood} />
      <Legs w={1.6} d={0.62} h={0.6} />
      <B s={[0.5, 0.42, 0.34]} p={[-0.6, 0.36, -0.1]} c={PAL.woodLight} />
      {/* scrying slate: this world's monitor */}
      <B s={[0.7, 0.44, 0.05]} p={[0.1, 0.96, -0.24]} c={PAL.woodDark} r={[-0.12, 0, 0]} />
      <mesh position={[0.1, 0.96, -0.208]} rotation={[-0.12, 0, 0]} material={glow('#bfeee6', 1.15)}>
        <planeGeometry args={[0.6, 0.34]} />
      </mesh>
      <B s={[0.12, 0.14, 0.12]} p={[0.1, 0.72, -0.26]} c={PAL.woodDark} />
      <B s={[0.34, 0.05, 0.26]} p={[-0.5, 0.69, 0.1]} c={PAL.red} r={[0, 0.3, 0]} />
      <B s={[0.3, 0.04, 0.22]} p={[-0.5, 0.735, 0.1]} c={PAL.parchment} r={[0, 0.3, 0]} />
      <C r={0.06} h={0.12} p={[0.68, 0.72, 0.12]} c={PAL.cream} />
    </>
  ),
  chair: () => (
    <>
      <B s={[0.46, 0.08, 0.46]} p={[0, 0.38, 0]} c={PAL.red} />
      <Legs w={0.36} d={0.36} h={0.36} />
      <B s={[0.46, 0.5, 0.08]} p={[0, 0.66, -0.2]} c={PAL.wood} />
    </>
  ),
  bookshelf: () => (
    <>
      <B s={[1.92, 1.8, 0.5]} p={[0, 0.9, -0.1]} c={PAL.woodDark} />
      <B s={[2, 0.1, 0.6]} p={[0, 1.84, -0.1]} c={PAL.wood} />
      {[0.14, 0.7, 1.26].map((y, i) => (
        <group key={y} position={[0, 0, 0.12]}>
          <B s={[1.76, 0.44, 0.1]} p={[0, y + 0.22, -0.02]} c={PAL.ink} />
          <BookRow y={y} w={1.7} d={0.14} seed={i} />
        </group>
      ))}
    </>
  ),
  shelfLow: () => (
    <>
      <B s={[1.92, 0.9, 0.6]} p={[0, 0.45, 0]} c={PAL.woodDark} />
      <B s={[2, 0.08, 0.7]} p={[0, 0.93, 0]} c={PAL.wood} />
      <group position={[0, 0, 0.27]}>
        <BookRow y={0.3} w={1.7} d={0.12} seed={1} />
      </group>
      <group position={[0, 0, -0.27]} rotation-y={Math.PI}>
        <BookRow y={0.3} w={1.7} d={0.12} seed={2} />
      </group>
      <G r={0.09} p={[0.5, 1.08, 0]} c="#ffd98a" />
      <C r={0.05} h={0.12} p={[0.5, 1.0, 0]} c={PAL.brass} seg={8} />
    </>
  ),
  nookDesk: () => (
    <>
      <B s={[0.9, 0.08, 0.7]} p={[0, 0.58, -0.1]} c={PAL.wood} />
      <Legs w={0.74} d={0.54} h={0.56} />
      <B s={[0.4, 0.05, 0.3]} p={[-0.1, 0.65, -0.1]} c={PAL.parchment} r={[0, 0.2, 0]} />
      <C r={0.04} h={0.16} p={[0.3, 0.7, -0.25]} c={PAL.cream} seg={8} />
      <Flicker>
        <G r={0.05} p={[0.3, 0.83, -0.25]} c="#ffc36b" />
      </Flicker>
    </>
  ),
  armchair: () => (
    <>
      <B s={[0.8, 0.36, 0.76]} p={[0, 0.22, 0]} c={PAL.teal} />
      <B s={[0.8, 0.6, 0.2]} p={[0, 0.6, -0.3]} c={PAL.teal} />
      <B s={[0.16, 0.3, 0.7]} p={[-0.36, 0.5, 0.02]} c={PAL.teal} />
      <B s={[0.16, 0.3, 0.7]} p={[0.36, 0.5, 0.02]} c={PAL.teal} />
      <B s={[0.5, 0.1, 0.5]} p={[0, 0.44, 0.06]} c={PAL.cream} />
    </>
  ),
  sofa: () => (
    <>
      <B s={[1.86, 0.36, 0.78]} p={[0, 0.22, 0]} c={PAL.red} />
      <B s={[1.86, 0.56, 0.2]} p={[0, 0.6, -0.3]} c={PAL.red} />
      <B s={[0.18, 0.3, 0.74]} p={[-0.86, 0.5, 0.02]} c={PAL.red} />
      <B s={[0.18, 0.3, 0.74]} p={[0.86, 0.5, 0.02]} c={PAL.red} />
      <B s={[0.7, 0.1, 0.5]} p={[-0.4, 0.44, 0.06]} c={PAL.cream} />
      <B s={[0.7, 0.1, 0.5]} p={[0.4, 0.44, 0.06]} c={PAL.cream} />
    </>
  ),
  roundTable: () => (
    <>
      <C r={1.25} h={0.1} p={[0, 0.62, 0]} c={PAL.wood} seg={28} />
      <C r={1.05} h={0.02} p={[0, 0.68, 0]} c={PAL.woodLight} seg={28} />
      <C r={[0.2, 0.42]} h={0.6} p={[0, 0.3, 0]} c={PAL.woodDark} />
      <C r={0.12} h={0.06} p={[0, 0.72, 0]} c={PAL.brass} />
      <Flicker speed={2} amount={0.08}>
        <G r={0.14} p={[0, 0.9, 0]} c="#9be8e0" k={1.5} />
      </Flicker>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6
        return <Stool key={i} p={[Math.cos(a) * 1.72, 0, Math.sin(a) * 1.72]} />
      })}
    </>
  ),
  table: () => (
    <>
      <C r={0.82} h={0.09} p={[0, 0.6, 0]} c={PAL.wood} seg={22} />
      <C r={[0.14, 0.3]} h={0.58} p={[0, 0.29, 0]} c={PAL.woodDark} />
      <C r={0.08} h={0.14} p={[0.25, 0.71, 0.1]} c={PAL.cream} />
      <C r={0.08} h={0.14} p={[-0.2, 0.71, -0.2]} c={PAL.brass} />
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        return <Stool key={i} p={[Math.cos(a) * 1.18, 0, Math.sin(a) * 1.18]} />
      })}
    </>
  ),
  counter: () => (
    <>
      <B s={[3.9, 0.8, 0.8]} p={[0, 0.4, -0.05]} c={PAL.woodLight} />
      <B s={[4, 0.1, 0.92]} p={[0, 0.85, -0.03]} c={PAL.stone} />
      {[-1.45, -0.48, 0.48, 1.45].map((x) => (
        <B key={x} s={[0.8, 0.56, 0.04]} p={[x, 0.42, 0.36]} c={PAL.wood} />
      ))}
      <C r={[0.1, 0.16]} h={0.22} p={[-1.3, 1.01, 0]} c={PAL.blue} />
      <S r={0.07} p={[-1.3, 1.15, 0]} c={PAL.brass} />
      <C r={0.07} h={0.12} p={[-0.7, 0.96, 0.1]} c={PAL.cream} />
      <C r={0.07} h={0.12} p={[-0.45, 0.96, -0.05]} c={PAL.cream} />
      <C r={0.2} h={0.05} p={[0.5, 0.93, 0]} c={PAL.cream} />
      <S r={0.1} p={[0.44, 1.02, 0]} c={PAL.red} />
      <S r={0.1} p={[0.6, 1.02, 0.04]} c={PAL.green} />
      <B s={[0.5, 0.2, 0.3]} p={[1.4, 1.0, 0]} c={PAL.wood} />
      <S r={0.16} p={[1.4, 1.14, 0]} c={PAL.woodLight} s={[1.3, 0.8, 1]} />
    </>
  ),
  stove: () => (
    <>
      <B s={[0.9, 0.8, 0.8]} p={[0, 0.4, -0.05]} c={PAL.ink} />
      <B s={[0.96, 0.08, 0.86]} p={[0, 0.84, -0.05]} c={PAL.stoneDark} />
      <mesh position={[0, 0.36, 0.36]} material={glow('#ff9a4a', 1.6)}>
        <planeGeometry args={[0.5, 0.3]} />
      </mesh>
      <C r={0.22} h={0.26} p={[0, 1.01, -0.05]} c={PAL.brass} />
      <C r={0.24} h={0.04} p={[0, 1.16, -0.05]} c={PAL.stoneDark} />
      <C r={0.12} h={1.4} p={[0, 1.5, -0.32]} c={PAL.ink} seg={8} />
    </>
  ),
  reception: () => (
    <>
      <B s={[2.8, 0.9, 0.7]} p={[0, 0.45, 0]} c={PAL.wood} />
      <B s={[2.96, 0.1, 0.86]} p={[0, 0.95, 0]} c={PAL.woodDark} />
      <B s={[2.5, 0.5, 0.04]} p={[0, 0.5, 0.36]} c={PAL.teal} />
      <C r={0.2} h={0.03} p={[0, 0.5, 0.385]} c={PAL.brass} rot={[Math.PI / 2, 0, 0]} />
      <B s={[0.5, 0.06, 0.36]} p={[-0.8, 1.03, 0]} c={PAL.parchment} r={[0, 0.2, 0]} />
      <C r={0.09} h={0.05} p={[0.9, 1.02, 0.1]} c={PAL.brass} />
      <S r={0.08} p={[0.9, 1.08, 0.1]} c={PAL.brass} />
      <Flicker speed={2} amount={0.06}>
        <G r={0.12} p={[0.2, 1.22, -0.1]} c="#ffd98a" k={1.5} />
      </Flicker>
      <C r={0.06} h={0.14} p={[0.2, 1.07, -0.1]} c={PAL.brass} seg={8} />
    </>
  ),
  noticeBoard: () => (
    <>
      <B s={[0.1, 1.7, 0.1]} p={[-0.8, 0.85, -0.2]} c={PAL.woodDark} />
      <B s={[0.1, 1.7, 0.1]} p={[0.8, 0.85, -0.2]} c={PAL.woodDark} />
      <B s={[1.8, 1.0, 0.08]} p={[0, 1.15, -0.2]} c={PAL.wood} />
      <B s={[1.6, 0.82, 0.02]} p={[0, 1.15, -0.15]} c="#c79a63" />
      <B s={[0.4, 0.5, 0.02]} p={[-0.5, 1.2, -0.13]} c={PAL.parchment} r={[0, 0, 0.06]} />
      <B s={[0.36, 0.3, 0.02]} p={[0, 1.3, -0.13]} c={PAL.cream} r={[0, 0, -0.08]} />
      <B s={[0.4, 0.44, 0.02]} p={[0.5, 1.14, -0.13]} c="#f7c9a8" r={[0, 0, 0.04]} />
      <B s={[0.3, 0.2, 0.02]} p={[0.02, 0.96, -0.13]} c="#cfe6c0" r={[0, 0, 0.1]} />
      <B s={[2, 0.14, 0.3]} p={[0, 1.74, -0.2]} c={PAL.red} />
    </>
  ),
  bench: () => (
    <>
      <B s={[1.8, 0.08, 0.5]} p={[0, 0.4, 0]} c={PAL.wood} />
      <Legs w={1.6} d={0.36} h={0.38} />
      <B s={[1.8, 0.34, 0.07]} p={[0, 0.72, -0.22]} c={PAL.wood} />
      <B s={[0.08, 0.5, 0.08]} p={[-0.8, 0.62, -0.22]} c={PAL.woodDark} />
      <B s={[0.08, 0.5, 0.08]} p={[0.8, 0.62, -0.22]} c={PAL.woodDark} />
    </>
  ),
  hearth: () => (
    <>
      <B s={[2, 1.5, 0.8]} p={[0, 0.75, -0.1]} c={PAL.stone} />
      <B s={[2.2, 0.14, 0.96]} p={[0, 1.56, -0.08]} c={PAL.woodDark} />
      <B s={[1.2, 1.2, 0.7]} p={[0, 2.2, -0.14]} c={PAL.stoneDark} />
      <B s={[1.1, 0.8, 0.1]} p={[0, 0.5, 0.26]} c={PAL.ink} />
      <B s={[2.1, 0.1, 0.4]} p={[0, 0.05, 0.42]} c={PAL.stoneDark} />
      <C r={0.07} h={0.8} p={[0, 0.16, 0.36]} c={PAL.woodDark} rot={[0, 0, Math.PI / 2]} seg={8} />
      <group position={[0, 0.2, 0.36]}>
        <Flicker amount={0.2}>
          <mesh position={[0, 0.2, 0]} material={glow('#ff8a3c', 2.2)}>
            <coneGeometry args={[0.24, 0.5, 8]} />
          </mesh>
          <mesh position={[0.02, 0.14, 0.04]} material={glow('#ffe08a', 2.4)}>
            <coneGeometry args={[0.13, 0.3, 8]} />
          </mesh>
        </Flicker>
      </group>
      <pointLight position={[0, 0.7, 1]} color="#ffb066" intensity={5} distance={7} decay={1.6} />
      <S r={0.1} p={[-0.7, 1.72, 0]} c={PAL.brass} />
      <B s={[0.3, 0.24, 0.06]} p={[0.5, 1.75, 0]} c={PAL.parchment} />
    </>
  ),
  gramophone: () => (
    <>
      <B s={[0.8, 0.6, 0.8]} p={[0, 0.3, 0]} c={PAL.woodDark} />
      <B s={[0.86, 0.06, 0.86]} p={[0, 0.63, 0]} c={PAL.wood} />
      <B s={[0.56, 0.16, 0.56]} p={[0, 0.74, 0]} c={PAL.red} />
      <C r={0.24} h={0.03} p={[0, 0.84, 0]} c={PAL.ink} seg={20} />
      <C r={0.07} h={0.035} p={[0, 0.845, 0]} c={PAL.brass} />
      <C r={0.03} h={0.5} p={[-0.2, 1.05, -0.2]} c={PAL.brass} seg={8} rot={[0.3, 0, 0.3]} />
      <mesh position={[0.02, 1.36, 0.02]} rotation={[0.9, 0, -0.75]} material={toon(PAL.brass)} castShadow>
        <coneGeometry args={[0.38, 0.6, 16, 1, true]} />
      </mesh>
      <Bob>
        <G r={0.06} p={[0.45, 1.5, 0.3]} c="#ffd98a" />
        <G r={0.045} p={[0.62, 1.78, 0.42]} c="#9be8e0" />
        <G r={0.035} p={[0.4, 1.98, 0.5]} c="#ffb0d0" />
      </Bob>
    </>
  ),
  barrel: () => (
    <>
      <C r={[0.32, 0.32]} h={0.8} p={[0, 0.4, 0]} c={PAL.wood} />
      <C r={0.345} h={0.07} p={[0, 0.16, 0]} c={PAL.stoneDark} />
      <C r={0.345} h={0.07} p={[0, 0.64, 0]} c={PAL.stoneDark} />
      <C r={0.28} h={0.02} p={[0, 0.81, 0]} c={PAL.woodLight} />
    </>
  ),
  crate: () => (
    <>
      <B s={[0.7, 0.6, 0.7]} p={[0, 0.3, 0]} c={PAL.woodLight} />
      <B s={[0.74, 0.08, 0.74]} p={[0, 0.6, 0]} c={PAL.wood} />
      <S r={0.13} p={[-0.12, 0.72, 0.05]} c={PAL.red} />
      <S r={0.13} p={[0.12, 0.72, -0.08]} c={PAL.brass} />
      <S r={0.12} p={[0.05, 0.74, 0.16]} c={PAL.green} />
    </>
  ),
  plant: () => (
    <>
      <C r={[0.26, 0.18]} h={0.36} p={[0, 0.18, 0]} c="#c9764f" />
      <C r={0.28} h={0.06} p={[0, 0.36, 0]} c="#b5633f" />
      <Sway>
        <S r={0.3} p={[0, 0.72, 0]} c={PAL.leaf} s={[1, 1.2, 1]} />
        <S r={0.22} p={[0.2, 0.96, 0.08]} c={PAL.leafLight} />
        <S r={0.2} p={[-0.18, 0.9, -0.1]} c={PAL.green} />
        <S r={0.16} p={[0, 1.14, 0]} c={PAL.leafLight} />
      </Sway>
    </>
  ),
  lantern: () => (
    <>
      <C r={[0.1, 0.18]} h={0.14} p={[0, 0.07, 0]} c={PAL.stoneDark} seg={8} />
      <C r={0.045} h={1.5} p={[0, 0.82, 0]} c={PAL.ink} seg={8} />
      <B s={[0.3, 0.05, 0.3]} p={[0, 1.58, 0]} c={PAL.ink} />
      <mesh position={[0, 1.76, 0]} material={glow('#ffd98a', 1.7)}>
        <boxGeometry args={[0.22, 0.3, 0.22]} />
      </mesh>
      <mesh position={[0, 2.0, 0]} material={toon(PAL.ink)} castShadow>
        <coneGeometry args={[0.24, 0.2, 4]} />
      </mesh>
    </>
  ),
  tree: () => (
    <>
      <C r={[0.17, 0.3]} h={1.5} p={[0, 0.75, 0]} c={PAL.woodDark} seg={8} />
      <C r={[0.07, 0.12]} h={0.8} p={[0.3, 1.5, 0.1]} c={PAL.woodDark} seg={6} rot={[0, 0, -0.7]} />
      <Sway amount={0.022}>
        {/* shaded underside, body, then sunlit crowns: three tones read as painted foliage */}
        <S r={0.95} p={[0, 1.95, 0]} c={PAL.leafDeep} s={[1.25, 0.8, 1.25]} />
        <S r={0.8} p={[-0.5, 2.3, 0.25]} c={PAL.leaf} />
        <S r={0.78} p={[0.55, 2.35, -0.1]} c={PAL.leaf} />
        <S r={0.7} p={[0.1, 2.5, 0.5]} c={PAL.green} />
        <S r={0.62} p={[-0.2, 2.85, -0.2]} c={PAL.green} />
        <S r={0.5} p={[0.45, 2.95, 0.2]} c={PAL.leafLight} />
        <S r={0.42} p={[-0.45, 3.0, 0.25]} c={PAL.leafLight} />
        <S r={0.3} p={[0.05, 3.3, 0.1]} c={PAL.leafGlow} />
        <S r={0.22} p={[0.75, 2.75, 0.3]} c={PAL.leafGlow} />
        <G r={0.09} p={[0.6, 1.45, 0.55]} c="#ffd98a" />
        <G r={0.07} p={[-0.65, 1.55, 0.4]} c="#ffc0e0" />
      </Sway>
    </>
  ),
  pond: () => (
    <>
      <C r={1.45} h={0.1} p={[0, 0.03, 0]} c={PAL.stone} seg={20} />
      <mesh position={[0, 0.09, 0]} rotation-x={-Math.PI / 2} material={toon(PAL.water)}>
        <circleGeometry args={[1.25, 28]} />
      </mesh>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
        const a = (i / 9) * Math.PI * 2
        return <S key={i} r={0.2 + (i % 3) * 0.04} p={[Math.cos(a) * 1.36, 0.1, Math.sin(a) * 1.36]} c={i % 2 ? PAL.stone : PAL.stoneDark} s={[1, 0.6, 1]} />
      })}
      <C r={0.2} h={0.02} p={[0.4, 0.105, 0.3]} c={PAL.leafLight} />
      <C r={0.16} h={0.02} p={[-0.5, 0.105, -0.2]} c={PAL.leaf} />
      <C r={0.13} h={0.02} p={[0.1, 0.105, -0.6]} c={PAL.leafLight} />
      <S r={0.07} p={[0.4, 0.16, 0.3]} c="#ffb0d0" />
    </>
  ),
  picnic: () => (
    <>
      <B s={[1.7, 0.08, 0.9]} p={[0, 0.6, 0]} c={PAL.woodLight} />
      <Legs w={1.4} d={0.6} h={0.58} />
      <B s={[1.7, 0.07, 0.34]} p={[0, 0.36, 0.78]} c={PAL.wood} />
      <B s={[1.7, 0.07, 0.34]} p={[0, 0.36, -0.78]} c={PAL.wood} />
      <B s={[0.5, 0.02, 0.5]} p={[0, 0.65, 0]} c={PAL.red} r={[0, 0.5, 0]} />
      <C r={0.14} h={0.16} p={[0, 0.74, 0]} c={PAL.woodLight} />
    </>
  ),
  flowers: () => (
    <>
      {[
        [0.2, 0.1, '#ff8fb0'], [-0.25, 0.25, '#ffd45c'], [0.05, -0.28, '#fff'], [-0.3, -0.15, '#c79bff'], [0.34, -0.2, '#ff8f6b'],
      ].map(([x, z, c], i) => (
        <group key={i} position={[x as number, 0, z as number]}>
          <C r={0.015} h={0.2} p={[0, 0.1, 0]} c={PAL.leaf} seg={5} />
          <S r={0.09} p={[0, 0.24, 0]} c={c as string} />
        </group>
      ))}
    </>
  ),
  rug: () => (
    <>
      <C r={1.3} h={0.02} p={[0, 0.012, 0]} c={PAL.red} seg={28} />
      <C r={1.05} h={0.02} p={[0, 0.018, 0]} c={PAL.parchment} seg={28} />
      <C r={0.8} h={0.02} p={[0, 0.024, 0]} c={PAL.teal} seg={28} />
    </>
  ),
  meditationCircle: () => (
    <>
      {/* a ring of raked ground, a standing stone with a soft light, and six cushions */}
      <C r={2.5} h={0.02} p={[0, 0.012, 0]} c="#d9cfae" seg={36} />
      <C r={2.15} h={0.02} p={[0, 0.016, 0]} c="#cbbf9c" seg={36} />
      <C r={1.0} h={0.02} p={[0, 0.02, 0]} c="#d9cfae" seg={28} />
      <S r={0.34} p={[0, 0.3, 0]} c={PAL.stoneDark} s={[1, 1.5, 0.9]} />
      <S r={0.2} p={[0.28, 0.14, 0.18]} c={PAL.stone} s={[1.2, 0.8, 1]} />
      <S r={0.16} p={[-0.3, 0.1, -0.1]} c={PAL.moss} s={[1.3, 0.6, 1.1]} />
      <Bob>
        <G r={0.07} p={[0, 0.98, 0]} c="#bfeee6" k={1.6} />
        <G r={0.04} p={[0.3, 1.25, 0.1]} c="#ffd98a" />
        <G r={0.035} p={[-0.25, 1.4, -0.15]} c="#bfeee6" />
      </Bob>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6
        return (
          <group key={i} position={[Math.cos(a) * 1.65, 0, Math.sin(a) * 1.65]}>
            <S r={0.34} p={[0, 0.07, 0]} c={i % 2 ? PAL.purple : PAL.teal} s={[1, 0.28, 1]} />
          </group>
        )
      })}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = (i / 8) * Math.PI * 2
        return <S key={i} r={0.13} p={[Math.cos(a) * 2.5, 0.06, Math.sin(a) * 2.5]} c={i % 2 ? PAL.stone : PAL.stoneDark} s={[1.2, 0.7, 1]} />
      })}
    </>
  ),
  rugLong: () => (
    <>
      <B s={[20, 0.02, 1.5]} p={[0, 0.012, 0]} c={PAL.red} />
      <B s={[19.6, 0.02, 1.1]} p={[0, 0.018, 0]} c="#e0b98a" />
    </>
  ),
}

function Bob({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null!)
  useFrame(({ clock }) => {
    ref.current.position.y = Math.sin(clock.elapsedTime * 2) * 0.06
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.8) * 0.3
  })
  return <group ref={ref}>{children}</group>
}

export const Bush = () => (
  <Sway amount={0.02}>
    <S r={0.55} p={[0, 0.35, 0]} c={PAL.leafDeep} s={[1.3, 0.8, 1.2]} />
    <S r={0.42} p={[-0.3, 0.6, 0.1]} c={PAL.leaf} />
    <S r={0.4} p={[0.32, 0.62, -0.05]} c={PAL.green} />
    <S r={0.28} p={[0.02, 0.85, 0.1]} c={PAL.leafLight} />
    <S r={0.07} p={[0.35, 0.8, 0.3]} c="#ff9fc0" />
    <S r={0.06} p={[-0.3, 0.85, 0.35]} c="#fff" />
  </Sway>
)

export const Rock = () => (
  <>
    <S r={0.6} p={[0, 0.3, 0]} c={PAL.stone} s={[1.3, 0.9, 1]} />
    <S r={0.4} p={[0.5, 0.2, 0.3]} c={PAL.stoneDark} s={[1.2, 0.8, 1]} />
    <S r={0.36} p={[-0.1, 0.62, 0]} c={PAL.moss} s={[1.5, 0.45, 1.2]} />
  </>
)

export function Piece({ type }: { type: FurnitureType }) {
  return <>{PIECES[type]()}</>
}

const openJukebox = (e: ThreeEvent<MouseEvent>) => {
  e.stopPropagation()
  useGame.getState().setJukeOpen(true)
}

const openBoard = (e: ThreeEvent<MouseEvent>) => {
  e.stopPropagation()
  useGame.setState({ boardOpen: true })
}
// Things you can click say so with the cursor.
const pointer = () => {
  document.body.style.cursor = 'pointer'
}
const unpointer = () => {
  document.body.style.cursor = ''
}

export function FurnitureLayer() {
  return (
    <group>
      {FURNITURE.map((f, i) => (
        <group
          key={i}
          position={[f.x, 0, f.z]}
          rotation-y={((f.rot ?? 0) * Math.PI) / 2}
          onClick={f.type === 'gramophone' ? openJukebox : f.type === 'noticeBoard' ? openBoard : undefined}
          onPointerOver={f.type === 'gramophone' || f.type === 'noticeBoard' ? pointer : undefined}
          onPointerOut={f.type === 'gramophone' || f.type === 'noticeBoard' ? unpointer : undefined}
        >
          <Piece type={f.type} />
        </group>
      ))}
    </group>
  )
}

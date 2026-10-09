import { useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { BEDS, BED_CAPACITY, BED_DEPTH, BED_WIDTH, bedOf, formatDuration, type GardenPlant, type Species } from '@guildhouse/shared'
import { useGame } from '../game'
import { seedOf, useNet } from '../net/net'
import { B, C, G, S, Sway } from './Furniture'
import { Label } from './Label'
import { PAL } from './toon'

// Each species is a small sculpture of primitives, drawn at full size; growth scales it up from a sprout.
const SHAPES: Record<Species, () => React.JSX.Element> = {
  oak: () => (
    <>
      <C r={[0.07, 0.11]} h={0.6} p={[0, 0.3, 0]} c={PAL.woodDark} seg={7} />
      <S r={0.42} p={[0, 0.85, 0]} c={PAL.leafDeep} s={[1.2, 0.85, 1.2]} />
      <S r={0.32} p={[-0.18, 1.02, 0.1]} c={PAL.leaf} />
      <S r={0.3} p={[0.2, 1.05, -0.05]} c={PAL.green} />
      <S r={0.2} p={[0.02, 1.25, 0.05]} c={PAL.leafLight} />
    </>
  ),
  blossom: () => (
    <>
      <C r={[0.05, 0.09]} h={0.62} p={[0, 0.31, 0]} c="#5a3b33" seg={7} />
      <C r={[0.03, 0.045]} h={0.35} p={[0.14, 0.62, 0]} c="#5a3b33" seg={6} rot={[0, 0, -0.8]} />
      <S r={0.34} p={[0, 0.95, 0]} c="#f2a7c0" s={[1.2, 0.9, 1.2]} />
      <S r={0.26} p={[0.28, 0.85, 0.05]} c="#f7c2d4" />
      <S r={0.24} p={[-0.24, 1.0, -0.05]} c="#ee8fb0" />
      <S r={0.17} p={[0.03, 1.2, 0.08]} c="#fbe0ea" />
    </>
  ),
  pine: () => (
    <>
      <C r={[0.06, 0.08]} h={0.35} p={[0, 0.17, 0]} c={PAL.woodDark} seg={7} />
      <C r={[0.02, 0.42]} h={0.5} p={[0, 0.52, 0]} c="#2f6a48" seg={9} />
      <C r={[0.02, 0.33]} h={0.45} p={[0, 0.84, 0]} c="#387a52" seg={9} />
      <C r={[0.0, 0.23]} h={0.42} p={[0, 1.13, 0]} c="#44895c" seg={9} />
    </>
  ),
  sunflower: () => (
    <>
      <C r={0.03} h={0.95} p={[0, 0.47, 0]} c={PAL.leaf} seg={6} />
      <S r={0.13} p={[0.12, 0.42, 0]} c={PAL.green} s={[1.4, 0.3, 0.8]} />
      <S r={0.12} p={[-0.11, 0.62, 0]} c={PAL.green} s={[1.4, 0.3, 0.8]} />
      <C r={0.24} h={0.05} p={[0, 0.98, 0.06]} c="#f2c230" seg={12} rot={[1.15, 0, 0]} />
      <C r={0.12} h={0.07} p={[0, 0.985, 0.075]} c="#6b4226" seg={10} rot={[1.15, 0, 0]} />
    </>
  ),
  tulips: () => (
    <>
      {(
        [
          [-0.18, 0, '#e0603f'],
          [0.02, 0.1, '#f2c230'],
          [0.2, -0.04, '#d9709a'],
          [-0.04, -0.14, '#f08a5a'],
        ] as [number, number, string][]
      ).map(([x, z, c], i) => (
        <group key={i} position={[x, 0, z]}>
          <C r={0.02} h={0.42 + i * 0.04} p={[0, 0.21 + i * 0.02, 0]} c={PAL.leaf} seg={5} />
          <S r={0.085} p={[0, 0.46 + i * 0.04, 0]} c={c} s={[1, 1.35, 1]} />
          <S r={0.07} p={[0.06, 0.16, 0]} c={PAL.green} s={[0.5, 1.6, 0.3]} />
        </group>
      ))}
    </>
  ),
  lavender: () => (
    <>
      <S r={0.26} p={[0, 0.2, 0]} c="#5f8f5a" s={[1.2, 0.8, 1.2]} />
      {[-0.2, -0.07, 0.07, 0.2, 0, -0.13, 0.13].map((x, i) => (
        <C key={i} r={[0.025, 0.04]} h={0.34} p={[x, 0.52 + (i % 3) * 0.05, ((i * 37) % 20) / 100 - 0.1]} c={i % 2 ? '#8f78c8' : '#a48fe0'} seg={5} />
      ))}
    </>
  ),
  mushroom: () => (
    <>
      <C r={[0.07, 0.1]} h={0.36} p={[0, 0.18, 0]} c="#f1e6cf" seg={8} />
      <S r={0.27} p={[0, 0.4, 0]} c="#c8463a" s={[1, 0.62, 1]} />
      <S r={0.045} p={[0.12, 0.52, 0.1]} c="#fff6e6" />
      <S r={0.04} p={[-0.12, 0.5, 0.06]} c="#fff6e6" />
      <S r={0.035} p={[0.0, 0.56, -0.1]} c="#fff6e6" />
      <C r={[0.04, 0.055]} h={0.2} p={[0.26, 0.1, 0.1]} c="#f1e6cf" seg={7} />
      <S r={0.14} p={[0.26, 0.22, 0.1]} c="#d9603f" s={[1, 0.62, 1]} />
      <G r={0.03} p={[-0.2, 0.3, 0.16]} c="#bfeee6" />
    </>
  ),
  bamboo: () => (
    <>
      {(
        [
          [-0.12, 0, 1.25],
          [0.06, 0.08, 1.05],
          [0.16, -0.08, 0.85],
        ] as [number, number, number][]
      ).map(([x, z, h], i) => (
        <group key={i} position={[x, 0, z]}>
          <C r={0.04} h={h} p={[0, h / 2, 0]} c="#7fae4a" seg={6} />
          {[0.3, 0.6, 0.9].filter((y) => y < h).map((y) => (
            <C key={y} r={0.047} h={0.025} p={[0, y, 0]} c="#5f8f3a" seg={6} />
          ))}
          <S r={0.13} p={[0.1, h - 0.1, 0]} c={PAL.leafLight} s={[1.5, 0.3, 0.7]} />
          <S r={0.12} p={[-0.09, h - 0.24, 0.03]} c={PAL.green} s={[1.5, 0.3, 0.7]} />
        </group>
      ))}
    </>
  ),
}

function Plant({ plant }: { plant: GardenPlant }) {
  const Shape = SHAPES[plant.species]
  // The first hour or so is a seedling: two leaves on a stem, whatever it will become.
  if (plant.growth < 0.05)
    return (
      <>
        <C r={0.015} h={0.14} p={[0, 0.07, 0]} c={PAL.leaf} seg={5} />
        <S r={0.06} p={[0.05, 0.15, 0]} c={PAL.leafLight} s={[1.3, 0.35, 0.8]} />
        <S r={0.06} p={[-0.05, 0.15, 0]} c={PAL.leafLight} s={[1.3, 0.35, 0.8]} />
      </>
    )
  // Finished plants stand a little larger than life so the bed reads from across the garden.
  const size = plant.growth >= 1 ? 1.25 : 0.32 + plant.growth * 0.7
  return (
    <group scale={size}>
      <Sway amount={0.02}>
        <Shape />
      </Sway>
    </group>
  )
}

function Bed({ x, z, name, seed, seconds }: { x: number; z: number; name: string; seed: string; seconds: number }) {
  const inGarden = useGame((s) => s.zone === 'focusGarden')
  const [hover, setHover] = useState(false)
  const bed = bedOf(seed, seconds)
  const step = (BED_WIDTH - 0.5) / BED_CAPACITY
  const caption = `${name} · ${bed.grown} grown · ${formatDuration(seconds)} of focus`

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHover(true)
  }

  return (
    <group position={[x, 0, z]}>
      {/* soil with a low timber edge */}
      <B s={[BED_WIDTH, 0.12, BED_DEPTH]} p={[0, 0.06, 0]} c={PAL.woodDark} />
      <B s={[BED_WIDTH - 0.16, 0.06, BED_DEPTH - 0.16]} p={[0, 0.12, 0]} c="#5b4030" />
      {bed.plants.map((plant, i) => (
        <group key={`${plant.species}-${i + bed.hidden}`} position={[-BED_WIDTH / 2 + 0.25 + step * (i + 0.5), 0.14, i % 2 ? 0.28 : -0.28]}>
          <Plant plant={plant} />
        </group>
      ))}
      {/* name stake at the front corner */}
      <B s={[0.05, 0.42, 0.05]} p={[-BED_WIDTH / 2 + 0.22, 0.3, BED_DEPTH / 2 + 0.12]} c={PAL.woodDark} />
      <B s={[0.5, 0.2, 0.04]} p={[-BED_WIDTH / 2 + 0.22, 0.52, BED_DEPTH / 2 + 0.13]} c={PAL.parchment} />
      <mesh position={[0, 0.5, 0]} visible={false} onPointerOver={over} onPointerOut={() => setHover(false)}>
        <boxGeometry args={[BED_WIDTH, 1, BED_DEPTH]} />
      </mesh>
      {/* Whose bed this is: always shown while you are in the garden, otherwise on hover. */}
      {(inGarden || hover) && <Label text={hover ? caption : name} y={1.75} />}
    </group>
  )
}

// A bed for each person who has taken part in shared focus sessions, in the order they first did.
// Beds nobody has claimed yet are bare soil, waiting.
export function FocusGarden() {
  const garden = useNet((s) => s.garden)
  return (
    <>
      {BEDS.map((b, i) => {
        const plot = garden[i]
        return plot ? (
          <Bed key={i} x={b.x} z={b.z} name={plot.name} seed={seedOf(plot, plot.name)} seconds={plot.seconds} />
        ) : (
          <group key={i} position={[b.x, 0, b.z]}>
            <B s={[BED_WIDTH, 0.12, BED_DEPTH]} p={[0, 0.06, 0]} c={PAL.woodDark} />
            <B s={[BED_WIDTH - 0.16, 0.06, BED_DEPTH - 0.16]} p={[0, 0.12, 0]} c="#5b4030" />
          </group>
        )
      })}
    </>
  )
}

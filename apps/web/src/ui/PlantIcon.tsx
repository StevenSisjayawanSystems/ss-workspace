import type { Species } from '@guildhouse/shared'

const INK = { stroke: '#05090f', strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
const trunk = <path d="M22 44v-12h4v12z" fill="#7a5230" {...INK} />

// Flat drawings of the garden's plants, in the same inked style as the portraits.
const SHAPES: Record<Species, React.JSX.Element> = {
  oak: (
    <>
      {trunk}
      <path d="M24 6c8 0 15 6 15 14s-7 13-15 13S9 28 9 20 16 6 24 6z" fill="#4f8a4a" {...INK} />
    </>
  ),
  blossom: (
    <>
      {trunk}
      <path d="M24 7c7 0 14 5 14 13s-6 12-14 12-14-4-14-12S17 7 24 7z" fill="#f0a9b8" {...INK} />
      <path d="M18 17h.01M27 13h.01M30 22h.01M21 25h.01" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  pine: (
    <>
      {trunk}
      <path d="M24 4l9 13h-5l8 11h-6l7 9H11l7-9h-6l8-11h-5z" fill="#2f6f4f" {...INK} />
    </>
  ),
  sunflower: (
    <>
      <path d="M24 44V24" fill="none" {...INK} stroke="#3f7a3a" strokeWidth={4} />
      <path d="M24 34c-6 0-8-4-8-6 5 0 8 2 8 6z" fill="#4f8a4a" {...INK} />
      <circle cx="24" cy="16" r="11" fill="#f2c230" {...INK} />
      <circle cx="24" cy="16" r="5" fill="#7a4a2a" {...INK} />
    </>
  ),
  tulips: (
    <>
      <path d="M16 44V26M32 44V24" fill="none" {...INK} stroke="#3f7a3a" strokeWidth={3} />
      <path d="M10 14l3 4 3-5 3 5 3-4v8c0 4-3 6-6 6s-6-2-6-6z" fill="#d8503f" {...INK} />
      <path d="M26 11l3 4 3-5 3 5 3-4v8c0 4-3 6-6 6s-6-2-6-6z" fill="#f2c230" {...INK} />
    </>
  ),
  lavender: (
    <>
      <path d="M14 44l2-18M24 44V22M34 44l-2-18" fill="none" {...INK} stroke="#3f7a3a" strokeWidth={3} />
      <path d="M13 8h6v18h-6zM21 4h6v18h-6zM29 8h6v18h-6z" fill="#9a7fd1" {...INK} />
    </>
  ),
  mushroom: (
    <>
      <path d="M19 44V28h10v16z" fill="#f3ead6" {...INK} />
      <path d="M6 28c0-11 8-19 18-19s18 8 18 19z" fill="#c8402f" {...INK} />
      <circle cx="17" cy="20" r="3" fill="#f3ead6" />
      <circle cx="29" cy="16" r="2.500" fill="#f3ead6" />
      <circle cx="33" cy="24" r="2" fill="#f3ead6" />
    </>
  ),
  bamboo: (
    <>
      <path d="M13 44V8h6v36zM27 44V14h6v30z" fill="#7fb35a" {...INK} />
      <path d="M13 20h6M13 32h6M27 24h6M27 34h6" fill="none" {...INK} />
      <path d="M19 12c5-3 8-2 10 0-4 2-7 2-10 0z" fill="#4f8a4a" {...INK} />
    </>
  ),
}

export function PlantIcon({ species }: { species: Species }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {SHAPES[species]}
    </svg>
  )
}

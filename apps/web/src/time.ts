// Local time for the clock and the sky. Uses the viewer's own time zone, falling back to Pacific time.
const FALLBACK_ZONE = 'America/Los_Angeles'

function resolveZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (zone) {
      new Intl.DateTimeFormat('en-US', { timeZone: zone })
      return zone
    }
  } catch {
    // Unknown or unavailable zone.
  }
  return FALLBACK_ZONE
}

export const timeZone = resolveZone()

// `override` pins the hour (0-24) for previews and tests.
export const clock = { override: null as number | null }

const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })

// Hours since local midnight, with fraction.
export function localHour(now = new Date()): number {
  if (clock.override !== null) return clock.override
  const p = Object.fromEntries(parts.formatToParts(now).map((x) => [x.type, Number(x.value)]))
  return p.hour + p.minute / 60 + p.second / 3600
}

const display = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
export function clockText(now = new Date()): { time: string; zone: string } {
  const p = display.formatToParts(now)
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return { time: `${get('hour')}:${get('minute')} ${get('dayPeriod')}`, zone: get('timeZoneName') }
}

export interface Sky {
  sun: string
  sunPower: number
  // Compass angle of the light in radians (0 = from the south, towards the camera side) and its height.
  azimuth: number
  height: number
  skyTint: string
  bounce: string
  ambient: number
  // 0 in daylight, 1 in full night: drives lamps, bloom and how bright unlit things are drawn.
  night: number
}

// Key moments of the day; everything between is blended.
const KEYS: [number, Sky][] = [
  [0, { sun: '#8fa8ff', sunPower: 0.55, azimuth: 0.5, height: 20, skyTint: '#5d6fb0', bounce: '#27325e', ambient: 0.55, night: 1 }],
  [4.8, { sun: '#8fa8ff', sunPower: 0.55, azimuth: 0.3, height: 18, skyTint: '#5d6fb0', bounce: '#27325e', ambient: 0.55, night: 1 }],
  [6.3, { sun: '#ffb38a', sunPower: 1.5, azimuth: 0.95, height: 9, skyTint: '#ffcfc0', bounce: '#5a6aa8', ambient: 0.85, night: 0.35 }],
  [8.5, { sun: '#ffe9c4', sunPower: 2.1, azimuth: 0.8, height: 17, skyTint: '#fff0d6', bounce: '#6688c8', ambient: 1.15, night: 0 }],
  [12.5, { sun: '#fff6e2', sunPower: 2.35, azimuth: 0.35, height: 26, skyTint: '#fff6e0', bounce: '#6f9ad6', ambient: 1.3, night: 0 }],
  [16.5, { sun: '#ffdca6', sunPower: 2.25, azimuth: -0.1, height: 16, skyTint: '#ffe9c4', bounce: '#5b7fc0', ambient: 1.15, night: 0 }],
  [18.6, { sun: '#ff9a5c', sunPower: 1.7, azimuth: -0.45, height: 8, skyTint: '#ffc79a', bounce: '#5a5fa8', ambient: 0.9, night: 0.3 }],
  [20, { sun: '#9a8fe0', sunPower: 0.8, azimuth: 0.2, height: 14, skyTint: '#7a78c0', bounce: '#2f3a6a', ambient: 0.65, night: 0.85 }],
  [21.2, { sun: '#8fa8ff', sunPower: 0.55, azimuth: 0.5, height: 20, skyTint: '#5d6fb0', bounce: '#27325e', ambient: 0.55, night: 1 }],
  [24, { sun: '#8fa8ff', sunPower: 0.55, azimuth: 0.5, height: 20, skyTint: '#5d6fb0', bounce: '#27325e', ambient: 0.55, night: 1 }],
]

const mixHex = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) + (((pb >> shift) & 255) - ((pa >> shift) & 255)) * t)
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t

export function skyAt(hour: number): Sky {
  const h = ((hour % 24) + 24) % 24
  let i = 0
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++
  const [h0, a] = KEYS[i]
  const [h1, b] = KEYS[i + 1]
  const t = Math.min(1, Math.max(0, (h - h0) / (h1 - h0)))
  return {
    sun: mixHex(a.sun, b.sun, t),
    sunPower: mix(a.sunPower, b.sunPower, t),
    azimuth: mix(a.azimuth, b.azimuth, t),
    height: mix(a.height, b.height, t),
    skyTint: mixHex(a.skyTint, b.skyTint, t),
    bounce: mixHex(a.bounce, b.bounce, t),
    ambient: mix(a.ambient, b.ambient, t),
    night: mix(a.night, b.night, t),
  }
}

// Shared so unlit materials and effects can follow the light without each recomputing it.
export const sky = { current: skyAt(localHour()) }

if (import.meta.env.DEV) Object.assign(window, { __clock: clock })

// A short stamp for a message or a note: the time if it is from today, otherwise the date.
export function when(at: number): string {
  const d = new Date(at)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

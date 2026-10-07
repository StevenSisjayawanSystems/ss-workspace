import * as THREE from 'three'
import type { FloorKind } from '@guildhouse/shared'

export const PAL = {
  wood: '#a8743f',
  woodDark: '#6b4a32',
  woodLight: '#d2a56b',
  plaster: '#efe1c2',
  wainscot: '#c9a77c',
  stone: '#c2bba9',
  stoneDark: '#8d8779',
  brass: '#cfa24a',
  red: '#b4473a',
  teal: '#2a7c80',
  blue: '#40608f',
  purple: '#6b5590',
  green: '#5fa64b',
  leaf: '#448f45',
  leafLight: '#93c35c',
  hedge: '#3f8f4c',
  cream: '#fbf1dc',
  parchment: '#f3e2b3',
  water: '#5fd0e6',
  ink: '#3a2a22',
  leafDeep: '#2f7446',
  leafGlow: '#c3d97c',
  roof: '#2f8f86',
  moss: '#7fae4a',
}

// Three hard steps: shadow, mid and lit, like painted animation cels.
const ramp = new THREE.DataTexture(new Uint8Array([135, 200, 255]), 3, 1, THREE.RedFormat)
ramp.minFilter = ramp.magFilter = THREE.NearestFilter
ramp.needsUpdate = true
export const toonRamp = ramp

const toonCache = new Map<string, THREE.MeshToonMaterial>()
export function toon(color: string): THREE.MeshToonMaterial {
  let m = toonCache.get(color)
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: ramp })
    toonCache.set(color, m)
  }
  return m
}

// Unlit and brighter than white so bloom picks it up: lantern flames, fire, magic glass.
const glowCache = new Map<string, THREE.MeshBasicMaterial>()
export function glow(color: string, strength = 1.8): THREE.MeshBasicMaterial {
  const key = color + strength
  let m = glowCache.get(key)
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), toneMapped: false })
    glowCache.set(key, m)
  }
  return m
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const shade = (hex: string, amt: number) => {
  const c = new THREE.Color(hex)
  c.offsetHSL(0, 0, amt)
  return `#${c.getHexString()}`
}

// Hand-painted-looking floors drawn to a canvas; one texture covers 2x2 tiles.
function paintFloor(kind: FloorKind): HTMLCanvasElement {
  const S = 256
  const cv = document.createElement('canvas')
  // Painted at double resolution so floors stay crisp when zoomed in.
  cv.width = cv.height = S * 2
  const g = cv.getContext('2d')!
  g.scale(2, 2)
  const r = rng(kind.length * 7919)
  if (kind === 'wood' || kind === 'darkWood') {
    const base = kind === 'wood' ? '#d9a868' : '#a87245'
    const rows = 8
    const h = S / rows
    for (let i = 0; i < rows; i++) {
      let x = -r() * 120
      while (x < S) {
        const w = 90 + r() * 110
        g.fillStyle = shade(base, (r() - 0.5) * 0.09)
        g.fillRect(x, i * h, w, h)
        g.fillStyle = 'rgba(70,40,20,0.35)'
        g.fillRect(x + w - 1.5, i * h, 1.5, h)
        x += w
      }
      g.fillStyle = 'rgba(70,40,20,0.4)'
      g.fillRect(0, i * h, S, 1.5)
    }
  } else if (kind === 'stone') {
    g.fillStyle = '#8f8a80'
    g.fillRect(0, 0, S, S)
    const n = 4
    const c = S / n
    for (let j = 0; j < n; j++)
      for (let i = -1; i < n; i++) {
        const off = j % 2 ? c / 2 : 0
        g.fillStyle = shade('#cfc8b8', (r() - 0.5) * 0.1)
        g.beginPath()
        g.roundRect(i * c + off + 3, j * c + 3, c - 6, c - 6, 9)
        g.fill()
      }
  } else if (kind === 'tile') {
    const n = 4
    const c = S / n
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        g.fillStyle = shade((i + j) % 2 ? '#f2dfc0' : '#d98e6a', (r() - 0.5) * 0.05)
        g.fillRect(i * c, j * c, c, c)
      }
    g.strokeStyle = 'rgba(90,50,30,0.3)'
    g.lineWidth = 2
    for (let i = 0; i <= n; i++) {
      g.strokeRect(i * c, -2, 0, S + 4)
      g.strokeRect(-2, i * c, S + 4, 0)
    }
  } else if (kind === 'carpet') {
    g.fillStyle = '#7d4a6b'
    g.fillRect(0, 0, S, S)
    g.strokeStyle = 'rgba(255,220,170,0.22)'
    g.lineWidth = 3
    const c = S / 4
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) {
        g.beginPath()
        g.moveTo(i * c + c / 2, j * c + 6)
        g.lineTo(i * c + c - 6, j * c + c / 2)
        g.lineTo(i * c + c / 2, j * c + c - 6)
        g.lineTo(i * c + 6, j * c + c / 2)
        g.closePath()
        g.stroke()
      }
  } else {
    g.fillStyle = '#699f49'
    g.fillRect(0, 0, S, S)
    for (let i = 0; i < 110; i++) {
      const pick = r()
      g.fillStyle = pick > 0.66 ? 'rgba(196,224,112,0.4)' : pick > 0.33 ? 'rgba(62,140,74,0.32)' : 'rgba(140,200,92,0.35)'
      const x = r() * S, y = r() * S, rad = 5 + r() * 22
      // Draw wrapped copies so the texture tiles without seams.
      for (const ox of [-S, 0, S])
        for (const oy of [-S, 0, S]) {
          g.beginPath()
          g.ellipse(x + ox, y + oy, rad, rad * 0.55, r() * 3, 0, Math.PI * 2)
          g.fill()
        }
    }
  }
  return cv
}

const floorCanvases = new Map<FloorKind, HTMLCanvasElement>()
export function floorTexture(kind: FloorKind, w: number, d: number): THREE.CanvasTexture {
  if (!floorCanvases.has(kind)) floorCanvases.set(kind, paintFloor(kind))
  const t = new THREE.CanvasTexture(floorCanvases.get(kind)!)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(w / 2, d / 2)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// Scalloped teal shingles for the cottage roof.
let shingleCanvas: HTMLCanvasElement | undefined
export function shingleTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  if (!shingleCanvas) {
    const S = 256
    const cv = (shingleCanvas = document.createElement('canvas'))
    cv.width = cv.height = S * 2
    const g = cv.getContext('2d')!
    g.scale(2, 2)
    const r = rng(99)
    g.fillStyle = '#1f6f6c'
    g.fillRect(0, 0, S, S)
    const rows = 4, cols = 4, w = S / cols, h = S / rows
    for (let j = rows; j >= -1; j--)
      for (let i = -1; i <= cols; i++) {
        const x = i * w + (j % 2 ? w / 2 : 0)
        g.fillStyle = shade(r() > 0.8 ? '#58b98f' : '#34a39a', (r() - 0.5) * 0.08)
        g.strokeStyle = 'rgba(15,60,62,0.7)'
        g.lineWidth = 3
        g.beginPath()
        g.roundRect(x + 2, j * h - h * 0.25, w - 4, h * 1.2, [0, 0, w / 2, w / 2])
        g.fill()
        g.stroke()
      }
  }
  const t = new THREE.CanvasTexture(shingleCanvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeatX, repeatY)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

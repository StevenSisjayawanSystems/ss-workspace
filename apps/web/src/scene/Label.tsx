import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const FONT = "'Nunito', 'Avenir Next', system-ui, sans-serif"
const RES = 4 // texture pixels per CSS-like pixel, for crisp text when zoomed in
const PX_PER_UNIT = 58

export const labelOverlayScene = new THREE.Scene()

function wrap(g: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && g.measureText(next).width > maxWidth) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    lines.length = maxLines
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/.{0,2}$/, '')}…`
  }
  return lines
}

function draw(text: string, bubble: boolean) {
  const size = bubble ? 15 : 14
  const lineH = size * 1.25
  const cv = document.createElement('canvas')
  const g = cv.getContext('2d')!
  const font = `800 ${size}px ${FONT}`
  g.font = font
  const lines = bubble ? wrap(g, text, 190, 3) : [text]
  const textW = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width)))
  const padX = bubble ? 13 : 8
  const padY = bubble ? 8 : 4
  const tail = bubble ? 9 : 0
  const w = textW + padX * 2 + 6
  const h = Math.ceil(lines.length * lineH) + padY * 2 + tail + 6
  cv.width = w * RES
  cv.height = h * RES
  g.scale(RES, RES)
  g.font = font
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  if (bubble) {
    // Plain white balloon with a tail and a thin dark edge.
    const bh = h - tail - 6
    const edge = '#4a3324'
    g.lineWidth = 1.6
    g.strokeStyle = edge
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.moveTo(w / 2 - 7, bh + 2)
    g.lineTo(w / 2 - 2, bh + 3 + tail)
    g.lineTo(w / 2 + 8, bh + 2)
    g.closePath()
    g.fill()
    g.stroke()
    g.beginPath()
    g.roundRect(3, 3, w - 6, bh, Math.min(16, bh / 2))
    g.fill()
    g.stroke()
    // Erase the balloon's edge where the tail joins it.
    g.fillRect(w / 2 - 5.6, bh + 1.6, 12.2, 2.6)
    g.fillStyle = edge
    lines.forEach((l, i) => g.fillText(l, w / 2, 3 + padY + lineH * (i + 0.5)))
  } else {
    // White lettering on a flat teal plate: readable over any background without outlines or shadows.
    g.fillStyle = '#0e1726'
    g.beginPath()
    g.roundRect(1, 2, w - 2, h - 4, (h - 4) / 2)
    g.fill()
    g.fillStyle = '#ffffff'
    g.fillText(text, w / 2, h / 2 + 0.5)
  }
  const texture = new THREE.CanvasTexture(cv)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return { texture, w, h }
}

// Name plates and speech bubbles drawn into the scene itself, always on top of the world.
export function Label({ text, y, bubble = false }: { text: string; y: number; bubble?: boolean }) {
  // Redraw once the web font has arrived, otherwise the first labels keep the fallback face.
  const [fonts, setFonts] = useState(0)
  const anchor = useRef<THREE.Group>(null!)
  const sprite = useRef<THREE.Sprite>(null!)
  useEffect(() => {
    let alive = true
    document.fonts?.ready.then(() => alive && setFonts(1))
    return () => {
      alive = false
    }
  }, [])
  const { texture, w, h } = useMemo(() => draw(text, bubble), [text, bubble, fonts])
  useEffect(() => () => texture.dispose(), [texture])
  useFrame(() => {
    if (!anchor.current || !sprite.current) return
    anchor.current.getWorldPosition(sprite.current.position)
  })
  return (
    <>
      <group ref={anchor} position={[0, y + h / PX_PER_UNIT / 2, 0]} />
      {createPortal(
        <sprite ref={sprite} scale={[w / PX_PER_UNIT, h / PX_PER_UNIT, 1]} renderOrder={bubble ? 11 : 10}>
          <spriteMaterial
            map={texture}
            transparent
            alphaTest={0.5}
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

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

  const pushLongWord = (word: string) => {
    let chunk = ''
    for (const char of word) {
      const next = `${chunk}${char}`
      if (chunk && g.measureText(next).width > maxWidth) {
        lines.push(chunk)
        chunk = char
      } else {
        chunk = next
      }
    }
    return chunk
  }

  for (const word of text.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (g.measureText(next).width <= maxWidth) {
      line = next
      continue
    }

    if (line) {
      lines.push(line)
      line = ''
    }

    if (g.measureText(word).width > maxWidth) {
      line = pushLongWord(word)
    } else {
      line = word
    }
  }

  if (line) lines.push(line)

  if (lines.length > maxLines) {
    lines.length = maxLines
    let last = lines[maxLines - 1]
    while (last && g.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1)
    }
    lines[maxLines - 1] = `${last}…`
  }

  return lines
}

function draw(text: string, bubble: boolean) {
  const emojiOnly = bubble && /^[\p{Extended_Pictographic}\p{Emoji_Component}\uFE0F\u200D\s]+$/u.test(text.trim())
  const layoutSize = bubble ? 15 : 14
  const drawSize = emojiOnly ? 26 : layoutSize
  const lineH = layoutSize * 1.25
  const cv = document.createElement('canvas')
  const g = cv.getContext('2d')!
  const layoutFont = `800 ${layoutSize}px ${FONT}`
  const drawFont = `800 ${drawSize}px ${FONT}`
  g.font = layoutFont
  const lines = bubble ? wrap(g, text, 150, 2) : [text]
  const textW = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width)))
  const padX = bubble ? 13 : 8
  const padY = bubble ? 8 : 4
  const tail = bubble ? 7 : 0
  const w = textW + padX * 2 + 6
  const h = Math.ceil(lines.length * lineH) + padY * 2 + tail + 6
  cv.width = w * RES
  cv.height = h * RES
  g.scale(RES, RES)
  g.font = drawFont
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
    const left = 3
    const top = 3
    const right = w - 3
    const bottom = top + bh
    const radius = Math.min(16, bh / 2)
    const tailHalf = 5
    const tailTipY = bottom + tail

    g.beginPath()
    g.moveTo(left + radius, top)
    g.lineTo(right - radius, top)
    g.quadraticCurveTo(right, top, right, top + radius)
    g.lineTo(right, bottom - radius)
    g.quadraticCurveTo(right, bottom, right - radius, bottom)
    g.lineTo(w / 2 + tailHalf, bottom)
    g.lineTo(w / 2, tailTipY)
    g.lineTo(w / 2 - tailHalf, bottom)
    g.lineTo(left + radius, bottom)
    g.quadraticCurveTo(left, bottom, left, bottom - radius)
    g.lineTo(left, top + radius)
    g.quadraticCurveTo(left, top, left + radius, top)
    g.closePath()
    g.fill()
    g.stroke()
    g.fillStyle = edge
    if (emojiOnly) {
      g.fillText(text.trim(), w / 2, top + bh / 2)
    } else {
      lines.forEach((l, i) => g.fillText(l, w / 2, 3 + padY + lineH * (i + 0.5)))
    }
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
export function Label({
  text,
  y,
  bubble = false,
  placement = 'above',
}: {
  text: string
  y: number
  bubble?: boolean
  placement?: 'above' | 'below'
}) {
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
  const offsetY = h / PX_PER_UNIT / 2
  const anchorY = placement === 'below' ? y - offsetY : y + offsetY
  return (
    <>
      <group ref={anchor} position={[0, anchorY, 0]} />
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

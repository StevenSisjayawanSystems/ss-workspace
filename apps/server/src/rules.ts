import { WALK_SPEED, circleFree } from '@guildhouse/shared'

export interface Pose {
  x: number
  z: number
}

// Clients report their own position; the server only accepts steps a walking avatar could have made.
export function validMove(prev: Pose, next: Pose, elapsedMs: number): boolean {
  if (!Number.isFinite(next.x) || !Number.isFinite(next.z)) return false
  if (!circleFree(next.x, next.z)) return false
  const allowed = WALK_SPEED * (Math.min(elapsedMs, 1000) / 1000) * 1.5 + 0.35
  return Math.hypot(next.x - prev.x, next.z - prev.z) <= allowed
}

const COLOR = /^#[0-9a-f]{6}$/i
export const cleanColor = (v: unknown, fallback: string) => (typeof v === 'string' && COLOR.test(v) ? v : fallback)

// Like cleanText, for writing that runs over several lines: line breaks and the spaces that indent
// a line are kept, since they are part of how a note is laid out.
export const cleanBlock = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+|\s+$/g, '')
        .slice(0, max)
    : ''

export const cleanText = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : ''

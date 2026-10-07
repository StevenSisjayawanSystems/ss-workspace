import { schema, t, type SchemaType } from '@colyseus/schema'

export const Track = schema(
  { id: t.string(), videoId: t.string(), title: t.string(), addedBy: t.string(), duration: t.number() },
  'Track',
)
export type Track = SchemaType<typeof Track>

// queue[0] is what is playing. While playing, position = (now - startedAt) / 1000; while paused it is pausedAt.
export const Jukebox = schema(
  { queue: t.array(Track), startedAt: t.number(), paused: t.boolean(), pausedAt: t.number() },
  'Jukebox',
)
export type Jukebox = SchemaType<typeof Jukebox>

export const MAX_QUEUE = 50

export const position = (j: Jukebox, now: number) => (j.paused ? j.pausedAt : (now - j.startedAt) / 1000)

function restart(j: Jukebox, now: number) {
  j.startedAt = now
  j.paused = false
  j.pausedAt = 0
}

export function add(j: Jukebox, track: { videoId: string; title: string; addedBy: string }, now: number): boolean {
  if (j.queue.length >= MAX_QUEUE) return false
  const tr = new Track()
  tr.id = `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  tr.videoId = track.videoId
  tr.title = track.title
  tr.addedBy = track.addedBy
  tr.duration = 0
  j.queue.push(tr)
  if (j.queue.length === 1) restart(j, now)
  return true
}

export function skip(j: Jukebox, now: number) {
  if (!j.queue.length) return
  j.queue.shift()
  restart(j, now)
}

export function remove(j: Jukebox, id: string, now: number) {
  const i = j.queue.findIndex((tr) => tr.id === id)
  if (i === 0) skip(j, now)
  else if (i > 0) j.queue.splice(i, 1)
}

export function pause(j: Jukebox, now: number) {
  if (j.paused || !j.queue.length) return
  j.pausedAt = Math.max(0, position(j, now))
  j.paused = true
}

export function play(j: Jukebox, now: number) {
  if (!j.paused) return
  j.startedAt = now - j.pausedAt * 1000
  j.paused = false
}

export function seek(j: Jukebox, seconds: number, now: number) {
  if (!j.queue.length || !Number.isFinite(seconds)) return
  const max = j.queue[0].duration || Infinity
  const pos = Math.min(Math.max(0, seconds), max)
  if (j.paused) j.pausedAt = pos
  else j.startedAt = now - pos * 1000
}

// Moves on when the current track has run past its known length. Returns true if it advanced.
export function tick(j: Jukebox, now: number): boolean {
  const cur = j.queue[0]
  if (!cur || j.paused || !cur.duration) return false
  if (position(j, now) < cur.duration + 1.5) return false
  skip(j, now)
  return true
}

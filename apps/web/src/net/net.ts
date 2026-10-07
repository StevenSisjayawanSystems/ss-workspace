import { Client, type Room } from '@colyseus/sdk'
import { create } from 'zustand'
import { QUIET_ZONES, seatById, standSpot, type ZoneId } from '@guildhouse/shared'
import { inReach, player, useGame, walkToSeat, type Profile } from '../game'
import { DEFAULT_LOOK, type AvatarLook } from '../look'

// Other players. `tx/tz/tfacing` are the latest server values; `x/z/facing` are what is drawn and ease towards them.
export interface Remote {
  id: string
  name: string
  look: AvatarLook
  zone: string
  seat: string
  x: number
  z: number
  facing: number
  tx: number
  tz: number
  tfacing: number
  moving: boolean
}
export const remotes = new Map<string, Remote>()

export interface ChatLine {
  id: string
  name: string
  text: string
  at: number
}

export const EMOTES = { wave: '👋', heart: '❤️', laugh: '😂', cheer: '🎉' } as const
export type Emote = keyof typeof EMOTES

export interface JukeTrack {
  id: string
  videoId: string
  title: string
  addedBy: string
  duration: number
}

// Mirrors the server jukebox: queue[0] is playing; position is derived from startedAt on the server clock.
export interface JukeState {
  queue: JukeTrack[]
  startedAt: number
  paused: boolean
  pausedAt: number
}

interface NetState {
  // True while we are seated in a room that has a call; `call` lists the others seated in that room.
  inCall: boolean
  call: string[]
  // Occupied seats, by seat id, with the sitter's name.
  taken: Record<string, string>
  juke: JukeState
  jukeError: string | null
  status: 'offline' | 'connecting' | 'online'
  selfId: string | null
  ids: string[]
  chat: ChatLine[]
  bubbles: Record<string, { text: string; until: number }>
}

const NO_MUSIC: JukeState = { queue: [], startedAt: 0, paused: false, pausedAt: 0 }

export const useNet = create<NetState>(() => ({ inCall: false, call: [], taken: {}, juke: NO_MUSIC, jukeError: null, status: 'offline', selfId: null, ids: [], chat: [], bubbles: {} }))

const SEND_MS = 80
const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`

let room: Room<any> | null = null
let sendTimer: ReturnType<typeof setInterval> | undefined
let clockTimer: ReturnType<typeof setInterval> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined

function bubble(id: string, text: string, ms: number) {
  const until = Date.now() + ms
  useNet.setState((s) => ({ bubbles: { ...s.bubbles, [id]: { text, until } } }))
  setTimeout(() => {
    useNet.setState((s) => {
      if (s.bubbles[id]?.until !== until) return s
      const { [id]: _, ...rest } = s.bubbles
      return { bubbles: rest }
    })
  }, ms)
}

let clockOffset = 0
// Current time on the server's clock, so every client computes the same song position.
export const serverNow = () => Date.now() + clockOffset

let jukeKey = ''
function syncJukebox(state: any) {
  const j = state.jukebox
  if (!j) return
  const queue: JukeTrack[] = []
  j.queue?.forEach((t: any) => queue.push({ id: t.id, videoId: t.videoId, title: t.title, addedBy: t.addedBy, duration: t.duration }))
  const juke: JukeState = { queue, startedAt: j.startedAt ?? 0, paused: !!j.paused, pausedAt: j.pausedAt ?? 0 }
  const key = JSON.stringify(juke)
  if (key === jukeKey) return
  jukeKey = key
  useNet.setState({ juke })
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

// Our own seat comes from the server, which is what stops two people taking the same chair.
let ignoreSeatUntil = 0
function syncSelf(me: any) {
  const game = useGame.getState()
  const serverSeat: string | null = me.seat || null
  if (serverSeat === game.seat) return
  if (serverSeat && Date.now() < ignoreSeatUntil) return
  const seat = serverSeat ? seatById(serverSeat) : undefined
  if (seat) {
    player.x = seat.x
    player.z = seat.z
    player.facing = seat.facing
  } else if (!serverSeat) {
    player.x = me.x
    player.z = me.z
  }
  useGame.setState({ seat: serverSeat, pendingSeat: null })
}

function syncCall() {
  const mySeat = seatById(useGame.getState().seat ?? '')
  const inCall = !!mySeat && !QUIET_ZONES.includes(mySeat.zone)
  const call: string[] = []
  const taken: Record<string, string> = {}
  for (const r of remotes.values()) {
    if (!r.seat) continue
    taken[r.seat] = r.name
    if (inCall && seatById(r.seat)?.zone === mySeat!.zone) call.push(r.id)
  }
  call.sort()
  const s = useNet.getState()
  const patch: Partial<NetState> = {}
  if (s.inCall !== inCall) patch.inCall = inCall
  if (!sameList(s.call, call)) patch.call = call
  if (JSON.stringify(s.taken) !== JSON.stringify(taken)) patch.taken = taken
  if (Object.keys(patch).length) useNet.setState(patch)
}

function syncPlayers(state: any, selfId: string) {
  const seen = new Set<string>()
  const me = state.players?.get(selfId)
  if (me) syncSelf(me)
  state.players?.forEach((p: any, id: string) => {
    if (id === selfId) return
    seen.add(id)
    const r = remotes.get(id)
    if (r) {
      r.tx = p.x
      r.tz = p.z
      r.tfacing = p.facing
      r.moving = p.moving
      r.zone = p.zone
      r.seat = p.seat
    } else {
      remotes.set(id, {
        id,
        name: p.name,
        look: { ...DEFAULT_LOOK, robe: p.robe, trim: p.trim, hair: p.hair, hat: p.hat },
        zone: p.zone,
        seat: p.seat,
        x: p.x, z: p.z, facing: p.facing,
        tx: p.x, tz: p.z, tfacing: p.facing,
        moving: p.moving,
      })
    }
  })
  for (const id of remotes.keys()) if (!seen.has(id)) remotes.delete(id)
  const ids = [...remotes.keys()]
  const prev = useNet.getState().ids
  if (ids.length !== prev.length || ids.some((id, i) => id !== prev[i])) useNet.setState({ ids })
  syncCall()
}

function disconnected(profile: Profile) {
  clearInterval(sendTimer)
  clearInterval(clockTimer)
  jukeKey = ''
  room = null
  remotes.clear()
  useNet.setState({ status: 'offline', selfId: null, ids: [], juke: NO_MUSIC, inCall: false, call: [], taken: {} })
  useGame.setState({ seat: null, pendingSeat: null })
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => connect(profile), 3000)
}

// Joins the shared office. If the server is unreachable the office still works solo and we keep retrying.
export async function connect(profile: Profile) {
  if (room || useNet.getState().status === 'connecting') return
  useNet.setState({ status: 'connecting' })
  try {
    const { robe, trim, hair, hat } = profile.look
    const joined = await new Client(SERVER_URL).joinOrCreate<any>('office', { name: profile.name, robe, trim, hair, hat })
    room = joined
    const selfId = joined.sessionId
    useNet.setState({ status: 'online', selfId })

    joined.onStateChange((state: any) => {
      syncPlayers(state, selfId)
      syncJukebox(state)
    })
    joined.onMessage('clock', (m: { t0: number; now: number }) => {
      clockOffset = m.now - (m.t0 + Date.now()) / 2
    })
    joined.onMessage('juke:error', (m: string) => {
      useNet.setState({ jukeError: m })
      setTimeout(() => useNet.getState().jukeError === m && useNet.setState({ jukeError: null }), 4000)
    })
    joined.send('clock', Date.now())
    clockTimer = setInterval(() => joined.send('clock', Date.now()), 30000)
    joined.onMessage('rtc', (m: { from: string; data: unknown }) => rtcHandler?.(m.from, m.data))
    joined.onMessage('snap', (m: { x: number; z: number }) => useGame.getState().snapTo(m.x, m.z))
    joined.onMessage('chat', (m: ChatLine) => {
      useNet.setState((s) => ({ chat: [...s.chat.slice(-49), m] }))
      bubble(m.id, m.text.length > 70 ? `${m.text.slice(0, 68)}…` : m.text, 5000)
    })
    joined.onMessage('emote', (m: { id: string; emote: Emote }) => bubble(m.id, EMOTES[m.emote] ?? '', 2500))
    joined.onLeave(() => disconnected(profile))
    joined.onError(() => {})

    let last = ''
    sendTimer = setInterval(() => {
      // A seated player's position belongs to the server.
      if (useGame.getState().seat) return
      const msg = { x: +player.x.toFixed(3), z: +player.z.toFixed(3), facing: +player.facing.toFixed(2), moving: player.moving }
      const key = JSON.stringify(msg)
      if (key === last) return
      last = key
      joined.send('move', msg)
    }, SEND_MS)
  } catch {
    disconnected(profile)
  }
}

// Sits in a seat if it is within reach, otherwise walks over first.
export function requestSit(seatId: string) {
  if (useNet.getState().taken[seatId] || useGame.getState().seat === seatId) return
  if (useGame.getState().seat || inReach(seatId)) room?.send('sit', seatId)
  else walkToSeat(seatId)
}

// Gets up straight away; the server confirms a moment later.
export function standUp() {
  const seat = seatById(useGame.getState().seat ?? '')
  if (!seat) return
  const spot = standSpot(seat)
  player.x = spot.x
  player.z = spot.z
  ignoreSeatUntil = Date.now() + 800
  useGame.setState({ seat: null })
  syncCall()
  room?.send('stand')
}

let rtcHandler: ((from: string, data: any) => void) | undefined
export const onRtc = (handler: (from: string, data: any) => void) => {
  rtcHandler = handler
}
export const sendRtc = (to: string, data: unknown) => room?.send('rtc', { to, data })
export const callZone = (): ZoneId | null => seatById(useGame.getState().seat ?? '')?.zone ?? null

export const sendChat = (text: string) => room?.send('chat', text)
export const sendEmote = (emote: Emote) => room?.send('emote', emote)

export const jukebox = {
  add: (url: string) => room?.send('juke:add', url),
  skip: () => room?.send('juke:skip'),
  remove: (id: string) => room?.send('juke:remove', id),
  pause: () => room?.send('juke:pause'),
  play: () => room?.send('juke:play'),
  ended: (id: string) => room?.send('juke:ended', id),
  duration: (id: string, duration: number) => room?.send('juke:duration', { id, duration }),
}

if (import.meta.env.DEV) Object.assign((window as any).__game, { net: { useNet, remotes, jukebox, sendChat, sendEmote, requestSit, standUp } })

// This module owns a live connection, so a hot update cannot be applied in place.
import.meta.hot?.dispose(() => {
  room?.leave()
  location.reload()
})

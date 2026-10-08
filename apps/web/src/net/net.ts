import { Client, type Room } from '@colyseus/sdk'
import { create } from 'zustand'
import { QUIET_ZONES, SEATS, roomById, seatById, standSpot, type Seat, type ZoneId } from '@guildhouse/shared'
import { inReach, player, useGame, walkToSeat, type Profile } from '../game'
import { DEFAULT_LOOK, type AvatarLook } from '../look'
import { bell, ringtone } from '../sound'
import { announce, count, standing, type Standing } from '../stats'

// Other players. `tx/tz/tfacing` are the latest server values; `x/z/facing` are what is drawn and ease towards them.
export interface Remote {
  id: string
  name: string
  look: AvatarLook
  zone: string
  seat: string
  // Server time they arrived, and their self-reported standing.
  joinedAt: number
  level: number
  totalSeconds: number
  streak: number
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

// Mirrors the server's shared focus timer.
export interface PomoState {
  phase: 'idle' | 'focus' | 'break'
  endsAt: number
  paused: boolean
  remainingMs: number
  focusMin: number
  breakMin: number
  round: number
  startedBy: string
}
const NO_TIMER: PomoState = { phase: 'idle', endsAt: 0, paused: false, remainingMs: 0, focusMin: 25, breakMin: 5, round: 0, startedBy: '' }

// Someone asking us to come and join their call.
export interface Ring {
  from: string
  name: string
  zone: ZoneId
}

interface NetState {
  pomo: PomoState
  ringing: Ring | null
  // True while we are seated in a room that has a call; `call` lists the others seated in that room.
  inCall: boolean
  call: string[]
  // Occupied seats, by seat id, with the sitter's name.
  taken: Record<string, string>
  // Level of each other player, for name plates; and when we ourselves arrived (server time).
  ranks: Record<string, number>
  selfJoinedAt: number
  juke: JukeState
  jukeError: string | null
  status: 'offline' | 'connecting' | 'online'
  selfId: string | null
  ids: string[]
  chat: ChatLine[]
  bubbles: Record<string, { text: string; until: number }>
}

const NO_MUSIC: JukeState = { queue: [], startedAt: 0, paused: false, pausedAt: 0 }

export const useNet = create<NetState>(() => ({ pomo: NO_TIMER, ringing: null, inCall: false, call: [], taken: {}, ranks: {}, selfJoinedAt: 0, juke: NO_MUSIC, jukeError: null, status: 'offline', selfId: null, ids: [], chat: [], bubbles: {} }))

const SEND_MS = 80
const CONNECT_TIMEOUT_MS = 8000
const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`

let room: Room<any> | null = null
let sendTimer: ReturnType<typeof setInterval> | undefined
let clockTimer: ReturnType<typeof setInterval> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
let inviteCode = ''

// Close code the server uses when the invite code is missing or wrong.
const INVITE_REJECTED = 4401

// Servers used to set up calls. The game server replaces these on join, adding a relay when one is configured.
export const ice: { servers: RTCIceServer[] } = { servers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] }

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
  if (me.joinedAt && useNet.getState().selfJoinedAt !== me.joinedAt) useNet.setState({ selfJoinedAt: me.joinedAt })
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
  const ranks: Record<string, number> = {}
  for (const r of remotes.values()) {
    ranks[r.id] = r.level
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
  if (JSON.stringify(s.ranks) !== JSON.stringify(ranks)) patch.ranks = ranks
  if (Object.keys(patch).length) useNet.setState(patch)
}

let pomoKey = ''
function syncPomodoro(state: any) {
  const p = state.pomodoro
  if (!p) return
  const pomo: PomoState = {
    phase: p.phase === 'focus' || p.phase === 'break' ? p.phase : 'idle',
    endsAt: p.endsAt ?? 0,
    paused: !!p.paused,
    remainingMs: p.remainingMs ?? 0,
    focusMin: p.focusMin || 25,
    breakMin: p.breakMin || 5,
    round: p.round ?? 0,
    startedBy: p.startedBy ?? '',
  }
  const key = JSON.stringify(pomo)
  if (key === pomoKey) return
  pomoKey = key
  useNet.setState({ pomo })
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
      r.level = p.level
      r.totalSeconds = p.totalSeconds
      r.streak = p.streak
    } else {
      remotes.set(id, {
        id,
        name: p.name,
        look: { ...DEFAULT_LOOK, robe: p.robe, trim: p.trim, hair: p.hair, hat: p.hat },
        zone: p.zone,
        seat: p.seat,
        joinedAt: p.joinedAt,
        level: p.level,
        totalSeconds: p.totalSeconds,
        streak: p.streak,
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
  pomoKey = ''
  ringtone.stop()
  room = null
  remotes.clear()
  useNet.setState({ status: 'offline', selfId: null, ids: [], juke: NO_MUSIC, pomo: NO_TIMER, ringing: null, inCall: false, call: [], taken: {}, ranks: {} })
  useGame.setState({ seat: null, pendingSeat: null })
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => connect(profile, inviteCode), 3000)
}

// Joins the shared office. If the server is unreachable the office still works solo and we keep retrying.
// Resolves to 'online', to 'invite' when the server wants an invite code we did not supply, or to 'offline'.
export async function connect(profile: Profile, code = ''): Promise<'online' | 'invite' | 'offline'> {
  if (room) return 'online'
  if (useNet.getState().status === 'connecting') return 'offline'
  inviteCode = code
  clearTimeout(retryTimer)
  useNet.setState({ status: 'connecting' })
  try {
    const { robe, trim, hair, hat } = profile.look
    // An unreachable server can leave the browser waiting a long time; give up after a few seconds
    // so the title screen never hangs, and drop the connection if it turns up late.
    const attempt = new Client(SERVER_URL).joinOrCreate<any>('office', { name: profile.name, robe, trim, hair, hat, code, ...standing() })
    const joined = await Promise.race([
      attempt,
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          attempt
            .then((late) => {
              if (late !== room) void late.leave()
            })
            .catch(() => {})
          reject(new Error('timed out'))
        }, CONNECT_TIMEOUT_MS),
      ),
    ])
    room = joined
    const selfId = joined.sessionId
    useNet.setState({ status: 'online', selfId })

    joined.onStateChange((state: any) => {
      syncPlayers(state, selfId)
      syncJukebox(state)
      syncPomodoro(state)
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
    joined.onMessage('ice', (servers: RTCIceServer[]) => {
      if (Array.isArray(servers) && servers.length) ice.servers = servers
    })
    joined.onMessage('pomo:done', (m: { finished: 'focus' | 'break' }) => {
      bell(m.finished === 'focus')
      if (m.finished === 'focus') {
        count('pomodoros')
        announce('Break time', 'Focus session complete')
      } else announce('Back to focus', 'Break is over')
    })
    joined.onMessage('ring', (m: Ring) => {
      // A second caller while one is already ringing is simply ignored.
      if (useNet.getState().ringing) return
      useNet.setState({ ringing: m })
      ringtone.start()
      clearTimeout(ringTimeout)
      ringTimeout = setTimeout(() => answerRing(false), RING_SECONDS * 1000)
    })
    joined.onMessage('ring:answer', (m: { name: string; accept: boolean }) => {
      clearTimeout(noAnswer)
      announce(m.name, m.accept ? 'is on the way' : 'cannot join right now')
    })
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
    return 'online'
  } catch (e) {
    if ((e as { code?: number })?.code === INVITE_REJECTED) {
      // Retrying would only be refused again; the title screen asks for the code instead.
      useNet.setState({ status: 'offline' })
      return 'invite'
    }
    disconnected(profile)
    return 'offline'
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

// The nearest free seat to us, optionally limited to one room. Quiet rooms never host calls.
function freeSeat(zone?: ZoneId): Seat | undefined {
  const taken = useNet.getState().taken
  const mine = useGame.getState().seat
  let best: Seat | undefined
  let bestD = Infinity
  for (const s of SEATS) {
    if (QUIET_ZONES.includes(s.zone) || (zone && s.zone !== zone) || taken[s.id] || s.id === mine) continue
    const d = Math.hypot(s.x - player.x, s.z - player.z)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

// Walks over and sits down in a room's call.
export function joinCallIn(zone: ZoneId) {
  if (seatById(useGame.getState().seat ?? '')?.zone === zone) return
  const seat = freeSeat(zone)
  if (seat) requestSit(seat.id)
  else announce(roomById(zone).name, 'has no free seats')
}

const RING_SECONDS = 30
let ringTimeout: ReturnType<typeof setTimeout> | undefined
let noAnswer: ReturnType<typeof setTimeout> | undefined

// Calls someone over. If we are not already seated in a call, we take the nearest free seat first,
// preferring the room we are standing in, and invite them to that room.
export function ringPerson(id: string) {
  const them = remotes.get(id)
  if (!room || !them) return
  let seat = seatById(useGame.getState().seat ?? '')
  if (!seat || QUIET_ZONES.includes(seat.zone)) {
    const here = useGame.getState().zone
    seat = (QUIET_ZONES.includes(here) ? undefined : freeSeat(here)) ?? freeSeat()
    if (!seat) return
    requestSit(seat.id)
  }
  room.send('ring', { to: id, zone: seat.zone })
  announce(`Calling ${them.name}`, `to ${roomById(seat.zone).name}`)
  clearTimeout(noAnswer)
  noAnswer = setTimeout(() => announce(them.name, 'did not answer'), (RING_SECONDS + 2) * 1000)
}

export function answerRing(accept: boolean) {
  const ring = useNet.getState().ringing
  if (!ring) return
  clearTimeout(ringTimeout)
  ringtone.stop()
  useNet.setState({ ringing: null })
  room?.send('ring:answer', { to: ring.from, accept })
  if (accept) joinCallIn(ring.zone)
}

export const pomodoro = {
  start: (focusMin: number, breakMin: number) => room?.send('pomo:start', { focusMin, breakMin }),
  pause: () => room?.send('pomo:pause'),
  resume: () => room?.send('pomo:resume'),
  skip: () => room?.send('pomo:skip'),
  stop: () => room?.send('pomo:stop'),
}

let rtcHandler: ((from: string, data: any) => void) | undefined
export const onRtc = (handler: (from: string, data: any) => void) => {
  rtcHandler = handler
}
export const sendRtc = (to: string, data: unknown) => room?.send('rtc', { to, data })
export const callZone = (): ZoneId | null => seatById(useGame.getState().seat ?? '')?.zone ?? null

export const sendChat = (text: string) => {
  if (!room) return
  room.send('chat', text)
  count('messages')
}
export const sendProgress = (s: Standing) => room?.send('progress', s)
export const sendEmote = (emote: Emote) => room?.send('emote', emote)

export const jukebox = {
  add: (url: string) => {
    if (!room) return
    room.send('juke:add', url)
    count('songs')
  },
  skip: () => room?.send('juke:skip'),
  remove: (id: string) => room?.send('juke:remove', id),
  pause: () => room?.send('juke:pause'),
  play: () => room?.send('juke:play'),
  ended: (id: string) => room?.send('juke:ended', id),
  duration: (id: string, duration: number) => room?.send('juke:duration', { id, duration }),
}

if (import.meta.env.DEV) Object.assign((window as any).__game, { net: { useNet, remotes, jukebox, sendChat, sendEmote, requestSit, standUp, connect, ringPerson, answerRing, pomodoro } })

// This module owns a live connection, so a hot update cannot be applied in place.
import.meta.hot?.dispose(() => {
  room?.leave()
  location.reload()
})

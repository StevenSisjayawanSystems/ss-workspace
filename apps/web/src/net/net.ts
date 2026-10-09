import { Client, type Room } from '@colyseus/sdk'
import { create } from 'zustand'
import { QUIET_ZONES, SEATS, isBoard, roomById, seatById, standSpot, type BoardId, type BondWith, type Person, type Progress, type Seat, type Task, type TaskSession, type ZoneId } from '@guildhouse/shared'
import { accessToken } from '../account'
import { inReach, player, saveStatus, useGame, walkToSeat, type Profile } from '../game'
import { DEFAULT_LOOK, type AvatarLook } from '../look'
import { alarmBell, bell, knockSound, pat, ping, ringtone } from '../sound'
import { announce, carried, receive } from '../stats'

// Other players. `tx/tz/tfacing` are the latest server values; `x/z/facing` are what is drawn and ease towards them.
export interface Remote {
  id: string
  name: string
  // Who they are across visits and tabs; direct messages and mentions go by this.
  member: string
  look: AvatarLook
  zone: string
  seat: string
  // Server time they arrived, and their standing.
  joinedAt: number
  level: number
  totalSeconds: number
  streak: number
  callSeconds: number
  pomodoros: number
  messages: number
  days: number
  metres: number
  songs: number
  // When they first joined, and what they say about themselves.
  since: number
  about: string
  status: string
  x: number
  z: number
  facing: number
  tx: number
  tz: number
  tfacing: number
  moving: boolean
}
export const remotes = new Map<string, Remote>()

// `to` is empty for the room everyone shares, otherwise the member a direct message is for.
export interface ChatLine {
  // Session that sent it, when it arrived live; empty for history.
  id: string
  from: string
  name: string
  text: string
  at: number
  to: string
  mentions: string[]
}

// The conversation a line belongs to: '' for the room, otherwise the other person's member key.
export const talkOf = (line: ChatLine, me: string) => (line.to ? (line.from === me ? line.to : line.from) : '')

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
  // 'timer' is a plain one-off countdown; `focusMin` then holds its length.
  phase: 'idle' | 'focus' | 'break' | 'timer'
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

export interface CommentItem {
  id: string
  author: string
  authorId: string
  text: string
  at: number
  mentions: string[]
}

export interface NoteItem {
  id: string
  board: BoardId
  text: string
  author: string
  // Account of whoever wrote it, or '' for a guest.
  authorId: string
  comments: CommentItem[]
  color: string
  // Centre of the note as a fraction of the board; the highest z lies on top.
  x: number
  y: number
  z: number
  at: number
  votes: string[]
  mentions: string[]
}

export interface BookingItem {
  id: string
  zone: ZoneId
  by: string
  start: number
  until: number
}

// Someone knocking on the closed door of the room we are seated in.
export interface Knock {
  from: string
  name: string
  zone: ZoneId
}

// A bed in the Focus Garden. `member` is the account it belongs to, or '' on a server without accounts.
export interface Bed {
  name: string
  seconds: number
  member: string
}

// Someone's bed, by account when there is one and by name otherwise.
export const bedFor = (garden: Bed[], member: string, name: string) => garden.find((b) => (b.member ? b.member === member : b.name === name))

// What decides which plants a bed grows: fixed to the account, so a new name keeps the same garden.
export const seedOf = (bed: Bed | undefined, name: string) => bed?.member || name

interface NetState {
  // Focus Garden beds in the order they were first planted: who, and their total focus time.
  garden: Bed[]
  // Claimed workroom desks (desk id -> owner's name), the meeting room schedule, and rooms whose door is closed (zone -> who closed it).
  desks: Record<string, string>
  bookings: BookingItem[]
  closed: Record<string, string>
  knock: Knock | null
  // Our own member key, whether it is an account, and when we were last here before this visit.
  me: string
  account: boolean
  seenAt: number
  // When we first joined, and our own introduction.
  since: number
  about: string
  // Every account that has ever joined, here or away.
  people: Person[]
  // Bonds we have been told about, by whose they are. Our own are kept up to date.
  bonds: Record<string, BondWith[]>
  // The conversation the chat is showing ('' is the room), and unread counts per conversation.
  // The room counts only messages that name us.
  talk: string
  talks: string[]
  unread: Record<string, number>
  // Bulletin board notes, oldest first; and what each other person says they are up to.
  notes: NoteItem[]
  statuses: Record<string, string>
  pomo: PomoState
  ringing: Ring | null
  // Set when the server turned us away for lack of an invite code after we were already inside.
  inviteNeeded: boolean
  // Likewise when it would not take our sign-in.
  loginNeeded: boolean
  // True while we are seated in a room that has a call; `call` lists the others seated in that room.
  inCall: boolean
  call: string[]
  // Occupied seats, by seat id, with the sitter's name.
  taken: Record<string, string>
  // Level of each other player, for name plates; and when we ourselves arrived (server time).
  ranks: Record<string, number>
  // How many days running each other player has come in.
  streaks: Record<string, number>
  // Our own alarm (server time it rings, 0 for none), and the one going off right now.
  alarm: { at: number; label: string }
  alarmRinging: { at: number; label: string } | null
  // Our own to-do list: whether others may see it, and how many more tasks can help our plant today.
  tasks: { list: Task[]; shared: boolean; bonusLeft: number }
  // Lists we have opened to look at, by whose they are, with the visits in which they finished tasks.
  tasksOf: Record<string, { shared: boolean; list: Task[]; sessions: TaskSession[] }>
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

export const useNet = create<NetState>(() => ({ me: '', account: false, seenAt: 0, since: 0, about: '', people: [], bonds: {}, streaks: {}, alarm: { at: 0, label: '' }, alarmRinging: null, tasks: { list: [], shared: false, bonusLeft: 0 }, tasksOf: {}, talk: '', talks: [], unread: {}, loginNeeded: false, inviteNeeded: false, garden: [], desks: {}, bookings: [], closed: {}, knock: null, notes: [], statuses: {}, pomo: NO_TIMER, ringing: null, inCall: false, call: [], taken: {}, ranks: {}, selfJoinedAt: 0, juke: NO_MUSIC, jukeError: null, status: 'offline', selfId: null, ids: [], chat: [], bubbles: {} }))

const SEND_MS = 80
const MAX_CHAT = 400
const CONNECT_TIMEOUT_MS = 8000
const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`

let room: Room<any> | null = null
let sendTimer: ReturnType<typeof setInterval> | undefined
let clockTimer: ReturnType<typeof setInterval> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
let inviteCode = ''

// Close codes the server uses when the invite code is missing or wrong, and when sign-in is needed.
const INVITE_REJECTED = 4401
const LOGIN_REJECTED = 4402

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
  const net = useNet.getState()
  if (me.joinedAt && net.selfJoinedAt !== me.joinedAt) useNet.setState({ selfJoinedAt: me.joinedAt })
  if (net.since !== me.since || net.about !== me.about) useNet.setState({ since: me.since ?? 0, about: me.about ?? '' })
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
  const streaks: Record<string, number> = {}
  const statuses: Record<string, string> = {}
  for (const r of remotes.values()) {
    ranks[r.id] = r.level
    streaks[r.id] = r.streak
    if (r.status) statuses[r.id] = r.status
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
  if (JSON.stringify(s.streaks) !== JSON.stringify(streaks)) patch.streaks = streaks
  if (JSON.stringify(s.statuses) !== JSON.stringify(statuses)) patch.statuses = statuses
  if (Object.keys(patch).length) useNet.setState(patch)
}

let notesKey = ''
function syncNotes(state: any) {
  const notes: NoteItem[] = []
  const keys = (list: string) => (list ? list.split(' ') : [])
  state.notes?.forEach((n: any) => {
    const comments: CommentItem[] = []
    n.comments?.forEach((c: any) => comments.push({ id: c.id, author: c.author, authorId: c.authorId, text: c.text, at: c.at, mentions: keys(c.mentions) }))
    notes.push({ id: n.id, board: isBoard(n.board) ? n.board : 'fun', text: n.text, author: n.author, authorId: n.authorId, comments, color: n.color, x: n.x, y: n.y, z: n.z, at: n.at, votes: keys(n.votes), mentions: keys(n.mentions) })
  })
  const key = JSON.stringify(notes)
  if (key === notesKey) return
  // A note going up makes a sound, though not the ones already there when we walk in.
  if (notesKey && notes.some((n) => !useNet.getState().notes.some((old) => old.id === n.id))) pat()
  notesKey = key
  useNet.setState({ notes })
}

let gardenKey = ''
function syncGarden(state: any) {
  const garden: Bed[] = []
  state.garden?.forEach((p: any) => garden.push({ name: p.name, seconds: p.seconds, member: p.member ?? '' }))
  const key = JSON.stringify(garden)
  if (key === gardenKey) return
  gardenKey = key
  useNet.setState({ garden })
}

let reservationsKey = ''
function syncReservations(state: any) {
  const desks: Record<string, string> = {}
  state.desks?.forEach((c: any) => (desks[c.deskId] = c.owner))
  const bookings: BookingItem[] = []
  state.bookings?.forEach((b: any) => bookings.push({ id: b.id, zone: b.zone, by: b.by, start: b.start, until: b.until }))
  bookings.sort((a, b) => a.start - b.start)
  const closed: Record<string, string> = {}
  state.doors?.forEach((d: any) => (closed[d.zone] = d.by))
  const key = JSON.stringify([desks, bookings, closed])
  if (key === reservationsKey) return
  reservationsKey = key
  useNet.setState({ desks, bookings, closed })
}

let pomoKey = ''
function syncPomodoro(state: any) {
  const p = state.pomodoro
  if (!p) return
  const pomo: PomoState = {
    phase: p.phase === 'focus' || p.phase === 'break' || p.phase === 'timer' ? p.phase : 'idle',
    endsAt: p.endsAt ?? 0,
    paused: !!p.paused,
    remainingMs: p.remainingMs ?? 0,
    focusMin: p.focusMin || 25,
    breakMin: p.breakMin ?? 5,
    round: p.round ?? 0,
    startedBy: p.startedBy ?? '',
  }
  const key = JSON.stringify(pomo)
  if (key === pomoKey) return
  pomoKey = key
  useNet.setState({ pomo })
}

// Bumped when someone already here changes their name or look, so lists and avatars redraw.
let cast = 0
let drawn = 0
function syncPlayers(state: any, selfId: string) {
  const seen = new Set<string>()
  const me = state.players?.get(selfId)
  if (me) syncSelf(me)
  state.players?.forEach((p: any, id: string) => {
    if (id === selfId) return
    seen.add(id)
    const r = remotes.get(id)
    if (r) {
      // A profile can be edited while its owner is here.
      if (r.name !== p.name || r.look.robe !== p.robe || r.look.hair !== p.hair || r.look.hat !== p.hat) {
        r.name = p.name
        r.look = { ...r.look, robe: p.robe, trim: p.trim, hair: p.hair, hat: p.hat }
        cast++
      }
      r.metres = p.metres
      r.songs = p.songs
      r.about = p.about
      r.tx = p.x
      r.tz = p.z
      r.tfacing = p.facing
      r.moving = p.moving
      r.zone = p.zone
      r.seat = p.seat
      r.level = p.level
      r.totalSeconds = p.totalSeconds
      r.streak = p.streak
      r.callSeconds = p.callSeconds
      r.pomodoros = p.pomodoros
      r.messages = p.messages
      r.days = p.days
      r.status = p.status
    } else {
      remotes.set(id, {
        id,
        name: p.name,
        member: p.member,
        look: { ...DEFAULT_LOOK, robe: p.robe, trim: p.trim, hair: p.hair, hat: p.hat },
        zone: p.zone,
        seat: p.seat,
        joinedAt: p.joinedAt,
        level: p.level,
        totalSeconds: p.totalSeconds,
        streak: p.streak,
        callSeconds: p.callSeconds,
        pomodoros: p.pomodoros,
        messages: p.messages,
        days: p.days,
        metres: p.metres,
        songs: p.songs,
        since: p.since,
        about: p.about,
        status: p.status,
        x: p.x, z: p.z, facing: p.facing,
        tx: p.x, tz: p.z, tfacing: p.facing,
        moving: p.moving,
      })
    }
  })
  for (const id of remotes.keys()) if (!seen.has(id)) remotes.delete(id)
  const ids = [...remotes.keys()]
  const prev = useNet.getState().ids
  if (ids.length !== prev.length || ids.some((id, i) => id !== prev[i]) || cast !== drawn) {
    drawn = cast
    useNet.setState({ ids })
  }
  syncCall()
}

function disconnected(profile: Profile) {
  clearInterval(sendTimer)
  clearInterval(clockTimer)
  jukeKey = ''
  pomoKey = ''
  notesKey = ''
  reservationsKey = ''
  gardenKey = ''
  ringtone.stop()
  alarmBell.stop()
  room = null
  remotes.clear()
  useNet.setState({ status: 'offline', selfId: null, ids: [], juke: NO_MUSIC, pomo: NO_TIMER, ringing: null, alarmRinging: null, knock: null, desks: {}, bookings: [], closed: {}, inCall: false, call: [], taken: {}, ranks: {} })
  useGame.setState({ seat: null, pendingSeat: null })
  clearTimeout(retryTimer)
  retryTimer = setTimeout(async () => {
    // If a background retry is refused for the invite code, wandering around alone forever helps nobody:
    // go back to the title screen, which asks for the code.
    const result = await connect(profile, inviteCode)
    if ((result === 'invite' || result === 'login') && useGame.getState().profile) {
      useNet.setState(result === 'invite' ? { inviteNeeded: true } : { loginNeeded: true })
      useGame.setState({ profile: null })
    }
  }, 3000)
}

// Joins the shared office. If the server is unreachable the office still works solo and we keep retrying.
// Resolves to 'online', to 'invite' when the server wants an invite code we did not supply, to 'login'
// when it wants us signed in, or to 'offline'.
export async function connect(profile: Profile, code = ''): Promise<'online' | 'invite' | 'login' | 'offline'> {
  if (room) return 'online'
  if (useNet.getState().status === 'connecting') return 'offline'
  inviteCode = code
  clearTimeout(retryTimer)
  useNet.setState({ status: 'connecting' })
  try {
    const { robe, trim, hair, hat } = profile.look
    const token = await accessToken()
    // An unreachable server can leave the browser waiting a long time; give up after a few seconds
    // so the title screen never hangs, and drop the connection if it turns up late.
    const attempt = new Client(SERVER_URL).joinOrCreate<any>('office', { name: profile.name, robe, trim, hair, hat, code, token, status: useGame.getState().status, carry: carried(), tzOffset: new Date().getTimezoneOffset() })
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
      syncNotes(state)
      syncReservations(state)
      syncGarden(state)
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
    joined.onMessage('pomo:done', (m: { finished: 'focus' | 'break' | 'timer' }) => {
      bell(m.finished !== 'break')
      if (m.finished === 'timer') announce("Time's up", 'Timer finished')
      else if (m.finished === 'focus') announce('Break time', 'Focus session complete')
      else announce('Back to focus', 'Break is over')
    })
    joined.onMessage('notice', (m: { title: string; detail: string }) => announce(m.title, m.detail))
    joined.onMessage('knock', (m: Knock) => {
      if (useNet.getState().knock) return
      useNet.setState({ knock: m })
      knockSound()
      clearTimeout(knockTimeout)
      knockTimeout = setTimeout(() => useNet.getState().knock?.from === m.from && useNet.setState({ knock: null }), RING_SECONDS * 1000)
    })
    // Someone else in the room answered it.
    joined.onMessage('knock:settled', (m: { from: string }) => useNet.getState().knock?.from === m.from && useNet.setState({ knock: null }))
    joined.onMessage('knock:answer', (m: { name: string; zone: ZoneId; accept: boolean }) => {
      announce(m.name, m.accept ? 'let you in' : 'cannot let you in right now')
      if (m.accept) joinCallIn(m.zone)
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
    // Who we are to the server, then our progress as it counts it.
    let arriving = true
    joined.onMessage('me', (m: { member: string; account: boolean; seenAt: number }) => {
      arriving = true
      useNet.setState({ me: m.member, account: m.account, seenAt: m.seenAt })
    })
    joined.onMessage('progress', (p: Progress) => {
      receive(p, useNet.getState().account, arriving)
      arriving = false
    })
    joined.onMessage('people', (people: Person[]) => useNet.setState({ people }))
    joined.onMessage('chat:history', (lines: ChatLine[]) => {
      const { me, seenAt, talk } = useNet.getState()
      const unread: Record<string, number> = {}
      const talks = new Set(useNet.getState().talks)
      for (const line of lines) {
        const t = talkOf(line, me)
        if (t) talks.add(t)
        // Anything for us since we were last here is waiting to be read.
        if (line.from !== me && line.at > seenAt && t !== talk && (t || line.mentions.includes(me))) unread[t] = (unread[t] ?? 0) + 1
      }
      useNet.setState({ chat: lines.slice(-MAX_CHAT), unread, talks: [...talks] })
      const waiting = Object.values(unread).reduce((a, b) => a + b, 0)
      if (waiting) announce('While you were away', `${waiting} ${waiting === 1 ? 'message is' : 'messages are'} waiting for you`)
    })
    joined.onMessage('mention', (m: { name: string; where: string }) => {
      ping()
      announce(m.name, m.where === 'reply' ? 'commented on your note' : m.where === 'comment' ? 'named you in a comment' : 'named you on the bulletin board')
    })
    joined.onMessage('alarm', (alarm: NetState['alarm']) => useNet.setState({ alarm }))
    joined.onMessage('alarm:ring', (m: { at: number; label: string; missed: boolean }) => {
      if (m.missed) return announce('You missed an alarm', `${new Date(m.at - clockOffset).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${m.label ? ` · ${m.label}` : ''}`)
      useNet.setState({ alarmRinging: { at: m.at, label: m.label } })
      alarmBell.start()
      clearTimeout(alarmTimeout)
      alarmTimeout = setTimeout(() => stopAlarm(), ALARM_SECONDS * 1000)
    })
    joined.onMessage('tasks', (tasks: NetState['tasks']) => useNet.setState({ tasks }))
    joined.onMessage('tasks:of', (m: { of: string; shared: boolean; list: Task[]; sessions: TaskSession[] }) => useNet.setState((s) => ({ tasksOf: { ...s.tasksOf, [m.of]: m } })))
    let greeted = false
    joined.onMessage('bonds', (m: { of: string; list: BondWith[] }) => {
      useNet.setState((s) => ({ bonds: { ...s.bonds, [m.of]: m.list } }))
      // The first word about our own bonds is the moment to mention requests that came while we were away.
      if (greeted || m.of !== useNet.getState().me) return
      greeted = true
      const asking = m.list.filter((b) => b.askedBy === b.id)
      if (asking.length) announce(asking.length === 1 ? asking[0].name : `${asking.length} people`, asking.length === 1 ? 'wants to be friends' : 'want to be friends')
    })
    joined.onMessage('friend', (m: { name: string; what: 'asked' | 'accepted' }) => {
      ping()
      announce(m.name, m.what === 'asked' ? 'wants to be friends' : 'is now your friend')
    })
    joined.onMessage('chat', (m: ChatLine) => {
      const { me, talk } = useNet.getState()
      const t = talkOf(m, me)
      const forMe = m.from !== me && (!!t || m.mentions.includes(me))
      useNet.setState((s) => ({
        chat: [...s.chat.slice(1 - MAX_CHAT), m],
        talks: t && !s.talks.includes(t) ? [...s.talks, t] : s.talks,
        unread: forMe && t !== talk ? { ...s.unread, [t]: (s.unread[t] ?? 0) + 1 } : s.unread,
      }))
      if (forMe) {
        ping()
        if (t !== talk) announce(m.name, t ? 'sent you a message' : 'mentioned you')
      }
      // Speech bubbles are for what is said out loud in the room.
      if (!m.to) bubble(m.id, m.text.length > 70 ? `${m.text.slice(0, 68)}…` : m.text, 5000)
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
    const refused = (e as { code?: number })?.code
    if (refused === INVITE_REJECTED || refused === LOGIN_REJECTED) {
      // Retrying would only be refused again; the title screen asks for what is missing instead.
      useNet.setState({ status: 'offline' })
      return refused === INVITE_REJECTED ? 'invite' : 'login'
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
let knockTimeout: ReturnType<typeof setTimeout> | undefined

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

export const desks = {
  claim: (deskId: string) => room?.send('desk:claim', deskId),
  release: () => room?.send('desk:release'),
}

export const rooms = {
  // `start` is a time on this computer's clock; it is translated to the server's.
  book: (zone: ZoneId, start: number | null, minutes: number) => room?.send('room:book', { zone, start: start === null ? undefined : start + clockOffset, minutes }),
  cancel: (id: string) => room?.send('room:cancel', id),
  closeDoor: () => room?.send('door:close'),
  openDoor: () => room?.send('door:open'),
}

export function answerKnock(accept: boolean) {
  const knock = useNet.getState().knock
  if (!knock) return
  clearTimeout(knockTimeout)
  useNet.setState({ knock: null })
  room?.send('knock:answer', { to: knock.from, accept })
}

export const board = {
  add: (note: { text: string; color: string; board: BoardId; x: number; y: number }) => room?.send('note:add', note),
  // `drop` is the end of a drag, which is when the server writes the place down.
  move: (id: string, x: number, y: number, drop: boolean) => room?.send('note:move', { id, x, y, drop }),
  vote: (id: string) => room?.send('note:vote', id),
  // Only the note's author can edit it; the server checks.
  edit: (id: string, text: string, color: string) => room?.send('note:edit', { id, text, color }),
  comment: (id: string, text: string) => room?.send('note:comment', { id, text }),
  remove: (id: string) => room?.send('note:remove', id),
}

const ALARM_SECONDS = 60
let alarmTimeout: ReturnType<typeof setTimeout> | undefined

// Our own alarm. Times here are on this computer's clock; they are translated to the server's.
export const alarm = {
  set: (at: number, label: string) => room?.send('alarm:set', { at: at + clockOffset, label }),
  clear: () => room?.send('alarm:clear'),
  // When the alarm we have set will ring, by this computer's clock, to the nearest minute: the two
  // clocks are only lined up to within a fraction of a second, which must not show as the minute before.
  localTime: (at: number) => Math.round((at - clockOffset) / 60000) * 60000,
}

// Silences an alarm that is going off; `snoozeMinutes` sets it again for a little later.
export function stopAlarm(snoozeMinutes = 0) {
  const ringing = useNet.getState().alarmRinging
  clearTimeout(alarmTimeout)
  alarmBell.stop()
  useNet.setState({ alarmRinging: null })
  if (ringing && snoozeMinutes) alarm.set(Date.now() + snoozeMinutes * 60000, ringing.label)
}

// Our own to-do list. The server holds it; each of these comes back as a fresh `tasks`.
export const todo = {
  add: (title: string) => room?.send('task:add', title),
  edit: (id: string, title: string) => room?.send('task:edit', { id, title }),
  done: (id: string, done: boolean) => room?.send('task:done', { id, done }),
  remove: (id: string) => room?.send('task:remove', id),
  // Puts a task just before another, or last when `before` is left out.
  move: (id: string, before?: string) => room?.send('task:move', { id, before }),
  clear: () => room?.send('task:clear'),
  // Closes the session: finished tasks are logged on the profile and cleared, the rest stay.
  finish: () => room?.send('task:finish'),
  share: (shared: boolean) => room?.send('task:share', shared),
  // Opens someone's list so it arrives in `tasksOf` and stays up to date; '' stops.
  watch: (key: string) => room?.send('tasks:watch', key),
}

// Asks for someone's bonds; the answer arrives in `bonds` under their key.
export const askBonds = (key: string) => room?.send('bonds:of', key)

export const friends = {
  // Asks to be friends, or says yes to someone who asked first.
  add: (key: string) => room?.send('friend:add', key),
  // Ends a friendship, declines a request, or takes one back.
  remove: (key: string) => room?.send('friend:remove', key),
}

// Changes our own name, look and introduction, here and on the account.
export function saveCard(profile: Profile, about: string) {
  useGame.getState().enter(profile)
  const { robe, trim, hair, hat } = profile.look
  room?.send('profile:set', { name: profile.name, robe, trim, hair, hat, about })
}

// Tells everyone what you are up to; an empty string clears it.
export function setStatus(status: string) {
  const clean = status.trim().slice(0, 40)
  useGame.setState({ status: clean })
  saveStatus(clean)
  room?.send('status', clean)
}

export const pomodoro = {
  start: (focusMin: number, breakMin: number) => room?.send('pomo:start', { focusMin, breakMin }),
  timer: (minutes: number) => room?.send('pomo:timer', { minutes }),
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

// Says something in the conversation the chat is showing.
export const sendChat = (text: string) => room?.send('chat', { text, to: useNet.getState().talk })

// Turns the chat to a conversation: '' for the room, or a member key for a direct message.
export function openTalk(talk: string) {
  useNet.setState((s) => {
    const { [talk]: _, ...unread } = s.unread
    return { talk, unread, talks: talk && !s.talks.includes(talk) ? [...s.talks, talk] : s.talks }
  })
}
export const closeTalk = (talk: string) => useNet.setState((s) => ({ talks: s.talks.filter((t) => t !== talk), talk: s.talk === talk ? '' : s.talk }))

// Everyone who can be named or messaged: every account, plus whoever is here now. `here` marks the latter.
export function everyone(): (Person & { here: boolean })[] {
  const { people, me } = useNet.getState()
  const all = new Map<string, Person & { here: boolean }>()
  for (const p of people) all.set(p.id, { ...p, here: p.id === me })
  for (const r of remotes.values()) if (r.member) all.set(r.member, { id: r.member, name: r.name, here: true })
  const mine = useGame.getState().profile?.name
  if (me && mine) all.set(me, { id: me, name: mine, here: true })
  return [...all.values()].sort((a, b) => Number(b.here) - Number(a.here) || a.name.localeCompare(b.name))
}
export const sendEmote = (emote: Emote) => room?.send('emote', emote)

export const jukebox = {
  add: (url: string) => {
    if (!room) return
    room.send('juke:add', url)
  },
  skip: () => room?.send('juke:skip'),
  remove: (id: string) => room?.send('juke:remove', id),
  pause: () => room?.send('juke:pause'),
  play: () => room?.send('juke:play'),
  ended: (id: string) => room?.send('juke:ended', id),
  duration: (id: string, duration: number) => room?.send('juke:duration', { id, duration }),
}

if (import.meta.env.DEV) Object.assign((window as any).__game, { net: { useNet, remotes, jukebox, sendChat, sendEmote, requestSit, standUp, connect, ringPerson, answerRing, pomodoro, board, setStatus, desks, rooms, answerKnock, openTalk } })

// This module owns a live connection, so a hot update cannot be applied in place.
import.meta.hot?.dispose(() => {
  room?.leave()
  location.reload()
})

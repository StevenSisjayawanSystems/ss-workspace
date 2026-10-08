import { Room, ServerError, type Client } from 'colyseus'
import { schema, t, type SchemaType } from '@colyseus/schema'
import { QUIET_ZONES, ROOMS, SIT_REACH, SPAWN, nearestWalkable, parseYouTubeId, seatById, standSpot, zoneAt, type ZoneId } from '@guildhouse/shared'
import { config, inviteAccepted } from '../config'
import { MAX_NOTES, MAX_NOTE_LENGTH, NOTE_COLORS, Note, NoteStore, type SavedNote } from '../notes'
import { iceServers } from '../ice'
import * as juke from '../jukebox'
import * as pomo from '../pomodoro'
import * as res from '../reservations'
import { cleanColor, cleanText, validMove } from '../rules'

export const Player = schema(
  {
    name: t.string(),
    x: t.number(),
    z: t.number(),
    facing: t.number(),
    moving: t.boolean(),
    zone: t.string(),
    robe: t.string(),
    trim: t.string(),
    hair: t.string(),
    hat: t.boolean(),
    // Id of the seat this player is in, or '' when standing. Seated players in a room share its call.
    seat: t.string(),
    // Server time this player arrived, so everyone can see how long they have been in.
    joinedAt: t.number(),
    // Self-reported standing, shown to others. Kept by each browser until there are accounts.
    level: t.number(),
    totalSeconds: t.number(),
    streak: t.number(),
    callSeconds: t.number(),
    pomodoros: t.number(),
    messages: t.number(),
    days: t.number(),
    // What they are up to right now, in their own words: 'Focusing', 'Back in 5'...
    status: t.string(),
  },
  'Player',
)
export type Player = SchemaType<typeof Player>

export const OfficeState = schema({ players: t.map(Player), jukebox: juke.Jukebox, pomodoro: pomo.Pomodoro, notes: t.array(Note), desks: t.array(res.DeskClaim), bookings: t.array(res.Booking), doors: t.array(res.ClosedDoor) }, 'OfficeState')
export type OfficeState = SchemaType<typeof OfficeState>

// Close code sent when the invite code is missing or wrong.
export const INVITE_REJECTED = 4401

const EMOTES = new Set(['wave', 'heart', 'laugh', 'cheer'])

export class OfficeRoom extends Room {
  maxClients = 50
  state = new OfficeState()
  private lastMove = new Map<string, number>()
  private lastChat = new Map<string, number>()
  private lastRing = new Map<string, number>()
  private lastKnock = new Map<string, number>()
  private store = new NoteStore(config.dataDir)
  private reservations = new res.ReservationStore(config.dataDir)
  private adds: Promise<void> = Promise.resolve()

  onCreate() {
    this.onMessage('move', (client: Client, msg: { x: number; z: number; facing: number; moving: boolean }) => {
      const p = this.state.players.get(client.sessionId)
      if (!p || !msg || p.seat) return
      const now = Date.now()
      const elapsed = now - (this.lastMove.get(client.sessionId) ?? now)
      if (!validMove(p, msg, elapsed)) {
        client.send('snap', { x: p.x, z: p.z })
        return
      }
      this.lastMove.set(client.sessionId, now)
      p.x = msg.x
      p.z = msg.z
      p.facing = Number.isFinite(msg.facing) ? msg.facing : p.facing
      p.moving = !!msg.moving
      p.zone = zoneAt(Math.round(p.x), Math.round(p.z)) ?? p.zone
    })

    this.onMessage('sit', (client: Client, id: unknown) => {
      const p = this.state.players.get(client.sessionId)
      const seat = typeof id === 'string' ? seatById(id) : undefined
      if (!p || !seat) return
      let taken = false
      this.state.players.forEach((other, sid) => {
        if (sid !== client.sessionId && other.seat === seat.id) taken = true
      })
      if (taken || (!p.seat && Math.hypot(seat.x - p.x, seat.z - p.z) > SIT_REACH + 0.6)) return
      const insideAlready = !!p.seat && p.zone === seat.zone
      const refused = res.seatRefusal(this.state, seat.id, seat.zone, p.name, insideAlready)
      if (refused === res.KNOCK) return this.knock(client, p.name, seat.zone)
      if (refused) return client.send('notice', { title: refused, detail: 'Pick another seat' })
      p.seat = seat.id
      p.x = seat.x
      p.z = seat.z
      p.facing = seat.facing
      p.moving = false
      p.zone = seat.zone
    })

    this.onMessage('stand', (client: Client) => {
      const p = this.state.players.get(client.sessionId)
      const seat = p && seatById(p.seat)
      if (!p || !seat) return
      const spot = standSpot(seat)
      p.seat = ''
      p.x = spot.x
      p.z = spot.z
      this.lastMove.set(client.sessionId, Date.now())
    })

    // Closing the door of the room you are seated in means newcomers knock; anyone seated there can reopen it.
    this.onMessage('door:close', (client: Client) => {
      const p = this.state.players.get(client.sessionId)
      if (!p?.seat) return
      const problem = res.closeDoor(this.state, p.zone, p.name)
      if (problem) client.send('notice', { title: problem, detail: 'Only the council chambers have doors' })
    })
    this.onMessage('door:open', (client: Client) => {
      const p = this.state.players.get(client.sessionId)
      if (p?.seat) res.openDoor(this.state, p.zone)
    })

    // Someone seated inside answers a knock.
    this.onMessage('knock:answer', (client: Client, m: { to?: unknown; accept?: unknown }) => {
      const host = this.state.players.get(client.sessionId)
      const guest = typeof m?.to === 'string' ? this.state.players.get(m.to) : undefined
      if (!host?.seat || !guest || !res.doorClosed(this.state, host.zone)) return
      const accept = m.accept === true
      if (accept) res.admit(this.state, host.zone, guest.name)
      this.clients.find((c) => c.sessionId === m.to)?.send('knock:answer', { name: host.name, zone: host.zone, accept })
      // The knock is settled for everyone else in the room too.
      this.broadcast('knock:settled', { from: m.to })
    })

    // WebRTC signalling: passed along only between two people seated in the same room's call.
    this.onMessage('rtc', (client: Client, msg: { to?: string; data?: unknown }) => {
      const from = this.state.players.get(client.sessionId)
      const to = msg && typeof msg.to === 'string' ? this.state.players.get(msg.to) : undefined
      if (!from || !to || !from.seat || !to.seat || from.zone !== to.zone) return
      if (QUIET_ZONES.includes(from.zone as ZoneId)) return
      this.clients.find((c) => c.sessionId === msg.to)?.send('rtc', { from: client.sessionId, data: msg.data })
    })

    // Desks and meeting rooms
    this.reservations.restore(this.state, Date.now())
    const tell = (client: Client, problem: string | null, detail: string) => problem && client.send('notice', { title: problem, detail })
    this.onMessage('desk:claim', (client: Client, deskId: unknown) => {
      const p = this.state.players.get(client.sessionId)
      if (!p) return
      tell(client, res.claimDesk(this.state, deskId, p.name), 'Choose a free desk')
      this.saveReservations()
    })
    this.onMessage('desk:release', (client: Client) => {
      const p = this.state.players.get(client.sessionId)
      if (p && res.releaseDesk(this.state, p.name)) this.saveReservations()
    })
    this.onMessage('room:book', (client: Client, m: { zone?: unknown; start?: unknown; minutes?: unknown }) => {
      const p = this.state.players.get(client.sessionId)
      if (!p || !m) return
      tell(client, res.bookRoom(this.state, m.zone, m.start, m.minutes, p.name, Date.now()), 'Try another time or the other chamber')
      this.saveReservations()
    })
    this.onMessage('room:cancel', (client: Client, id: unknown) => {
      const p = this.state.players.get(client.sessionId)
      if (p && res.cancelBooking(this.state, id, p.name)) this.saveReservations()
    })

    // Bulletin board
    for (const saved of this.store.load()) this.state.notes.push(this.toNote(saved))
    this.onMessage('note:add', (client: Client, m: { text?: unknown; color?: unknown }) => {
      const p = this.state.players.get(client.sessionId)
      const text = cleanText(m?.text, MAX_NOTE_LENGTH)
      if (!p || !text) return
      while (this.state.notes.length >= MAX_NOTES) this.state.notes.shift()
      const now = Date.now()
      this.state.notes.push(
        this.toNote({
          id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          author: p.name,
          color: NOTE_COLORS.includes(m?.color as string) ? (m.color as string) : NOTE_COLORS[0],
          at: now,
        }),
      )
      this.saveNotes()
    })
    this.onMessage('note:remove', (_c: Client, id: unknown) => {
      const i = this.state.notes.findIndex((n) => n.id === id)
      if (i < 0) return
      this.state.notes.splice(i, 1)
      this.saveNotes()
    })

    this.onMessage('status', (client: Client, raw: unknown) => {
      const p = this.state.players.get(client.sessionId)
      if (p) p.status = cleanText(raw, 40)
    })

    this.onMessage('progress', (client: Client, msg: Record<string, unknown>) => {
      const p = this.state.players.get(client.sessionId)
      if (p && msg) this.setStanding(p, msg)
    })

    this.onMessage('chat', (client: Client, raw: unknown) => {
      const p = this.state.players.get(client.sessionId)
      const text = cleanText(raw, 240)
      const now = Date.now()
      if (!p || !text || now - (this.lastChat.get(client.sessionId) ?? 0) < 300) return
      this.lastChat.set(client.sessionId, now)
      this.broadcast('chat', { id: client.sessionId, name: p.name, text, at: now })
    })

    this.state.jukebox ??= new juke.Jukebox()
    const jb = this.state.jukebox
    this.state.pomodoro ??= new pomo.Pomodoro()
    const timer = this.state.pomodoro
    pomo.reset(timer)
    this.setSimulationInterval(() => {
      const now = Date.now()
      juke.tick(jb, now)
      if (res.expire(this.state, now)) this.saveReservations()
      res.reopenEmpty(this.state, this.occupied())
      const finished = pomo.tick(timer, now)
      // Everyone hears the bell; only a finished focus session earns credit.
      if (finished) this.broadcast('pomo:done', { finished, round: timer.round })
    }, 1000)

    this.onMessage('pomo:start', (client: Client, m: { focusMin?: unknown; breakMin?: unknown }) => {
      const p = this.state.players.get(client.sessionId)
      if (p && m) pomo.start(timer, m.focusMin, m.breakMin, p.name, Date.now())
    })
    this.onMessage('pomo:timer', (client: Client, m: { minutes?: unknown }) => {
      const p = this.state.players.get(client.sessionId)
      if (p && m) pomo.startTimer(timer, m.minutes, p.name, Date.now())
    })
    this.onMessage('pomo:pause', () => pomo.pause(timer, Date.now()))
    this.onMessage('pomo:resume', () => pomo.resume(timer, Date.now()))
    this.onMessage('pomo:skip', () => pomo.skip(timer, Date.now()))
    this.onMessage('pomo:stop', () => pomo.reset(timer))

    // Ringing someone: asks them to come and sit in on a call in the caller's room.
    this.onMessage('ring', (client: Client, m: { to?: unknown; zone?: unknown }) => {
      const from = this.state.players.get(client.sessionId)
      const now = Date.now()
      if (!from || !m || typeof m.to !== 'string' || m.to === client.sessionId) return
      const zone = ROOMS.find((r) => r.id === m.zone)?.id
      if (!zone || QUIET_ZONES.includes(zone) || now - (this.lastRing.get(client.sessionId) ?? 0) < 2000) return
      this.lastRing.set(client.sessionId, now)
      this.clients.find((c) => c.sessionId === m.to)?.send('ring', { from: client.sessionId, name: from.name, zone })
    })
    this.onMessage('ring:answer', (client: Client, m: { to?: unknown; accept?: unknown }) => {
      const from = this.state.players.get(client.sessionId)
      if (!from || !m || typeof m.to !== 'string') return
      this.clients.find((c) => c.sessionId === m.to)?.send('ring:answer', { from: client.sessionId, name: from.name, accept: m.accept === true })
    })

    // Lets clients line their clocks up with ours so everyone hears the same moment.
    this.onMessage('clock', (client: Client, t0: unknown) => client.send('clock', { t0, now: Date.now() }))

    this.onMessage('juke:add', (client: Client, raw: unknown) => {
      const p = this.state.players.get(client.sessionId)
      const videoId = typeof raw === 'string' ? parseYouTubeId(raw) : null
      if (!p || !videoId) return client.send('juke:error', 'That does not look like a YouTube link.')
      const addedBy = p.name
      // Title lookups take a moment; chaining them keeps the queue in the order people asked.
      this.adds = this.adds.then(async () => {
        const title = await this.lookupTitle(videoId)
        if (!juke.add(jb, { videoId, title, addedBy }, Date.now())) client.send('juke:error', 'The queue is full.')
      })
    })
    this.onMessage('juke:skip', () => juke.skip(jb, Date.now()))
    this.onMessage('juke:remove', (_c: Client, id: unknown) => typeof id === 'string' && juke.remove(jb, id, Date.now()))
    this.onMessage('juke:pause', () => juke.pause(jb, Date.now()))
    this.onMessage('juke:play', () => juke.play(jb, Date.now()))
    this.onMessage('juke:seek', (_c: Client, s: unknown) => typeof s === 'number' && juke.seek(jb, s, Date.now()))
    // Players report what their embed learned about the current track.
    this.onMessage('juke:duration', (_c: Client, m: { id?: string; duration?: number }) => {
      const cur = jb.queue[0]
      if (cur && m && cur.id === m.id && !cur.duration && typeof m.duration === 'number' && m.duration > 0 && m.duration < 86400) cur.duration = m.duration
    })
    this.onMessage('juke:ended', (_c: Client, id: unknown) => {
      if (jb.queue[0]?.id === id) juke.skip(jb, Date.now())
    })

    this.onMessage('emote', (client: Client, raw: unknown) => {
      if (typeof raw === 'string' && EMOTES.has(raw)) this.broadcast('emote', { id: client.sessionId, emote: raw })
    })
  }

  // oEmbed needs no API key. A failed lookup just leaves a plain title.
  private async lookupTitle(videoId: string): Promise<string> {
    try {
      const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (res.ok) return cleanText(((await res.json()) as { title?: string }).title, 120) || 'Untitled'
    } catch {
      // fall through
    }
    return 'YouTube video'
  }

  private toNote(s: SavedNote): Note {
    const n = new Note()
    n.id = s.id
    n.text = s.text
    n.author = s.author
    n.color = s.color
    n.at = s.at
    return n
  }

  // The door is closed: the knock goes to everyone seated inside.
  private knock(client: Client, name: string, zone: string) {
    const now = Date.now()
    if (now - (this.lastKnock.get(client.sessionId) ?? 0) < 4000) return
    this.lastKnock.set(client.sessionId, now)
    const inside = this.clients.filter((c) => {
      const p = this.state.players.get(c.sessionId)
      return !!p?.seat && p.zone === zone
    })
    for (const c of inside) c.send('knock', { from: client.sessionId, name, zone })
    client.send('notice', { title: 'Knock, knock', detail: 'The door is closed. Waiting to be let in' })
  }

  // Zones with at least one person seated.
  private occupied(): Set<string> {
    const zones = new Set<string>()
    this.state.players.forEach((p) => p.seat && zones.add(p.zone))
    return zones
  }

  private saveReservations() {
    this.reservations.save(this.state)
  }

  private saveNotes() {
    this.store.save(this.state.notes.map((n) => ({ id: n.id, text: n.text, author: n.author, color: n.color, at: n.at })))
  }

  private setStanding(p: Player, from: Record<string, unknown>) {
    const whole = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0)
    p.level = Math.max(1, whole(from.level, 999))
    p.totalSeconds = whole(from.totalSeconds, 1e9)
    p.streak = whole(from.streak, 100000)
    p.callSeconds = whole(from.callSeconds, 1e9)
    p.pomodoros = whole(from.pomodoros, 1e6)
    p.messages = whole(from.messages, 1e7)
    p.days = whole(from.days, 100000)
  }

  // The door: with INVITE_CODE set, nobody gets in without it.
  onAuth(_client: Client, options: Record<string, unknown> = {}) {
    if (!inviteAccepted(options?.code)) throw new ServerError(INVITE_REJECTED, 'invite')
    return true
  }

  onJoin(client: Client, options: Record<string, unknown> = {}) {
    const p = new Player()
    // Fan new arrivals out around the spawn tile so they do not stack.
    const n = this.state.players.size
    const spot = nearestWalkable(SPAWN.x + ((n % 3) - 1), SPAWN.z - Math.floor(n / 3) % 3) ?? SPAWN
    p.name = cleanText(options.name, 20) || 'Guest'
    p.x = spot.x
    p.z = spot.z
    p.facing = 0
    p.moving = false
    p.zone = zoneAt(spot.x, spot.z) ?? 'entrance'
    p.robe = cleanColor(options.robe, '#4a6fa5')
    p.trim = cleanColor(options.trim, '#e0b04a')
    p.hair = cleanColor(options.hair, '#7a4a2a')
    p.hat = options.hat !== false
    p.seat = ''
    p.joinedAt = Date.now()
    p.status = cleanText(options.status, 40)
    this.setStanding(p, options)
    this.state.players.set(client.sessionId, p)
    this.lastMove.set(client.sessionId, Date.now())
    client.send('snap', { x: p.x, z: p.z })
    // Call setup servers, including relay credentials, go only to people who are in.
    void iceServers().then((servers) => client.send('ice', servers))
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId)
    this.lastMove.delete(client.sessionId)
    this.lastChat.delete(client.sessionId)
    this.lastRing.delete(client.sessionId)
    this.lastKnock.delete(client.sessionId)
  }
}

import { Room, ServerError, type Client } from 'colyseus'
import { schema, t, type SchemaType } from '@colyseus/schema'
import { MAX_COMMENTS, MAX_COMMENT_LENGTH, MAX_NOTES, MAX_NOTE_LENGTH, NEW_BOND, NOTE_COLORS, QUIET_ZONES, ROOMS, SIT_REACH, SPAWN, isBoard, mentionsIn, nearestWalkable, onBoard, pairKey, parseYouTubeId, seatById, standSpot, zoneAt, type Bond, type Person, type ZoneId } from '@guildhouse/shared'
import { config, inviteAccepted } from '../config'
import { db, type ChatLine } from '../db'
import { Note, NoteStore, fromNote, toComment, toNote } from '../notes'
import { iceServers } from '../ice'
import { accrue, cleanOffset, cleanProgress, count, guestKey, newMember, standingOf, type Member } from '../members'
import * as garden from '../garden'
import * as juke from '../jukebox'
import * as pomo from '../pomodoro'
import * as res from '../reservations'
import { cleanBlock, cleanColor, cleanText, validMove } from '../rules'

export const Player = schema(
  {
    name: t.string(),
    // Who this is across visits and tabs: the account id, or a one-off key for a guest.
    member: t.string(),
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
    // Their standing, shown to others. Counted here on the server.
    level: t.number(),
    totalSeconds: t.number(),
    streak: t.number(),
    callSeconds: t.number(),
    pomodoros: t.number(),
    messages: t.number(),
    days: t.number(),
    metres: t.number(),
    songs: t.number(),
    // When they first joined, and a few words about themselves, for their profile.
    since: t.number(),
    about: t.string(),
    // What they are up to right now, in their own words: 'Focusing', 'Back in 5'...
    status: t.string(),
  },
  'Player',
)
export type Player = SchemaType<typeof Player>

export const OfficeState = schema({ players: t.map(Player), jukebox: juke.Jukebox, pomodoro: pomo.Pomodoro, notes: t.array(Note), desks: t.array(res.DeskClaim), bookings: t.array(res.Booking), doors: t.array(res.ClosedDoor), garden: t.array(garden.Plot) }, 'OfficeState')
export type OfficeState = SchemaType<typeof OfficeState>

// Close code sent when the invite code is missing or wrong.
export const INVITE_REJECTED = 4401
// Close code sent when this guildhouse has accounts and the client is not signed in.
export const LOGIN_REJECTED = 4402

// How often each person is told their own progress, and how often it is written down.
const PUSH_MS = 5000
const SAVE_MS = 30000

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
  private gardenStore = new garden.GardenStore(config.dataDir)
  private lastTend = Date.now()
  private lastGardenSave = 0
  private unplanted = 0
  private adds: Promise<void> = Promise.resolve()
  // Everyone here now, by member key and by session; and every account that has ever joined.
  private members = new Map<string, Member>()
  private bySession = new Map<string, Member>()
  private people = new Map<string, Person>()
  // What each pair of people has done together, by pair key; and the pairs changed since the last save.
  private bonds = new Map<string, Bond>()
  private bondsChanged = new Set<string>()
  // Reads and writes of member rows happen one at a time, so a quick leave-and-return cannot read a stale row.
  private writes: Promise<void> = Promise.resolve()
  private lastCredit = Date.now()
  private lastPush = 0
  private lastSave = Date.now()

  async onCreate() {
    if (db) for (const person of await db.people()) this.people.set(person.id, person)
    if (db) this.bonds = await db.bonds()
    // A person's bonds, strongest first, asked for when their profile is opened.
    this.onMessage('bonds:of', (client: Client, key: unknown) => typeof key === 'string' && client.send('bonds', this.bondsOf(key)))
    // Asking someone to be friends. If they had already asked us, this is the yes.
    this.onMessage('friend:add', (client: Client, key: unknown) => {
      const me = this.bySession.get(client.sessionId)
      if (!me || typeof key !== 'string' || key === me.key || !(this.members.has(key) || this.people.has(key))) return
      const bond = this.bond(me.key, key)
      if (bond.friends || bond.askedBy === me.key) return
      if (bond.askedBy === key) {
        bond.friends = true
        bond.askedBy = ''
        this.tell(key, 'friend', { name: me.name, what: 'accepted' })
      } else {
        bond.askedBy = me.key
        this.tell(key, 'friend', { name: me.name, what: 'asked' })
      }
      for (const who of [me.key, key]) this.tell(who, 'bonds', this.bondsOf(who))
    })
    // Ending a friendship, turning a request down, or taking one back. Nobody is told.
    this.onMessage('friend:remove', (client: Client, key: unknown) => {
      const me = this.bySession.get(client.sessionId)
      if (!me || typeof key !== 'string' || !this.bonds.has(pairKey(me.key, key))) return
      const bond = this.bond(me.key, key)
      bond.friends = false
      bond.askedBy = ''
      for (const who of [me.key, key]) this.tell(who, 'bonds', this.bondsOf(who))
    })
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
      const member = this.bySession.get(client.sessionId)
      if (member) count(member, 'metres', Math.hypot(msg.x - p.x, msg.z - p.z))
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

    // Focus garden
    for (const saved of this.gardenStore.load()) {
      const plot = new garden.Plot()
      plot.name = saved.name
      plot.seconds = saved.seconds
      this.state.garden.push(plot)
    }

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
    let saved = db ? await db.notes() : this.store.load()
    // Moving to Supabase: a board that was kept in a file is carried over once.
    if (db && !saved.length) {
      saved = this.store.load().map((n) => ({ ...n, authorId: '', votes: [], mentions: [], comments: [] }))
      for (const n of saved) void db.putNote(n).catch(warn)
    }
    for (const n of saved) this.state.notes.push(toNote(n))
    const noteById = (id: unknown) => this.state.notes.find((n) => n.id === id)
    const onTop = () => this.state.notes.reduce((top, n) => Math.max(top, n.z), 0) + 1
    this.onMessage('note:add', (client: Client, m: { text?: unknown; color?: unknown; board?: unknown; x?: unknown; y?: unknown }) => {
      const p = this.state.players.get(client.sessionId)
      const me = this.bySession.get(client.sessionId)
      const text = cleanBlock(m?.text, MAX_NOTE_LENGTH)
      if (!p || !me || !text) return
      const board = isBoard(m.board) ? m.board : 'fun'
      const full = this.state.notes.filter((n) => n.board === board)
      if (full.length >= MAX_NOTES) this.removeNote(full[0].id)
      const now = Date.now()
      const mentions = mentionsIn(text, this.nameable()).filter((key) => key !== me.key)
      const note = toNote({ id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, board, text, author: p.name, authorId: me.account ? me.key : '', color: NOTE_COLORS.includes(m.color as string) ? (m.color as string) : NOTE_COLORS[0], x: onBoard(m.x), y: onBoard(m.y), z: onTop(), at: now, votes: [], mentions, comments: [] })
      this.state.notes.push(note)
      this.keepNote(note)
      for (const key of mentions) this.named(me, key, p.name, 'board')
    })
    // Only whoever wrote a note can reword it.
    this.onMessage('note:edit', (client: Client, m: { id?: unknown; text?: unknown; color?: unknown }) => {
      const p = this.state.players.get(client.sessionId)
      const me = this.bySession.get(client.sessionId)
      const note = noteById(m?.id)
      const text = cleanBlock(m?.text, MAX_NOTE_LENGTH)
      if (!p || !me || !note || !text || !(me.account ? note.authorId === me.key : !note.authorId && note.author === p.name)) return
      const before = new Set(note.mentions ? note.mentions.split(' ') : [])
      const mentions = mentionsIn(text, this.nameable()).filter((key) => key !== me.key)
      note.text = text
      note.mentions = mentions.join(' ')
      if (NOTE_COLORS.includes(m.color as string)) note.color = m.color as string
      this.keepNote(note)
      for (const key of mentions) if (!before.has(key)) this.named(me, key, p.name, 'board')
    })
    this.onMessage('note:comment', (client: Client, m: { id?: unknown; text?: unknown }) => {
      const p = this.state.players.get(client.sessionId)
      const me = this.bySession.get(client.sessionId)
      const note = noteById(m?.id)
      const text = cleanText(m?.text, MAX_COMMENT_LENGTH)
      if (!p || !me || !note || !text || note.comments.length >= MAX_COMMENTS) return
      const now = Date.now()
      const mentions = mentionsIn(text, this.nameable()).filter((key) => key !== me.key)
      const comment = { id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, author: p.name, authorId: me.account ? me.key : '', text, at: now, mentions }
      note.comments.push(toComment(comment))
      if (db) void db.addComment(note.id, comment).catch(warn)
      else this.store.save(this.state.notes.map(fromNote))
      for (const key of mentions) this.named(me, key, p.name, 'comment')
      // Whoever wrote the note hears about it too, unless they were just told by name.
      if (note.authorId && note.authorId !== me.key && !mentions.includes(note.authorId)) this.tell(note.authorId, 'mention', { name: p.name, where: 'reply' })
    })
    // A note follows the pointer for everyone while it is dragged; only where it is dropped is written down.
    this.onMessage('note:move', (_c: Client, m: { id?: unknown; x?: unknown; y?: unknown; drop?: unknown }) => {
      const note = noteById(m?.id)
      if (!note) return
      note.x = onBoard(m.x, note.x)
      note.y = onBoard(m.y, note.y)
      if (note.z < onTop() - 1) note.z = onTop()
      if (m.drop) this.keepNote(note)
    })
    this.onMessage('note:vote', (client: Client, id: unknown) => {
      const note = noteById(id)
      const me = this.bySession.get(client.sessionId)
      if (!note || !me) return
      const votes = new Set(note.votes ? note.votes.split(' ') : [])
      if (!votes.delete(me.key)) votes.add(me.key)
      note.votes = [...votes].join(' ')
      this.keepNote(note)
    })
    this.onMessage('note:remove', (_c: Client, id: unknown) => typeof id === 'string' && this.removeNote(id))

    // Changing your own name, look or introduction. It applies to every tab you have open.
    this.onMessage('profile:set', (client: Client, m: Record<string, unknown>) => {
      const me = this.bySession.get(client.sessionId)
      const mine = this.state.players.get(client.sessionId)
      if (!me || !mine || !m) return
      const card = { name: cleanText(m.name, 20) || me.name, robe: cleanColor(m.robe, mine.robe), trim: cleanColor(m.trim, mine.trim), hair: cleanColor(m.hair, mine.hair), hat: m.hat !== false, about: cleanText(m.about, 160) }
      me.name = card.name
      me.about = card.about
      this.state.players.forEach((p) => p.member === me.key && Object.assign(p, card))
      if (!db || !me.account) return
      this.people.set(me.key, { id: me.key, name: card.name })
      this.broadcast('people', [...this.people.values()])
      this.writes = this.writes.then(() => db!.saveCard(me.key, card)).catch(warn)
    })

    this.onMessage('status', (client: Client, raw: unknown) => {
      const p = this.state.players.get(client.sessionId)
      if (p) p.status = cleanText(raw, 40)
    })

    // Chat: to the room everyone shares, or with `to` straight to one person, here or away.
    this.onMessage('chat', (client: Client, raw: unknown) => {
      const p = this.state.players.get(client.sessionId)
      const me = this.bySession.get(client.sessionId)
      const m = (typeof raw === 'string' ? { text: raw } : raw) as { text?: unknown; to?: unknown } | null
      const text = cleanText(m?.text, 240)
      const now = Date.now()
      if (!p || !me || !text || now - (this.lastChat.get(client.sessionId) ?? 0) < 300) return
      const to = typeof m?.to === 'string' ? m.to : ''
      if (to && (to === me.key || !(this.members.has(to) || this.people.has(to)))) return
      this.lastChat.set(client.sessionId, now)
      const mentions = mentionsIn(text, this.nameable()).filter((key) => key !== me.key)
      const line: ChatLine = { id: client.sessionId, from: me.key, name: p.name, text, at: now, to, mentions }
      if (to) for (const key of new Set([me.key, to])) this.tell(key, 'chat', line)
      else this.broadcast('chat', line)
      // A direct message or a mention is something between two people.
      for (const key of new Set(to ? [to, ...mentions] : mentions)) this.bond(me.key, key).messages++
      // Guests leave no trace; between accounts every message is kept.
      if (db && me.account && (!to || this.people.has(to))) void db.addMessage({ ...line, mentions: mentions.filter((key) => this.people.has(key)) }).catch(warn)
      count(me, 'messages')
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
      this.tendGarden(timer, now)
      this.tendMembers(now)
      const finished = pomo.tick(timer, now)
      // Everyone hears the bell; only a finished focus session earns credit.
      if (finished) this.broadcast('pomo:done', { finished, round: timer.round })
      if (finished === 'focus') for (const member of this.members.values()) count(member, 'pomodoros')
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
        if (!juke.add(jb, { videoId, title, addedBy }, Date.now())) return client.send('juke:error', 'The queue is full.')
        const member = this.bySession.get(client.sessionId)
        if (member) count(member, 'songs')
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

  // Sends to every tab a member has open; nothing happens if they are away.
  private tell(key: string, type: string, message: unknown) {
    const sessions = this.members.get(key)?.sessions
    if (sessions) for (const c of this.clients) if (sessions.has(c.sessionId)) c.send(type, message)
  }

  // Tells someone they were named on the board, which also counts between the two of them.
  private named(by: Member, key: string, name: string, where: string) {
    this.bond(by.key, key).messages++
    this.tell(key, 'mention', { name, where })
  }

  // A person's bonds with everyone they have one with.
  private bondsOf(key: string) {
    const names = new Map(this.nameable().map((p) => [p.id, p.name]))
    const list = [...this.bonds].flatMap(([pair, bond]) => {
      const [a, b] = pair.split(' ')
      const other = a === key ? b : b === key ? a : ''
      return other && names.has(other) ? [{ id: other, name: names.get(other)!, ...bond }] : []
    })
    return { of: key, list }
  }

  // The bond between two people, made on first use and marked for saving.
  private bond(a: string, b: string): Bond {
    const pair = pairKey(a, b)
    let bond = this.bonds.get(pair)
    if (!bond) this.bonds.set(pair, (bond = { ...NEW_BOND }))
    this.bondsChanged.add(pair)
    return bond
  }

  // Everyone who can be named with @: every account, and whoever is here as a guest.
  private nameable(): Person[] {
    const all = new Map(this.people)
    for (const m of this.members.values()) all.set(m.key, { id: m.key, name: m.name })
    return [...all.values()]
  }

  private keepNote(note: Note) {
    if (db) void db.putNote(fromNote(note)).catch(warn)
    else this.store.save(this.state.notes.map(fromNote))
  }

  private removeNote(id: string) {
    const i = this.state.notes.findIndex((n) => n.id === id)
    if (i < 0) return
    this.state.notes.splice(i, 1)
    if (db) void db.removeNote(id).catch(warn)
    else this.store.save(this.state.notes.map(fromNote))
  }

  // Time here is credited every second, each person once however many tabs they have open.
  private tendMembers(now: number) {
    const elapsed = Math.min((now - this.lastCredit) / 1000, 5)
    this.lastCredit = now
    const inCall = new Set<string>()
    this.state.players.forEach((p) => {
      const seat = p.seat && seatById(p.seat)
      if (seat && !QUIET_ZONES.includes(seat.zone)) inCall.add(p.member)
    })
    for (const m of this.members.values()) accrue(m, elapsed, inCall.has(m.key), now)
    // Time together: people seated in the same call, and everyone here during a shared focus session.
    const together = (keys: string[], what: 'callSeconds' | 'focusSeconds') => {
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) this.bond(keys[i], keys[j])[what] += elapsed
    }
    const calls = new Map<string, Set<string>>()
    this.state.players.forEach((p) => {
      if (inCall.has(p.member) && p.seat) calls.set(p.zone, (calls.get(p.zone) ?? new Set()).add(p.member))
    })
    for (const keys of calls.values()) together([...keys], 'callSeconds')
    const timer = this.state.pomodoro
    if (timer?.phase === 'focus' && !timer.paused) together([...this.members.keys()], 'focusSeconds')
    if (now - this.lastPush >= PUSH_MS) {
      this.lastPush = now
      for (const m of this.members.values()) this.tell(m.key, 'progress', m.progress)
      this.state.players.forEach((p) => {
        const m = this.members.get(p.member)
        if (m) Object.assign(p, standingOf(m.progress))
      })
    }
    if (now - this.lastSave >= SAVE_MS) {
      this.lastSave = now
      this.saveMembers([...this.members.values()])
    }
  }

  private saveMembers(members: Member[]) {
    const rows = members.filter((m) => m.account && m.dirty).map((m) => ({ id: m.key, name: m.name, progress: m.progress }))
    for (const m of members) m.dirty = false
    if (!db) return
    if (rows.length) this.writes = this.writes.then(() => db!.saveMembers(rows, Date.now())).catch(warn)
    // Bonds are kept between accounts only; a guest's key means nothing tomorrow.
    const changed = [...this.bondsChanged].filter((pair) => pair.split(' ').every((key) => this.people.has(key))).map((pair): [string, Bond] => [pair, this.bonds.get(pair)!])
    this.bondsChanged.clear()
    if (changed.length) this.writes = this.writes.then(() => db!.saveBonds(changed)).catch(warn)
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

  // While a shared focus session is running, everyone present is growing their plant.
  // Time is banked every second and planted in batches, so the garden does not flicker with updates.
  private tendGarden(timer: pomo.Pomodoro, now: number) {
    const elapsed = Math.min((now - this.lastTend) / 1000, 5)
    this.lastTend = now
    if (timer.phase === 'focus' && !timer.paused) this.unplanted += elapsed
    if (this.unplanted >= 10 || (this.unplanted > 0 && timer.phase !== 'focus')) {
      const present: string[] = []
      this.state.players.forEach((p) => present.push(p.name))
      garden.credit(this.state.garden, present, this.unplanted)
      this.unplanted = 0
      if (now - this.lastGardenSave > 60_000 || timer.phase !== 'focus') {
        this.lastGardenSave = now
        this.gardenStore.save(this.state.garden)
      }
    }
  }

  async onDispose() {
    this.gardenStore.save(this.state.garden)
    this.saveMembers([...this.members.values()])
    await this.writes
  }

  private saveReservations() {
    this.reservations.save(this.state)
  }

  // The door: with INVITE_CODE set, nobody gets in without it; with accounts, nobody gets in unsigned.
  async onAuth(_client: Client, options: Record<string, unknown> = {}) {
    if (!inviteAccepted(options?.code)) throw new ServerError(INVITE_REJECTED, 'invite')
    if (!db) return { account: '' }
    const account = await db.accountOf(options?.token)
    if (!account) throw new ServerError(LOGIN_REJECTED, 'login')
    return { account }
  }

  // Finds or makes the member behind a session. A first-time account starts from whatever progress
  // the browser had kept before there were accounts; after that only the server's count matters.
  private async admit(sessionId: string, account: string, name: string, options: Record<string, unknown>): Promise<Member> {
    const key = account || guestKey(sessionId)
    if (account && !this.members.has(key)) {
      await this.writes
      const saved = await db!.member(account)
      // Another tab of theirs may have finished joining while we were reading.
      if (!this.members.has(key)) this.members.set(key, newMember(key, true, name, saved?.progress ?? cleanProgress(options.carry), saved?.seenAt, saved?.since, saved?.about))
    }
    let member = this.members.get(key)
    if (!member) this.members.set(key, (member = newMember(key, false, name, cleanProgress(options.carry))))
    member.sessions.add(sessionId)
    member.tzOffset = cleanOffset(options.tzOffset)
    if (member.name !== name) member.dirty = true
    member.name = name
    this.bySession.set(sessionId, member)
    return member
  }

  async onJoin(client: Client, options: Record<string, unknown> = {}, auth?: { account: string }) {
    const name = cleanText(options.name, 20) || 'Guest'
    const member = await this.admit(client.sessionId, auth?.account ?? '', name, options)
    const p = new Player()
    // Fan new arrivals out around the spawn tile so they do not stack.
    const n = this.state.players.size
    const spot = nearestWalkable(SPAWN.x + ((n % 3) - 1), SPAWN.z - Math.floor(n / 3) % 3) ?? SPAWN
    p.name = name
    p.member = member.key
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
    p.since = member.since
    p.about = member.about
    Object.assign(p, standingOf(member.progress))
    this.state.players.set(client.sessionId, p)
    this.lastMove.set(client.sessionId, Date.now())
    client.send('snap', { x: p.x, z: p.z })
    client.send('me', { member: member.key, account: member.account, seenAt: member.seenAt })
    client.send('progress', member.progress)
    client.send('bonds', this.bondsOf(member.key))
    // Call setup servers, including relay credentials, go only to people who are in.
    void iceServers().then((servers) => client.send('ice', servers))
    if (!db || !member.account) return
    // The row is written straight away so that notes and messages can point at it.
    const known = this.people.get(member.key)?.name === name
    this.people.set(member.key, { id: member.key, name })
    this.saveMembers([member])
    this.writes = this.writes.then(() => db!.saveCard(member.key, { robe: p.robe, trim: p.trim, hair: p.hair, hat: p.hat })).catch(warn)
    if (known) client.send('people', [...this.people.values()])
    else this.broadcast('people', [...this.people.values()])
    void this.writes.then(() => db!.history(member.key)).then((lines) => client.send('chat:history', lines), warn)
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId)
    this.lastMove.delete(client.sessionId)
    this.lastChat.delete(client.sessionId)
    this.lastRing.delete(client.sessionId)
    this.lastKnock.delete(client.sessionId)
    const member = this.bySession.get(client.sessionId)
    this.bySession.delete(client.sessionId)
    if (!member) return
    member.sessions.delete(client.sessionId)
    if (member.sessions.size) return
    this.members.delete(member.key)
    member.dirty = true
    this.saveMembers([member])
  }
}

const warn = (e: unknown) => console.warn(e instanceof Error ? e.message : e)

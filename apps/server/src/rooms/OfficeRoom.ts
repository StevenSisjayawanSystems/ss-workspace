import { Room, ServerError, type Client } from 'colyseus'
import { schema, t, type SchemaType } from '@colyseus/schema'
import { BEDS, TASK_BONUS_PER_DAY, TASK_BONUS_SECONDS, MAX_COMMENTS, MAX_COMMENT_LENGTH, MAX_NOTES, MAX_NOTE_LENGTH, NEW_BOND, NOTE_COLORS, QUIET_ZONES, ROOMS, SEATS, SIT_REACH, SPAWN, isBoard, mentionsIn, nearestWalkable, onBoard, pairKey, parseYouTubeId, roomById, seatById, standSpot, zoneAt, type Bond, type Person, type ZoneId } from '@guildhouse/shared'
import { config, inviteAccepted } from '../config'
import { db, type ChatLine } from '../db'
import { Note, NoteStore, fromNote, toComment, toNote } from '../notes'
import { iceServers } from '../ice'
import { accrue, cleanOffset, cleanProgress, count, guestKey, localDay, newMember, standingOf, type Member } from '../members'
import { addCategory, addList, addTask, clearDone, editTask, finishSession, moveTask, planTask, removeCategory, removeList, removeTask, renameList, shareList, tagTask, tickTask, type KeptTask } from '../tasks'
import { canJoin, companyOf, invite, join, keysOf, leave, newId, type Shared } from '../company'
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

export const OfficeState = schema({ players: t.map(Player), jukeboxes: t.map(juke.Jukebox), pomodoros: t.map(pomo.Pomodoro), notes: t.array(Note), desks: t.array(res.DeskClaim), bookings: t.array(res.Booking), doors: t.array(res.ClosedDoor), garden: t.array(garden.Plot) }, 'OfficeState')
export type OfficeState = SchemaType<typeof OfficeState>

// Close code sent when the invite code is missing or wrong.
export const INVITE_REJECTED = 4401
// Close code sent when this guildhouse has accounts and the client is not signed in.
export const LOGIN_REJECTED = 4402

// How often each person is told their own progress, and how often it is written down.
const PUSH_MS = 5000
// An alarm is for a time of day, so it can be at most a day ahead.
const ALARM_HORIZON_MS = 24 * 60 * 60 * 1000
const SAVE_MS = 30000
// How long someone's timer and music wait for them after they leave, so a reload does not end either.
const AWAY_MS = 2 * 60 * 1000

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
  // Beds from the old garden file that no account has taken up yet, by the name on them.
  private unclaimedBeds = new Map<string, number>()
  // Focus time each person has banked but not yet planted, by member key.
  private unplanted = new Map<string, number>()
  // Accounts that have just left and may be back in a moment, with when they went.
  private away = new Map<string, number>()
  private adds: Promise<void> = Promise.resolve()
  // Everyone here now, by member key and by session; and every account that has ever joined.
  private members = new Map<string, Member>()
  private bySession = new Map<string, Member>()
  private people = new Map<string, Person>()
  // What each pair of people has done together, by pair key; and the pairs changed since the last save.
  private bonds = new Map<string, Bond>()
  private bondsChanged = new Set<string>()
  // Whose task list each session has open, so changes reach them as they happen.
  private watching = new Map<string, string>()
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
      this.seatIn(client.sessionId, seat.id)
    })

    // The way in that never depends on walking: takes the given seat, or the nearest free one in the given
    // room, from wherever you are. Bookings, claimed desks and closed doors still apply.
    this.onMessage('join', (client: Client, target: unknown) => {
      const p = this.state.players.get(client.sessionId)
      if (!p || typeof target !== 'string') return
      const wanted = seatById(target)
      const zone = wanted?.zone ?? (ROOMS.some((r) => r.id === target) ? target : null)
      if (!zone || QUIET_ZONES.includes(zone as ZoneId)) return
      const taken = new Set<string>()
      this.state.players.forEach((other, sid) => sid !== client.sessionId && other.seat && taken.add(other.seat))
      const insideAlready = !!p.seat && p.zone === zone
      const open = SEATS.filter((s) => s.zone === zone && !taken.has(s.id))
        .map((s) => ({ s, refused: res.seatRefusal(this.state, s.id, s.zone, p.name, insideAlready) }))
        .filter((o) => !o.refused || o.refused === res.KNOCK)
        .sort((a, b) => (a.s.id === target ? -1 : b.s.id === target ? 1 : Math.hypot(a.s.x - p.x, a.s.z - p.z) - Math.hypot(b.s.x - p.x, b.s.z - p.z)))
      const pick = open[0]
      if (!pick) return client.send('notice', { title: `${roomById(zone as ZoneId).name} is full`, detail: 'No free seats right now' })
      if (pick.refused === res.KNOCK) return this.knock(client, p.name, zone)
      this.seatIn(client.sessionId, pick.s.id)
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

    // Focus garden. With accounts the beds come from the members themselves; beds from the old
    // file are held aside and handed to their owners by name the next time each one walks in.
    const filed = this.gardenStore.load()
    if (db) for (const bed of filed) this.unclaimedBeds.set(bed.name, bed.seconds)
    for (const saved of db ? await db.garden(BEDS.length) : filed.map((bed) => ({ ...bed, member: '' }))) {
      const plot = new garden.Plot()
      plot.name = saved.name
      plot.member = saved.member
      plot.seconds = saved.seconds
      this.state.garden.push(plot)
    }

    // Desks and meeting rooms
    const kept = db ? await db.kept('reservations') : null
    this.reservations.restore(this.state, Date.now(), kept ? res.readReservations(kept) : undefined)
    const tell = (client: Client, problem: string | null, detail: string) => problem && client.send('notice', { title: problem, detail })
    this.onMessage('desk:claim', (client: Client, deskId: unknown) => {
      const p = this.state.players.get(client.sessionId)
      if (!p) return
      const me = this.bySession.get(client.sessionId)
      tell(client, res.claimDesk(this.state, deskId, p.name, me?.account ? me.key : ''), 'Choose a free desk')
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

    // A personal alarm: it rings for its owner alone, at a moment within the next day.
    this.onMessage('alarm:set', (client: Client, m: { at?: unknown; label?: unknown }) => {
      const me = this.bySession.get(client.sessionId)
      const now = Date.now()
      if (!me || typeof m?.at !== 'number' || !(m.at > now && m.at <= now + ALARM_HORIZON_MS)) return
      me.alarmAt = Math.round(m.at)
      me.alarmLabel = cleanText(m.label, 60)
      me.dirty = true
      this.tell(me.key, 'alarm', { at: me.alarmAt, label: me.alarmLabel })
    })
    this.onMessage('alarm:clear', (client: Client) => {
      const me = this.bySession.get(client.sessionId)
      if (me?.alarmAt) this.endAlarm(me)
    })

    // To-do lists. Every change is made by the owner; anyone else can only look, and only at lists shared with them.
    const mine = (client: Client, change: (me: Member, now: number) => unknown) => {
      const me = this.bySession.get(client.sessionId)
      if (me && change(me, Date.now())) this.tasksChanged(me)
    }
    this.onMessage('list:add', (client: Client, name: unknown) => mine(client, (me, now) => addList(me.todo, name, now)))
    this.onMessage('list:rename', (client: Client, m: { id?: unknown; name?: unknown }) => mine(client, (me) => renameList(me.todo, m?.id, m?.name)))
    this.onMessage('list:remove', (client: Client, id: unknown) => mine(client, (me) => removeList(me.todo, id)))
    // A list is shared with particular people, picked from whoever is here; those already let in stay until taken off.
    this.onMessage('list:share', (client: Client, m: { id?: unknown; with?: unknown }) =>
      mine(client, (me) => {
        const list = me.todo.lists.find((l) => l.id === m?.id)
        if (!list || !Array.isArray(m?.with)) return false
        const allowed = m.with.filter((k): k is string => typeof k === 'string' && k !== me.key && (this.members.has(k) || list.sharedWith.includes(k)))
        const added = shareList(me.todo, list.id, allowed)
        for (const key of added ?? []) this.tell(key, 'notice', { title: me.name, detail: `shared the list "${list.name}" with you. Open their profile to follow along` })
        return !!added
      }),
    )
    this.onMessage('category:add', (client: Client, m: { name?: unknown; color?: unknown }) => mine(client, (me, now) => addCategory(me.todo, m?.name, m?.color, now)))
    this.onMessage('category:remove', (client: Client, id: unknown) => mine(client, (me) => removeCategory(me.todo, id)))
    this.onMessage('task:add', (client: Client, m: { list?: unknown; title?: unknown; category?: unknown }) => mine(client, (me, now) => addTask(me.todo, m?.list, m?.title, m?.category, now)))
    this.onMessage('task:edit', (client: Client, m: { id?: unknown; title?: unknown }) => mine(client, (me) => editTask(me.todo, m?.id, m?.title)))
    this.onMessage('task:tag', (client: Client, m: { id?: unknown; category?: unknown }) => mine(client, (me) => tagTask(me.todo, m?.id, m?.category)))
    this.onMessage('task:remove', (client: Client, id: unknown) => mine(client, (me) => removeTask(me.todo, id)))
    // A task can be put before another, sent to another list, and given a category, all in one go.
    this.onMessage('task:move', (client: Client, m: { id?: unknown; before?: unknown; list?: unknown; category?: unknown }) =>
      mine(client, (me) => {
        const tagged = typeof m?.category === 'string' && tagTask(me.todo, m.id, m.category)
        return moveTask(me.todo, m?.id, m?.before, m?.list) || tagged
      }),
    )
    this.onMessage('task:plan', (client: Client, m: { id?: unknown; priority?: unknown; due?: unknown; starred?: unknown }) => mine(client, (me) => planTask(me.todo, m?.id, m ?? {})))
    this.onMessage('task:clear', (client: Client, list: unknown) => mine(client, (me) => clearDone(me.todo, list)))
    this.onMessage('task:done', (client: Client, m: { id?: unknown; done?: unknown }) =>
      mine(client, (me, now) => {
        const task = tickTask(me.todo, m?.id, m?.done === true, now)
        if (!task) return false
        if (task.done) this.reward(me, task, now)
        return true
      }),
    )
    // "I'm done with this session": nothing is logged or cleared until its owner says so.
    this.onMessage('task:finish', (client: Client, list: unknown) =>
      mine(client, (me, now) => {
        const session = finishSession(me.todo, list, now)
        if (!session) return false
        me.log.unshift(session)
        if (db && me.account) this.writes = this.writes.then(() => db!.addTaskSession(me.key, session)).catch(warn)
        this.tell(me.key, 'notice', { title: 'Session logged', detail: `${session.done} ${session.done === 1 ? 'task' : 'tasks'} done, on your profile` })
        return true
      }),
    )
    // Opening someone's lists (or closing them, with nothing): they are sent now and whenever they change.
    this.onMessage('tasks:watch', (client: Client, key: unknown) => {
      if (typeof key !== 'string' || !key) return void this.watching.delete(client.sessionId)
      this.watching.set(client.sessionId, key)
      const view = this.tasksView(key, this.bySession.get(client.sessionId)?.key ?? '')
      if (view) client.send('tasks:of', view)
    })

    // Changing your own name, look or introduction. It applies to every tab you have open.
    this.onMessage('profile:set', (client: Client, m: Record<string, unknown>) => {
      const me = this.bySession.get(client.sessionId)
      const mine = this.state.players.get(client.sessionId)
      if (!me || !mine || !m) return
      const card = { name: cleanText(m.name, 20) || me.name, robe: cleanColor(m.robe, mine.robe), trim: cleanColor(m.trim, mine.trim), hair: cleanColor(m.hair, mine.hair), hat: m.hat !== false, about: cleanText(m.about, 160) }
      if (res.renamed(this.state, me.account ? me.key : '', me.name, card.name)) this.saveReservations()
      me.name = card.name
      me.about = card.about
      const bed = me.account && garden.plotOf(this.state.garden, gardener(me))
      if (bed) bed.name = card.name
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

    // Timers and music. Each belongs to whoever started it and reaches only the people who joined.
    const timers = this.state.pomodoros
    const stations = this.state.jukeboxes
    const timerOf = (client: Client) => companyOf(timers, this.bySession.get(client.sessionId)?.key ?? '')
    const stationOf = (client: Client) => companyOf(stations, this.bySession.get(client.sessionId)?.key ?? '')
    this.setSimulationInterval(() => {
      const now = Date.now()
      stations.forEach((jb) => void juke.tick(jb, now))
      if (res.expire(this.state, now)) this.saveReservations()
      res.reopenEmpty(this.state, this.occupied())
      this.tendGarden(now)
      this.tendMembers(now)
      for (const [key, since] of this.away) {
        if (now - since < AWAY_MS) continue
        this.away.delete(key)
        this.leaveCompany(key)
      }
      const over: string[] = []
      timers.forEach((timer, id) => {
        const finished = pomo.tick(timer, now)
        if (!finished) return
        // Those in on it hear the bell; only a finished focus session earns credit.
        for (const key of keysOf(timer.members)) {
          this.tell(key, 'pomo:done', { finished, round: timer.round })
          const member = this.members.get(key)
          if (finished === 'focus' && member) count(member, 'pomodoros')
        }
        if (timer.phase === 'idle') over.push(id)
      })
      for (const id of over) timers.delete(id)
    }, 1000)

    // Those in on a timer or some music decide who else comes in: anyone at all, or people asked by name.
    const setOpen = (s: Shared | undefined, open: unknown) => {
      if (!s || typeof open !== 'boolean') return
      s.open = open
      if (open) s.invited = ''
    }
    // Bringing someone in puts them straight into it, and tells them. Someone already in a timer or
    // music of their own is not pulled out of it: they are asked, and can say yes or carry on.
    const bring = <T extends Shared>(client: Client, all: { forEach(each: (value: T, id: string) => void): void; delete(id: string): unknown }, s: T | undefined, what: 'timer' | 'music', to: unknown) => {
      const me = this.bySession.get(client.sessionId)
      const them = typeof to === 'string' ? this.members.get(to) : undefined
      if (!me || !s || !them || keysOf(s.members).includes(them.key)) return
      if (companyOf(all, them.key)) {
        if (invite(s, them.key)) this.tell(them.key, 'invite', { what, id: s.id, name: me.name })
        return client.send('notice', { title: them.name, detail: what === 'timer' ? 'is on a timer of their own, so they have been asked' : 'is listening to something else, so they have been asked' })
      }
      for (const key of keysOf(s.members)) if (key !== me.key) this.tell(key, 'notice', { title: them.name, detail: what === 'timer' ? 'was added to your timer' : 'is now listening along with you' })
      join(s, them.key)
      this.tell(them.key, 'brought', { what, name: me.name })
    }
    this.onMessage('pomo:open', (client: Client, open: unknown) => setOpen(timerOf(client), open))
    // With no timer running yet, bringing someone in starts the usual one for the two of you.
    this.onMessage('pomo:bring', (client: Client, to: unknown) => {
      if (!timerOf(client)) begin(client, (timer, by, now) => pomo.start(timer, 25, 5, by, now))
      bring(client, timers, timerOf(client), 'timer', to)
    })
    this.onMessage('juke:open', (client: Client, open: unknown) => setOpen(stationOf(client), open))
    this.onMessage('juke:bring', (client: Client, to: unknown) => bring(client, stations, stationOf(client), 'music', to))

    // Starting a timer of your own takes you out of any you had joined.
    const begin = (client: Client, set: (timer: pomo.Pomodoro, by: string, now: number) => boolean) => {
      const me = this.bySession.get(client.sessionId)
      const now = Date.now()
      const timer = new pomo.Pomodoro()
      pomo.reset(timer)
      if (!me || !set(timer, me.name, now)) return
      leave(timers, me.key)
      timer.id = newId(now)
      timer.members = me.key
      timer.open = true
      timer.invited = ''
      timers.set(timer.id, timer)
    }
    this.onMessage('pomo:start', (client: Client, m: { focusMin?: unknown; breakMin?: unknown }) => m && begin(client, (timer, by, now) => pomo.start(timer, m.focusMin, m.breakMin, by, now)))
    this.onMessage('pomo:timer', (client: Client, m: { minutes?: unknown }) => m && begin(client, (timer, by, now) => pomo.startTimer(timer, m.minutes, by, now)))
    this.onMessage('pomo:join', (client: Client, id: unknown) => {
      const me = this.bySession.get(client.sessionId)
      const timer = typeof id === 'string' ? timers.get(id) : undefined
      if (!me || !timer || keysOf(timer.members).includes(me.key) || !canJoin(timer, me.key)) return
      leave(timers, me.key)
      for (const key of keysOf(timer.members)) this.tell(key, 'notice', { title: me.name, detail: 'joined your timer' })
      join(timer, me.key)
    })
    this.onMessage('pomo:leave', (client: Client) => leave(timers, this.bySession.get(client.sessionId)?.key ?? ''))
    // Everyone in on a timer keeps the same time, so any of them can hold or move it.
    this.onMessage('pomo:pause', (client: Client) => {
      const timer = timerOf(client)
      if (timer) pomo.pause(timer, Date.now())
    })
    this.onMessage('pomo:resume', (client: Client) => {
      const timer = timerOf(client)
      if (timer) pomo.resume(timer, Date.now())
    })
    this.onMessage('pomo:skip', (client: Client) => {
      const timer = timerOf(client)
      if (timer) pomo.skip(timer, Date.now())
    })

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

    // Putting a song on when you are not listening to anything starts music of your own.
    this.onMessage('juke:add', (client: Client, raw: unknown) => {
      const me = this.bySession.get(client.sessionId)
      const videoId = typeof raw === 'string' ? parseYouTubeId(raw) : null
      if (!me || !videoId) return client.send('juke:error', 'That does not look like a YouTube link.')
      // Title lookups take a moment; chaining them keeps the queue in the order people asked.
      this.adds = this.adds.then(async () => {
        const title = await this.lookupTitle(videoId)
        if (!me.sessions.size) return
        const now = Date.now()
        let jb = companyOf(stations, me.key)
        if (!jb) {
          jb = new juke.Jukebox()
          jb.id = newId(now)
          jb.host = me.name
          jb.members = me.key
          jb.open = true
          jb.invited = ''
          stations.set(jb.id, jb)
        }
        if (!juke.add(jb, { videoId, title, addedBy: me.name }, now)) return client.send('juke:error', 'The queue is full.')
        count(me, 'songs')
      })
    })
    this.onMessage('juke:join', (client: Client, id: unknown) => {
      const me = this.bySession.get(client.sessionId)
      const jb = typeof id === 'string' ? stations.get(id) : undefined
      if (!me || !jb || keysOf(jb.members).includes(me.key) || !canJoin(jb, me.key)) return
      leave(stations, me.key)
      for (const key of keysOf(jb.members)) this.tell(key, 'notice', { title: me.name, detail: 'is listening along with you' })
      join(jb, me.key)
    })
    this.onMessage('juke:leave', (client: Client) => leave(stations, this.bySession.get(client.sessionId)?.key ?? ''))
    const listening = (client: Client, change: (jb: juke.Jukebox, now: number) => void) => {
      const jb = stationOf(client)
      if (jb) change(jb, Date.now())
    }
    this.onMessage('juke:skip', (client: Client) => listening(client, juke.skip))
    this.onMessage('juke:remove', (client: Client, id: unknown) => typeof id === 'string' && listening(client, (jb, now) => juke.remove(jb, id, now)))
    this.onMessage('juke:pause', (client: Client) => listening(client, juke.pause))
    this.onMessage('juke:play', (client: Client) => listening(client, juke.play))
    this.onMessage('juke:seek', (client: Client, s: unknown) => typeof s === 'number' && listening(client, (jb, now) => juke.seek(jb, s, now)))
    // Players report what their embed learned about the current track.
    this.onMessage('juke:duration', (client: Client, m: { id?: string; duration?: number }) => {
      const cur = stationOf(client)?.queue[0]
      if (cur && m && cur.id === m.id && !cur.duration && typeof m.duration === 'number' && m.duration > 0 && m.duration < 86400) cur.duration = m.duration
    })
    this.onMessage('juke:ended', (client: Client, id: unknown) => listening(client, (jb, now) => jb.queue[0]?.id === id && juke.skip(jb, now)))

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

  private endAlarm(m: Member) {
    m.alarmAt = 0
    m.alarmLabel = ''
    m.dirty = true
    this.tell(m.key, 'alarm', { at: 0, label: '' })
  }

  // A finished task helps the plant its owner is growing, once per task and a few times a day.
  private reward(me: Member, task: KeptTask, now: number) {
    if (task.rewarded) return
    const today = localDay(now, me.tzOffset)
    if (me.bonusDay !== today) {
      me.bonusDay = today
      me.bonusCount = 0
    }
    if (me.bonusCount >= TASK_BONUS_PER_DAY) return
    task.rewarded = true
    me.bonusCount++
    me.focusSeconds += TASK_BONUS_SECONDS
    me.dirty = true
    garden.credit(this.state.garden, [gardener(me)], TASK_BONUS_SECONDS)
    if (!db) this.gardenStore.save(this.state.garden)
    this.tell(me.key, 'notice', { title: 'Task done', detail: `Your plant grew by ${TASK_BONUS_SECONDS / 60} minutes` })
  }

  // How many more tasks can help their plant today.
  private bonusLeft(me: Member) {
    return me.bonusDay === localDay(Date.now(), me.tzOffset) ? Math.max(0, TASK_BONUS_PER_DAY - me.bonusCount) : TASK_BONUS_PER_DAY
  }

  // Someone's to-do as its owner sees it, without the server's own bookkeeping.
  private todoOf(owner: Member, lists = owner.todo.lists) {
    return { lists: lists.map((l) => ({ ...l, tasks: l.tasks.map(({ rewarded: _, ...task }) => task) })), categories: owner.todo.categories }
  }

  // Someone's to-do as `viewer` may see it: everything if it is theirs, otherwise the lists shared
  // with them. Session titles follow the same rule.
  private tasksView(key: string, viewer: string) {
    const owner = this.members.get(key)
    if (!owner) return null
    const own = viewer === key
    return {
      of: key,
      ...this.todoOf(owner, own ? owner.todo.lists : owner.todo.lists.filter((l) => l.sharedWith.includes(viewer))),
      sessions: owner.log.map(({ sharedWith, ...s }) => (own || sharedWith.includes(viewer) ? s : { ...s, titles: [] })),
    }
  }

  // After any change to a to-do: write it down, and tell its owner and anyone looking at it.
  private tasksChanged(me: Member) {
    if (db && me.account) {
      const copy = structuredClone(me.todo)
      this.writes = this.writes.then(() => db!.saveTodo(me.key, copy)).catch(warn)
    }
    this.tell(me.key, 'tasks', { ...this.todoOf(me), bonusLeft: this.bonusLeft(me) })
    for (const c of this.clients) {
      if (this.watching.get(c.sessionId) !== me.key) continue
      const view = this.tasksView(me.key, this.bySession.get(c.sessionId)?.key ?? '')
      if (view) c.send('tasks:of', view)
    }
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
    for (const m of this.members.values()) {
      if (!m.alarmAt || m.alarmAt > now) continue
      this.tell(m.key, 'alarm:ring', { at: m.alarmAt, label: m.alarmLabel, missed: false })
      this.endAlarm(m)
    }
    // Time together: people seated in the same call, and people focusing on the same timer.
    const together = (keys: string[], what: 'callSeconds' | 'focusSeconds') => {
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) this.bond(keys[i], keys[j])[what] += elapsed
    }
    const calls = new Map<string, Set<string>>()
    this.state.players.forEach((p) => {
      if (inCall.has(p.member) && p.seat) calls.set(p.zone, (calls.get(p.zone) ?? new Set()).add(p.member))
    })
    for (const keys of calls.values()) together([...keys], 'callSeconds')
    this.state.pomodoros.forEach((timer) => {
      if (timer.phase === 'focus' && !timer.paused) together(keysOf(timer.members).filter((key) => this.members.has(key)), 'focusSeconds')
    })
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
    const rows = members.filter((m) => m.account && m.dirty).map((m) => ({ id: m.key, name: m.name, progress: m.progress, focusSeconds: m.focusSeconds, bonusDay: m.bonusDay, bonusCount: m.bonusCount, alarmAt: m.alarmAt, alarmLabel: m.alarmLabel }))
    for (const m of members) m.dirty = false
    if (!db) return
    if (rows.length) this.writes = this.writes.then(() => db!.saveMembers(rows, Date.now())).catch(warn)
    // Bonds are kept between accounts only; a guest's key means nothing tomorrow.
    const changed = [...this.bondsChanged].filter((pair) => pair.split(' ').every((key) => this.people.has(key))).map((pair): [string, Bond] => [pair, this.bonds.get(pair)!])
    this.bondsChanged.clear()
    if (changed.length) this.writes = this.writes.then(() => db!.saveBonds(changed)).catch(warn)
  }

  private seatIn(sessionId: string, seatId: string) {
    const p = this.state.players.get(sessionId)
    const seat = seatById(seatId)
    if (!p || !seat) return
    p.seat = seat.id
    p.x = seat.x
    p.z = seat.z
    p.facing = seat.facing
    p.moving = false
    p.zone = seat.zone
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

  // Takes someone out of the timer and the music they were in.
  private leaveCompany(key: string) {
    leave(this.state.pomodoros, key)
    leave(this.state.jukeboxes, key)
  }

  // While the focus session someone is in is running, they are growing their plant.
  // Time is banked every second and planted in batches, so the garden does not flicker with updates.
  private tendGarden(now: number) {
    const elapsed = Math.min((now - this.lastTend) / 1000, 5)
    this.lastTend = now
    const focusing = new Set<string>()
    this.state.pomodoros.forEach((timer) => {
      if (timer.phase === 'focus' && !timer.paused) for (const key of keysOf(timer.members)) if (this.members.has(key)) focusing.add(key)
    })
    for (const key of focusing) this.unplanted.set(key, (this.unplanted.get(key) ?? 0) + elapsed)
    let planted = false
    for (const [key, seconds] of this.unplanted) {
      if (seconds < 10 && focusing.has(key)) continue
      this.unplanted.delete(key)
      const m = this.members.get(key)
      if (!m) continue
      // The time goes on the member, where it is kept for good, and into their bed if they have one.
      m.focusSeconds += seconds
      m.dirty = true
      garden.credit(this.state.garden, [gardener(m)], seconds)
      planted = true
    }
    if (planted && !db && (now - this.lastGardenSave > 60_000 || !focusing.size)) {
      this.lastGardenSave = now
      this.gardenStore.save(this.state.garden)
    }
  }

  async onDispose() {
    if (!db) this.gardenStore.save(this.state.garden)
    this.saveMembers([...this.members.values()])
    await this.writes
  }

  private saveReservations() {
    if (db) void db.keep('reservations', res.snapshot(this.state)).catch(warn)
    else this.reservations.save(this.state)
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
      const [todo, log] = saved ? await Promise.all([db!.todo(account), db!.taskSessions(account, 30)]) : [null, []]
      // Another tab of theirs may have finished joining while we were reading.
      if (!this.members.has(key)) {
        const joining = newMember(key, true, name, saved?.progress ?? cleanProgress(options.carry), saved?.seenAt, saved?.since, saved?.about)
        // A bed grown before there were accounts is theirs if it carries their name.
        joining.focusSeconds = saved?.focusSeconds || this.unclaimedBeds.get(name) || 0
        this.unclaimedBeds.delete(name)
        Object.assign(joining, { todo: todo ?? joining.todo, log, bonusDay: saved?.bonusDay ?? '', bonusCount: saved?.bonusCount ?? 0, alarmAt: saved?.alarmAt ?? 0, alarmLabel: saved?.alarmLabel ?? '' })
        this.members.set(key, joining)
      }
    }
    let member = this.members.get(key)
    if (!member) this.members.set(key, (member = newMember(key, false, name, cleanProgress(options.carry))))
    member.sessions.add(sessionId)
    this.away.delete(key)
    member.tzOffset = cleanOffset(options.tzOffset)
    if (member.name !== name) member.dirty = true
    member.name = name
    this.bySession.set(sessionId, member)
    // Their bed shows what they have grown and carries the name they go by now.
    if (member.account && member.focusSeconds > 0) garden.credit(this.state.garden, [gardener(member)], 0)
    const bed = garden.plotOf(this.state.garden, gardener(member))
    if (bed && member.account) {
      bed.seconds = member.focusSeconds
      bed.name = name
    }
    // Likewise their desk.
    if (member.account && res.renamed(this.state, member.key, name, name)) this.saveReservations()
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
    // An alarm that came due while they were away is not rung late; they are simply told.
    if (member.alarmAt && member.alarmAt <= Date.now()) {
      client.send('alarm:ring', { at: member.alarmAt, label: member.alarmLabel, missed: true })
      this.endAlarm(member)
    } else client.send('alarm', { at: member.alarmAt, label: member.alarmLabel })
    client.send('tasks', { ...this.todoOf(member), bonusLeft: this.bonusLeft(member) })
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
    this.watching.delete(client.sessionId)
    const member = this.bySession.get(client.sessionId)
    this.bySession.delete(client.sessionId)
    if (!member) return
    member.sessions.delete(client.sessionId)
    if (member.sessions.size) return
    this.members.delete(member.key)
    // An account may only be reloading the page; a guest's key will never be seen again.
    if (member.account) this.away.set(member.key, Date.now())
    else this.leaveCompany(member.key)
    member.dirty = true
    this.saveMembers([member])
  }
}

const gardener = (m: Member): garden.Gardener => ({ member: m.account ? m.key : '', name: m.name })

const warn = (e: unknown) => console.warn(e instanceof Error ? e.message : e)

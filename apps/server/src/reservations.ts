import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { schema, t, type SchemaType } from '@colyseus/schema'
import { BOOKABLE_ZONES, BOOKING_MINUTES, deskById, deskOfSeat, type ZoneId } from '@guildhouse/shared'

// A desk belongs to an account (`member`) and shows its owner's current name; the rules below go by
// that name, which the room keeps in step with the account. On a server without accounts `member`
// is empty and the name is all there is. Bookings go by name.

export const DeskClaim = schema({ deskId: t.string(), owner: t.string(), member: t.string() }, 'DeskClaim')
export type DeskClaim = SchemaType<typeof DeskClaim>

// A meeting room booked for a stretch of time. A booking is an entry on the schedule by the door:
// it tells people when the room is spoken for, and does not by itself keep anyone out.
export const Booking = schema(
  {
    id: t.string(),
    zone: t.string(),
    by: t.string(),
    // Server times the booking starts and ends.
    start: t.number(),
    until: t.number(),
  },
  'Booking',
)
export type Booking = SchemaType<typeof Booking>

// A room whose door someone inside has closed. Newcomers knock and are let in by anyone seated there.
// The door opens again by itself once the room is empty.
export const ClosedDoor = schema(
  {
    zone: t.string(),
    by: t.string(),
    // Names let in since the door was closed, one per line.
    admitted: t.string(),
  },
  'ClosedDoor',
)
export type ClosedDoor = SchemaType<typeof ClosedDoor>

interface List<T> extends Array<T> {}
interface Lists {
  desks: List<DeskClaim>
  bookings: List<Booking>
  doors: List<ClosedDoor>
}

const MIN = 60_000
export const BOOK_AHEAD_DAYS = 7
export const MAX_BOOKINGS = 80

// One desk each: claiming a new one gives up the old. Returns why it failed, or null.
export function claimDesk(s: Lists, deskId: unknown, owner: string, member = ''): string | null {
  const desk = typeof deskId === 'string' ? deskById(deskId) : undefined
  if (!desk) return 'Only desks in the Main Workroom can be claimed'
  const held = s.desks.find((c) => c.deskId === desk.id)
  if (held) return held.owner === owner ? null : `That desk is ${held.owner}'s`
  releaseDesk(s, owner)
  const c = new DeskClaim()
  c.deskId = desk.id
  c.owner = owner
  c.member = member
  s.desks.push(c)
  return null
}

export function releaseDesk(s: Lists, owner: string): boolean {
  const i = s.desks.findIndex((c) => c.owner === owner)
  if (i < 0) return false
  s.desks.splice(i, 1)
  return true
}

// Books a room from `start` (or from now) for one of the offered lengths. Bookings in a room never overlap.
export function bookRoom(s: Lists, zone: unknown, start: unknown, minutes: unknown, by: string, now: number): string | null {
  if (typeof zone !== 'string' || !BOOKABLE_ZONES.includes(zone as ZoneId)) return 'That room cannot be reserved'
  if (typeof minutes !== 'number' || !BOOKING_MINUTES.includes(minutes)) return 'Pick one of the offered lengths'
  expire(s, now)
  const from = typeof start === 'number' && Number.isFinite(start) ? Math.max(start, now) : now
  if (from > now + BOOK_AHEAD_DAYS * 24 * 60 * MIN) return `Bookings can be made up to ${BOOK_AHEAD_DAYS} days ahead`
  if (s.bookings.length >= MAX_BOOKINGS) return 'The schedule is full'
  const until = from + minutes * MIN
  const clash = s.bookings.find((b) => b.zone === zone && b.start < until && from < b.until)
  if (clash) return clash.by === by ? 'You already have that time' : `That time is taken by ${clash.by}`
  const b = new Booking()
  b.id = `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  b.zone = zone
  b.by = by
  b.start = from
  b.until = until
  s.bookings.push(b)
  return null
}

export function cancelBooking(s: Lists, id: unknown, by: string): boolean {
  const i = s.bookings.findIndex((b) => b.id === id && b.by === by)
  if (i < 0) return false
  s.bookings.splice(i, 1)
  return true
}

// Closing the door. Only rooms with a schedule (the council chambers) have doors that close.
export function closeDoor(s: Lists, zone: unknown, by: string): string | null {
  if (typeof zone !== 'string' || !BOOKABLE_ZONES.includes(zone as ZoneId)) return 'This room has no door to close'
  if (s.doors.some((d) => d.zone === zone)) return null
  const d = new ClosedDoor()
  d.zone = zone
  d.by = by
  d.admitted = ''
  s.doors.push(d)
  return null
}

export function openDoor(s: Lists, zone: unknown): boolean {
  const i = s.doors.findIndex((d) => d.zone === zone)
  if (i < 0) return false
  s.doors.splice(i, 1)
  return true
}

export const doorClosed = (s: Lists, zone: string) => s.doors.some((d) => d.zone === zone)

// Lets someone in after a knock.
export function admit(s: Lists, zone: string, name: string) {
  const d = s.doors.find((x) => x.zone === zone)
  if (d && !d.admitted.split('\n').includes(name)) d.admitted = d.admitted ? `${d.admitted}\n${name}` : name
}

// A closed door with nobody behind it opens again.
export function reopenEmpty(s: Lists, occupied: Set<string>): boolean {
  let changed = false
  for (let i = s.doors.length - 1; i >= 0; i--)
    if (!occupied.has(s.doors[i].zone)) {
      s.doors.splice(i, 1)
      changed = true
    }
  return changed
}

// Drops bookings that have ended. Returns true if anything changed.
export function expire(s: Lists, now: number): boolean {
  let changed = false
  for (let i = s.bookings.length - 1; i >= 0; i--)
    if (s.bookings[i].until <= now) {
      s.bookings.splice(i, 1)
      changed = true
    }
  return changed
}

// Whether `name` may take this seat right now. Returns why not, or null if they may.
// `insideAlready` is true when they are seated in that room and only changing chairs.
export function seatRefusal(s: Lists, seatId: string, seatZone: string, name: string, insideAlready: boolean): string | null {
  const desk = deskOfSeat(seatId)
  const claim = desk && s.desks.find((c) => c.deskId === desk.id)
  if (claim && claim.owner !== name) return `That desk is ${claim.owner}'s`
  const door = s.doors.find((d) => d.zone === seatZone)
  if (door && !insideAlready && !door.admitted.split('\n').includes(name)) return KNOCK
  return null
}

// Returned by seatRefusal when the only obstacle is a closed door, which a knock can get past.
export const KNOCK = 'The door is closed'

export interface SavedReservations {
  desks: { deskId: string; owner: string; member: string }[]
  bookings: { id: string; zone: string; by: string; start: number; until: number }[]
}

// Desk claims and bookings are kept across restarts, in the same folder as the bulletin board notes.
// Desk claims and bookings as they are saved, wherever that is.
export const snapshot = (s: Lists): SavedReservations => ({
  desks: s.desks.map((c) => ({ deskId: c.deskId, owner: c.owner, member: c.member })),
  bookings: s.bookings.map((b) => ({ id: b.id, zone: b.zone, by: b.by, start: b.start, until: b.until })),
})

// Takes whatever was saved and keeps only what still makes sense.
export function readReservations(raw: any): SavedReservations {
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  return {
    desks: (Array.isArray(raw?.desks) ? raw.desks : [])
      .filter((c: any) => c && str(c.owner, 20) && deskById(c.deskId))
      .map((c: any) => ({ deskId: c.deskId, owner: str(c.owner, 20), member: str(c.member, 40) })),
    bookings: (Array.isArray(raw?.bookings) ? raw.bookings : [])
      .filter((b: any) => b && BOOKABLE_ZONES.includes(b.zone) && str(b.by, 20) && Number.isFinite(b.start) && Number.isFinite(b.until) && b.until > b.start)
      .map((b: any) => ({ id: str(b.id, 40) || `${b.start}`, zone: b.zone, by: str(b.by, 20), start: b.start, until: b.until })),
  }
}

// Someone goes by a new name: their desk follows the account, and their bookings follow the old name.
export function renamed(s: Lists, member: string, was: string, now: string): boolean {
  let changed = false
  for (const c of s.desks) {
    if ((member ? c.member === member : !c.member && c.owner === was) && c.owner !== now) {
      c.owner = now
      changed = true
    }
  }
  if (was !== now) {
    for (const b of s.bookings) {
      if (b.by === was) {
        b.by = now
        changed = true
      }
    }
  }
  return changed
}

export class ReservationStore {
  private file: string | null
  constructor(dir: string | undefined) {
    this.file = dir ? join(dir, 'reservations.json') : null
    if (dir) {
      try {
        mkdirSync(dir, { recursive: true })
      } catch {
        this.file = null
      }
    }
  }

  load(): SavedReservations {
    if (!this.file) return readReservations(null)
    try {
      return readReservations(JSON.parse(readFileSync(this.file, 'utf8')))
    } catch {
      return readReservations(null)
    }
  }

  save(s: Lists) {
    if (!this.file) return
    try {
      writeFileSync(`${this.file}.tmp`, JSON.stringify(snapshot(s)))
      renameSync(`${this.file}.tmp`, this.file)
    } catch (e) {
      console.warn('Reservations could not be saved', e)
    }
  }

  // Puts saved claims and bookings back. `saved` comes from Supabase when there is one, otherwise from the file.
  restore(s: Lists, now: number, saved: SavedReservations = this.load()) {
    for (const c of saved.desks) claimDesk(s, c.deskId, c.owner, c.member)
    for (const b of saved.bookings) {
      if (b.until <= now) continue
      const booking = new Booking()
      Object.assign(booking, b)
      s.bookings.push(booking)
    }
  }
}

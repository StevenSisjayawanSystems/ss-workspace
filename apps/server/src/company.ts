// Timers and music each belong to whoever started them. Others come in two ways: anyone may join
// one that is open, and the people in on it can bring someone in, the way you would pull a
// colleague over to your desk. Someone busy with a timer or music of their own is asked first. Who is in on one, and who
// has been invited, are kept as member keys in a single space-separated string, the way a note
// keeps its votes.
export interface Shared {
  id: string
  members: string
  open: boolean
  invited: string
}

// The little of a synced map that is needed here.
interface Kept<T> {
  forEach(each: (value: T, id: string) => void): void
  delete(id: string): unknown
}

export const keysOf = (members: string) => (members ? members.split(' ') : [])

export const newId = (now: number) => `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// The one this person is in, if any. Nobody is in two at once.
export function companyOf<T extends Shared>(all: Kept<T>, key: string): T | undefined {
  let found: T | undefined
  all.forEach((s) => {
    if (keysOf(s.members).includes(key)) found = s
  })
  return found
}

export const canJoin = (s: Shared, key: string) => s.open || keysOf(s.invited).includes(key)

export function join(s: Shared, key: string) {
  s.members = [...new Set([...keysOf(s.members), key])].join(' ')
  s.invited = keysOf(s.invited).filter((k) => k !== key).join(' ')
}

// Returns whether this is news: someone already in, or already asked, is not asked again.
export function invite(s: Shared, key: string): boolean {
  if (keysOf(s.members).includes(key) || keysOf(s.invited).includes(key)) return false
  s.invited = [...keysOf(s.invited), key].join(' ')
  return true
}

// Takes someone out of whichever one they are in. One with nobody left in it is over.
export function leave<T extends Shared>(all: Kept<T>, key: string) {
  const s = companyOf(all, key)
  if (!s) return
  s.members = keysOf(s.members).filter((k) => k !== key).join(' ')
  if (!s.members) all.delete(s.id)
}

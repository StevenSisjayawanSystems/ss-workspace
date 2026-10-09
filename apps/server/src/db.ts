import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isBoard, pairKey, type Bond, type Person, type Progress, type TaskSession } from '@guildhouse/shared'
import { config } from './config'
import type { SavedComment, SavedNote } from './notes'
import type { Todo } from './tasks'

// What a member chooses about themselves. Anything left out of a save is left as it was.
export interface Card {
  name: string
  robe: string
  trim: string
  hair: string
  hat: boolean
  about: string
}

export interface SavedMember {
  progress: Progress
  seenAt: number
  // When they first joined.
  since: number
  about: string
  focusSeconds: number
  bonusDay: string
  bonusCount: number
  alarmAt: number
  alarmLabel: string
}

// What is written down about a member each time they are saved.
export interface MemberRow {
  id: string
  name: string
  progress: Progress
  focusSeconds: number
  bonusDay: string
  bonusCount: number
  alarmAt: number
  alarmLabel: string
}

const KEPT = ['reservations'] as const

// One line of chat as clients see it. `to` is empty for the room everyone shares.
export interface ChatLine {
  // Session that sent it, when they are here now; empty for history.
  id: string
  from: string
  name: string
  text: string
  at: number
  to: string
  mentions: string[]
}

const ROOM_HISTORY = 60
const DIRECT_HISTORY = 200

const fail = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`)
}

// Everything kept in Supabase. The server signs in with the secret key, so these calls are not
// subject to row level security; no browser can make them.
export class Db {
  private sb: SupabaseClient
  constructor(url: string, secretKey: string) {
    this.sb = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }

  // The account a sign-in token belongs to, or null if it is not a good one.
  async accountOf(token: unknown): Promise<string | null> {
    if (typeof token !== 'string' || !token) return null
    const { data, error } = await this.sb.auth.getUser(token)
    return error ? null : (data.user?.id ?? null)
  }

  // Throws when the row cannot be read, so a passing fault is never mistaken for a new member.
  async member(id: string): Promise<SavedMember | null> {
    const { data, error } = await this.sb.from('members').select('*').eq('id', id).maybeSingle()
    fail('Reading a member', error)
    if (!data) return null
    return {
      progress: { seconds: data.seconds, callSeconds: data.call_seconds, metres: data.metres, messages: data.messages, songs: data.songs, pomodoros: data.pomodoros, days: data.days, streak: data.streak, lastDay: data.last_day },
      seenAt: Date.parse(data.seen_at) || Date.now(),
      since: Date.parse(data.created_at) || Date.now(),
      about: data.about ?? '',
      focusSeconds: data.focus_seconds ?? 0,
      bonusDay: data.task_bonus_day ?? '',
      bonusCount: data.task_bonus_count ?? 0,
      alarmAt: data.alarm_at ? Date.parse(data.alarm_at) : 0,
      alarmLabel: data.alarm_label ?? '',
    }
  }

  async saveMembers(members: MemberRow[], now: number) {
    if (!members.length) return
    const p = (m: { progress: Progress }) => m.progress
    const rows = members.map((m) => ({ id: m.id, name: m.name, seconds: Math.round(p(m).seconds), call_seconds: Math.round(p(m).callSeconds), metres: Math.round(p(m).metres), messages: p(m).messages, songs: p(m).songs, pomodoros: p(m).pomodoros, days: p(m).days, streak: p(m).streak, last_day: p(m).lastDay, focus_seconds: Math.round(m.focusSeconds), task_bonus_day: m.bonusDay, task_bonus_count: m.bonusCount, alarm_at: m.alarmAt ? new Date(m.alarmAt).toISOString() : null, alarm_label: m.alarmLabel, seen_at: new Date(now).toISOString() }))
    fail('Saving progress', (await this.sb.from('members').upsert(rows)).error)
  }

  async saveCard(id: string, card: Partial<Card>) {
    fail('Saving a profile', (await this.sb.from('members').update(card).eq('id', id)).error)
  }

  // Everyone who has ever joined, so people can be named and messaged while they are away.
  async people(): Promise<Person[]> {
    const { data, error } = await this.sb.from('members').select('id, name').order('created_at').limit(1000)
    fail('Reading the members', error)
    return (data ?? []).map((m) => ({ id: m.id, name: m.name }))
  }

  // A member's lists, tasks and categories, or null if they have none saved yet.
  async todo(id: string): Promise<Todo | null> {
    const [lists, tasks, categories] = await Promise.all([
      this.sb.from('task_lists').select('*').eq('member_id', id).order('position'),
      this.sb.from('tasks').select('*').eq('member_id', id).order('position'),
      this.sb.from('task_categories').select('*').eq('member_id', id).order('position'),
    ])
    fail('Reading tasks', lists.error ?? tasks.error ?? categories.error)
    if (!lists.data?.length) return null
    return {
      lists: lists.data.map((l) => ({
        id: l.id,
        name: l.name,
        sharedWith: l.shared_with ?? [],
        tasks: (tasks.data ?? []).filter((t) => t.list_id === l.id).map((t) => ({ id: t.id, title: t.title, done: t.done, doneAt: t.done_at ? Date.parse(t.done_at) : 0, at: Date.parse(t.created_at), category: t.category ?? '', rewarded: t.rewarded })),
      })),
      categories: (categories.data ?? []).map((c) => ({ id: c.id, name: c.name, color: c.color })),
    }
  }

  // Makes what is saved match this: rows that are gone are deleted, the rest written in order.
  async saveTodo(id: string, todo: Todo) {
    const except = (ids: string[]) => `(${ids.map((x) => `"${x}"`).join(',')})`
    const prune = async (table: string, ids: string[]) => {
      const gone = this.sb.from(table).delete().eq('member_id', id)
      fail(`Pruning ${table}`, (await (ids.length ? gone.not('id', 'in', except(ids)) : gone)).error)
    }
    const tasks = todo.lists.flatMap((l) => l.tasks.map((t, position) => ({ id: t.id, member_id: id, list_id: l.id, title: t.title, done: t.done, done_at: t.doneAt ? new Date(t.doneAt).toISOString() : null, rewarded: t.rewarded, category: t.category, position, created_at: new Date(t.at).toISOString() })))
    // Lists go first both ways: removing one takes its tasks with it, and a task needs its list to exist.
    await prune('task_lists', todo.lists.map((l) => l.id))
    fail('Saving lists', (await this.sb.from('task_lists').upsert(todo.lists.map((l, position) => ({ id: l.id, member_id: id, name: l.name, position, shared_with: l.sharedWith })))).error)
    await prune('tasks', tasks.map((t) => t.id))
    if (tasks.length) fail('Saving tasks', (await this.sb.from('tasks').upsert(tasks)).error)
    await prune('task_categories', todo.categories.map((c) => c.id))
    if (todo.categories.length) fail('Saving categories', (await this.sb.from('task_categories').upsert(todo.categories.map((c, position) => ({ id: c.id, member_id: id, name: c.name, color: c.color, position })))).error)
  }

  // Sessions a member has closed, latest first.
  async taskSessions(id: string, limit: number): Promise<(TaskSession & { sharedWith: string[] })[]> {
    const { data, error } = await this.sb.from('task_sessions').select('*').eq('member_id', id).order('ended_at', { ascending: false }).limit(limit)
    fail('Reading task sessions', error)
    return (data ?? []).map((s) => ({ list: s.list_name ?? '', startedAt: Date.parse(s.started_at), endedAt: Date.parse(s.ended_at), done: s.done, total: s.total, titles: s.titles ?? [], sharedWith: s.shared_with ?? [] }))
  }

  async addTaskSession(id: string, s: TaskSession & { sharedWith: string[] }) {
    const row = { member_id: id, list_name: s.list, started_at: new Date(s.startedAt).toISOString(), ended_at: new Date(s.endedAt).toISOString(), done: s.done, total: s.total, titles: s.titles, shared_with: s.sharedWith }
    fail('Saving a task session', (await this.sb.from('task_sessions').insert(row)).error)
  }

  // The Focus Garden's beds: the first members to have focused, in the order they joined.
  async garden(beds: number): Promise<{ member: string; name: string; seconds: number }[]> {
    const { data, error } = await this.sb.from('members').select('id, name, focus_seconds').gt('focus_seconds', 0).order('created_at').limit(beds)
    fail('Reading the garden', error)
    return (data ?? []).map((m) => ({ member: m.id, name: m.name, seconds: m.focus_seconds }))
  }

  // A named piece of shared state kept whole, or null if it has never been saved.
  async kept(key: (typeof KEPT)[number]): Promise<unknown> {
    const { data, error } = await this.sb.from('kept').select('value').eq('key', key).maybeSingle()
    fail(`Reading ${key}`, error)
    return data?.value ?? null
  }

  async keep(key: (typeof KEPT)[number], value: unknown) {
    fail(`Saving ${key}`, (await this.sb.from('kept').upsert({ key, value, updated_at: new Date().toISOString() })).error)
  }

  async notes(): Promise<SavedNote[]> {
    const { data, error } = await this.sb.from('notes').select('*').order('created_at')
    fail('Reading the board', error)
    const said = await this.sb.from('note_comments').select('*').order('created_at')
    fail('Reading the comments', said.error)
    const under = new Map<string, SavedComment[]>()
    for (const c of said.data ?? []) under.set(c.note_id, [...(under.get(c.note_id) ?? []), { id: c.id, author: c.author_name, authorId: c.author_id ?? '', text: c.body, at: Date.parse(c.created_at), mentions: c.mentions ?? [] }])
    return (data ?? []).map((n) => ({ id: n.id, board: isBoard(n.board) ? n.board : 'fun', text: n.body, author: n.author_name, authorId: n.author_id ?? '', color: n.color, x: n.x, y: n.y, z: n.z, at: Date.parse(n.created_at), votes: n.votes ?? [], mentions: n.mentions ?? [], comments: under.get(n.id) ?? [] }))
  }

  async addComment(noteId: string, c: SavedComment) {
    const row = { id: c.id, note_id: noteId, author_id: c.authorId || null, author_name: c.author, body: c.text, mentions: c.mentions, created_at: new Date(c.at).toISOString() }
    fail('Saving a comment', (await this.sb.from('note_comments').insert(row)).error)
  }

  // Every bond there is, by pair key.
  async bonds(): Promise<Map<string, Bond>> {
    const { data, error } = await this.sb.from('bonds').select('*')
    fail('Reading the bonds', error)
    return new Map((data ?? []).map((r) => [pairKey(r.a, r.b), { callSeconds: r.call_seconds, focusSeconds: r.focus_seconds, messages: r.messages, friends: r.friends, askedBy: r.asked_by ?? '' }]))
  }

  async saveBonds(bonds: [string, Bond][]) {
    if (!bonds.length) return
    const rows = bonds.map(([pair, bond]) => ({ a: pair.split(' ')[0], b: pair.split(' ')[1], call_seconds: Math.round(bond.callSeconds), focus_seconds: Math.round(bond.focusSeconds), messages: bond.messages, friends: bond.friends, asked_by: bond.askedBy || null }))
    fail('Saving bonds', (await this.sb.from('bonds').upsert(rows)).error)
  }

  async putNote(n: SavedNote) {
    const row = { id: n.id, board: n.board, body: n.text, author_name: n.author, author_id: n.authorId || null, color: n.color, x: n.x, y: n.y, z: n.z, created_at: new Date(n.at).toISOString(), votes: n.votes, mentions: n.mentions }
    fail('Saving a note', (await this.sb.from('notes').upsert(row)).error)
  }

  async removeNote(id: string) {
    fail('Removing a note', (await this.sb.from('notes').delete().eq('id', id)).error)
  }

  async addMessage(line: ChatLine) {
    const row = { sender_id: line.from, recipient_id: line.to || null, sender_name: line.name, body: line.text, mentions: line.mentions, created_at: new Date(line.at).toISOString() }
    fail('Saving a message', (await this.sb.from('messages').insert(row)).error)
  }

  // Recent chat for someone arriving: the room's, and their own direct messages. Oldest first.
  async history(id: string): Promise<ChatLine[]> {
    const cols = 'sender_id, recipient_id, sender_name, body, mentions, created_at'
    const [room, direct] = await Promise.all([
      this.sb.from('messages').select(cols).is('recipient_id', null).order('created_at', { ascending: false }).limit(ROOM_HISTORY),
      this.sb.from('messages').select(cols).not('recipient_id', 'is', null).or(`sender_id.eq.${id},recipient_id.eq.${id}`).order('created_at', { ascending: false }).limit(DIRECT_HISTORY),
    ])
    fail('Reading the chat', room.error ?? direct.error)
    return [...(room.data ?? []), ...(direct.data ?? [])]
      .map((m) => ({ id: '', from: m.sender_id, name: m.sender_name, text: m.body, at: Date.parse(m.created_at), to: m.recipient_id ?? '', mentions: m.mentions ?? [] }))
      .sort((a, b) => a.at - b.at)
  }
}

export const db = config.supabase.url && config.supabase.secretKey ? new Db(config.supabase.url, config.supabase.secretKey) : null

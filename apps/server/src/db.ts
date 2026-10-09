import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isBoard, pairKey, type Bond, type Person, type Progress } from '@guildhouse/shared'
import { config } from './config'
import type { SavedComment, SavedNote } from './notes'

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
}

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
    }
  }

  async saveMembers(members: { id: string; name: string; progress: Progress }[], now: number) {
    if (!members.length) return
    const p = (m: { progress: Progress }) => m.progress
    const rows = members.map((m) => ({ id: m.id, name: m.name, seconds: Math.round(p(m).seconds), call_seconds: Math.round(p(m).callSeconds), metres: Math.round(p(m).metres), messages: p(m).messages, songs: p(m).songs, pomodoros: p(m).pomodoros, days: p(m).days, streak: p(m).streak, last_day: p(m).lastDay, seen_at: new Date(now).toISOString() }))
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

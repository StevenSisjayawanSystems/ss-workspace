import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { schema, t, type SchemaType } from '@colyseus/schema'
import { MAX_COMMENTS, MAX_COMMENT_LENGTH, MAX_NOTES, MAX_NOTE_LENGTH, NOTE_COLORS, isBoard, onBoard, type BoardId } from '@guildhouse/shared'

// Something said under a note.
export const Comment = schema({ id: t.string(), author: t.string(), authorId: t.string(), text: t.string(), at: t.number(), mentions: t.string() }, 'Comment')
export type Comment = SchemaType<typeof Comment>

// A sticky note on the bulletin board in the entrance hall.
export const Note = schema(
  {
    id: t.string(),
    // Which face of the board it is on: 'features' or 'fun'.
    board: t.string(),
    text: t.string(),
    author: t.string(),
    // Account of the author, or '' for a note pinned by a guest.
    authorId: t.string(),
    color: t.string(),
    // Where its centre sits, as a fraction of the board; z decides which note lies on top.
    x: t.number(),
    y: t.number(),
    z: t.number(),
    at: t.number(),
    // Members who voted for it and members it names, as keys separated by spaces.
    votes: t.string(),
    mentions: t.string(),
    comments: t.array(Comment),
  },
  'Note',
)
export type Note = SchemaType<typeof Note>

export interface SavedNote {
  id: string
  board: BoardId
  text: string
  author: string
  // Account of the author, or '' for a note pinned by a guest.
  authorId: string
  color: string
  x: number
  y: number
  z: number
  at: number
  votes: string[]
  mentions: string[]
  comments: SavedComment[]
}

export interface SavedComment {
  id: string
  author: string
  authorId: string
  text: string
  at: number
  mentions: string[]
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s && !s.includes(' ')) : [])

// Used when the server runs without Supabase: notes are written to a small JSON file in DATA_DIR.
// On a host with an ephemeral disk, attach a volume there or they last only until redeploy.
export class NoteStore {
  private file: string | null
  constructor(dir: string | undefined) {
    this.file = dir ? join(dir, 'notes.json') : null
    if (dir) {
      try {
        mkdirSync(dir, { recursive: true })
      } catch (e) {
        console.warn(`Notes: cannot use ${dir}; notes will not survive a restart`, e)
        this.file = null
      }
    }
  }

  load(): SavedNote[] {
    if (!this.file) return []
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'))
      if (!Array.isArray(raw)) return []
      return raw
        .filter((n) => n && typeof n.id === 'string' && typeof n.text === 'string' && typeof n.author === 'string' && typeof n.at === 'number')
        .map((n, i) => ({
          id: n.id,
          board: isBoard(n.board) ? n.board : ('fun' as const),
          text: n.text.slice(0, MAX_NOTE_LENGTH),
          author: n.author.slice(0, 20),
          authorId: typeof n.authorId === 'string' ? n.authorId : '',
          color: NOTE_COLORS.includes(n.color) ? n.color : NOTE_COLORS[0],
          // Notes saved before the board had positions are laid out in rows.
          x: onBoard(n.x, 0.14 + (i % 5) * 0.18),
          y: onBoard(n.y, 0.2 + (Math.floor(i / 5) % 4) * 0.2),
          z: Number.isFinite(n.z) ? n.z : i,
          at: n.at,
          votes: strings(n.votes),
          mentions: strings(n.mentions),
          comments: (Array.isArray(n.comments) ? n.comments : [])
            .filter((c: any) => c && typeof c.id === 'string' && typeof c.text === 'string' && typeof c.author === 'string' && typeof c.at === 'number')
            .map((c: any) => ({ id: c.id, author: c.author.slice(0, 20), authorId: typeof c.authorId === 'string' ? c.authorId : '', text: c.text.slice(0, MAX_COMMENT_LENGTH), at: c.at, mentions: strings(c.mentions) }))
            .slice(-MAX_COMMENTS),
        }))
        .slice(-MAX_NOTES * 2)
    } catch {
      // No file yet, or an unreadable one: start with an empty board.
      return []
    }
  }

  save(notes: SavedNote[]) {
    if (!this.file) return
    try {
      // Written to a temporary file first so a crash mid-write cannot leave half a board.
      writeFileSync(`${this.file}.tmp`, JSON.stringify(notes))
      renameSync(`${this.file}.tmp`, this.file)
    } catch (e) {
      console.warn('Notes: could not be saved', e)
    }
  }
}

export function toNote(s: SavedNote): Note {
  const n = new Note()
  n.id = s.id
  n.board = s.board
  n.text = s.text
  n.author = s.author
  n.authorId = s.authorId
  n.color = s.color
  n.x = s.x
  n.y = s.y
  n.z = s.z
  n.at = s.at
  n.votes = s.votes.join(' ')
  n.mentions = s.mentions.join(' ')
  for (const c of s.comments) n.comments.push(toComment(c))
  return n
}

export function toComment(s: SavedComment): Comment {
  const c = new Comment()
  c.id = s.id
  c.author = s.author
  c.authorId = s.authorId
  c.text = s.text
  c.at = s.at
  c.mentions = s.mentions.join(' ')
  return c
}

const keys = (list: string) => (list ? list.split(' ') : [])
export const fromNote = (n: Note): SavedNote => ({ id: n.id, board: isBoard(n.board) ? n.board : 'fun', text: n.text, author: n.author, authorId: n.authorId, color: n.color, x: n.x, y: n.y, z: n.z, at: n.at, votes: keys(n.votes), mentions: keys(n.mentions), comments: n.comments.map((c) => ({ id: c.id, author: c.author, authorId: c.authorId, text: c.text, at: c.at, mentions: keys(c.mentions) })) })

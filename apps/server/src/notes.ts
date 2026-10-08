import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { schema, t, type SchemaType } from '@colyseus/schema'

// Notes pinned to the bulletin board in the entrance hall.
export const Note = schema(
  { id: t.string(), text: t.string(), author: t.string(), color: t.string(), at: t.number() },
  'Note',
)
export type Note = SchemaType<typeof Note>

export const MAX_NOTES = 60
export const MAX_NOTE_LENGTH = 280
export const NOTE_COLORS = ['#e9d18a', '#e8a48f', '#9fd0c4', '#b9a8e0', '#a9c98f']

export interface SavedNote {
  id: string
  text: string
  author: string
  color: string
  at: number
}

// Notes are the one thing here worth keeping across restarts. They are written to a small JSON file
// in DATA_DIR; on a host with an ephemeral disk, attach a volume there or they last only until redeploy.
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
        .map((n) => ({ id: n.id, text: n.text.slice(0, MAX_NOTE_LENGTH), author: n.author.slice(0, 20), color: NOTE_COLORS.includes(n.color) ? n.color : NOTE_COLORS[0], at: n.at }))
        .slice(-MAX_NOTES)
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

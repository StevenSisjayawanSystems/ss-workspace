import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { NOTE_COLORS } from '@guildhouse/shared'
import { NoteStore, fromNote, toNote, type SavedNote } from './notes'

describe('note store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guildhouse-notes-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const note: SavedNote = { id: 'a', board: 'features', text: 'Standup at 10', author: 'Ada', authorId: '', color: NOTE_COLORS[2], x: 0.25, y: 0.5, z: 3, at: 5, votes: ['m1', 'm2'], mentions: ['m3'], comments: [{ id: 'c1', author: 'Ben', authorId: '', text: 'Yes please', at: 9, mentions: ['m1'] }] }

  it('keeps notes across restarts', () => {
    new NoteStore(dir).save([note])
    expect(new NoteStore(dir).load()).toEqual([note])
  })

  it('carries every field through the shared state', () => {
    expect(fromNote(toNote(note))).toEqual(note)
  })

  it('ignores damaged entries and files, places notes from before the board had positions, and works without a folder', () => {
    writeFileSync(join(dir, 'notes.json'), JSON.stringify([{ id: 'a', text: 'ok', author: 'Ada', color: 'nope', at: 1 }, { id: 5 }, null]))
    expect(new NoteStore(dir).load()).toEqual([{ id: 'a', board: 'fun', text: 'ok', author: 'Ada', authorId: '', color: NOTE_COLORS[0], x: 0.14, y: 0.2, z: 0, at: 1, votes: [], mentions: [], comments: [] }])
    writeFileSync(join(dir, 'notes.json'), '{not json')
    expect(new NoteStore(dir).load()).toEqual([])
    const none = new NoteStore(undefined)
    none.save([])
    expect(none.load()).toEqual([])
  })
})

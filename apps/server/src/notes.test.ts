import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { NOTE_COLORS, NoteStore } from './notes'

describe('note store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guildhouse-notes-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('keeps notes across restarts', () => {
    const notes = [{ id: 'a', text: 'Standup at 10', author: 'Ada', color: NOTE_COLORS[2], at: 5 }]
    new NoteStore(dir).save(notes)
    expect(new NoteStore(dir).load()).toEqual(notes)
  })

  it('ignores damaged entries and files, and works without a folder', () => {
    writeFileSync(join(dir, 'notes.json'), JSON.stringify([{ id: 'a', text: 'ok', author: 'Ada', color: 'nope', at: 1 }, { id: 5 }, null]))
    expect(new NoteStore(dir).load()).toEqual([{ id: 'a', text: 'ok', author: 'Ada', color: NOTE_COLORS[0], at: 1 }])
    writeFileSync(join(dir, 'notes.json'), '{not json')
    expect(new NoteStore(dir).load()).toEqual([])
    const none = new NoteStore(undefined)
    none.save([])
    expect(none.load()).toEqual([])
  })
})

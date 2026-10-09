import { describe, expect, it } from 'vitest'
import { mentionDraft, mentionsIn, splitMentions } from './mentions'
import { laneAt, onBoard } from './board'

const people = [
  { id: 'a', name: 'Ada' },
  { id: 'al', name: 'Ada Lovelace' },
  { id: 'b', name: 'Ben' },
]

describe('mentions', () => {
  it('finds people by name, preferring the longest match and ignoring case', () => {
    expect(mentionsIn('hey @ada and @Ada Lovelace, ask @BEN', people)).toEqual(['a', 'al', 'b'])
    expect(mentionsIn('@Ben @Ben', people)).toEqual(['b'])
  })
  it('leaves alone email addresses, longer words and strangers', () => {
    expect(mentionsIn('mail ben@Ada.example, @Adam and @Zoe', people)).toEqual([])
  })
  it('splits text so mentions can be drawn differently', () => {
    expect(splitMentions('hi @Ben!', people)).toEqual([{ text: 'hi ' }, { text: '@Ben', id: 'b' }, { text: '!' }])
    expect(splitMentions('plain', people)).toEqual([{ text: 'plain' }])
  })
  it('knows when a name is being typed', () => {
    expect(mentionDraft('hi @Ad', 6)).toEqual({ at: 3, query: 'Ad' })
    expect(mentionDraft('hi @Ada Lo', 10)).toEqual({ at: 3, query: 'Ada Lo' })
    expect(mentionDraft('a@b', 3)).toBeNull()
    expect(mentionDraft('no mention', 5)).toBeNull()
  })
})

describe('board', () => {
  it('reads the lane off where a note was dropped and keeps notes on the board', () => {
    expect(laneAt(0.1).id).toBe('build')
    expect(laneAt(0.3).id).toBe('doing')
    expect(laneAt(0.6).id).toBe('done')
    expect(laneAt(1).id).toBe('remove')
    expect(onBoard(2)).toBe(0.97)
    expect(onBoard(-1)).toBe(0.03)
    expect(onBoard('x', 0.4)).toBe(0.4)
  })
})

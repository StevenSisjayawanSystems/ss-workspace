import { describe, expect, it } from 'vitest'
import { bondPoints, bondTier, pairKey } from './bonds'
import { parseRich, plainOf } from './rich'

describe('formatted text', () => {
  it('reads bold, italic, underline and strike, nested or side by side', () => {
    expect(parseRich('a **b** *c* __d__ ~~e~~')[0].spans).toEqual([{ text: 'a ' }, { text: 'b', bold: true }, { text: ' ' }, { text: 'c', italic: true }, { text: ' ' }, { text: 'd', underline: true }, { text: ' ' }, { text: 'e', strike: true }])
    expect(parseRich('**bold *and italic***')[0].spans).toEqual([{ text: 'bold ', bold: true }, { text: 'and italic', bold: true, italic: true }])
  })
  it('leaves unclosed marks as they were typed', () => {
    expect(plainOf('2 * 3 = 6')).toBe('2 * 3 = 6')
    expect(plainOf('snake__case and **')).toBe('snake__case and **')
  })
  it('reads lists and indents line by line', () => {
    expect(parseRich('Plan\n- one\n  - nested\n1. first\n    deep').map((b) => [b.indent, b.list, b.n, b.spans[0]?.text])).toEqual([
      [0, null, 0, 'Plan'],
      [0, 'bullet', 0, 'one'],
      [1, 'bullet', 0, 'nested'],
      [0, 'number', 1, 'first'],
      [2, null, 0, 'deep'],
    ])
    expect(parseRich('a\n\nb')).toHaveLength(3)
  })
})

describe('bonds', () => {
  it('scores shared time and messages, and names the bond', () => {
    expect(bondPoints({ callSeconds: 600, focusSeconds: 600, messages: 3 })).toBe(18)
    expect(bondTier(0)).toEqual({ name: 'Passing faces', into: 0, span: 5 })
    expect(bondTier(18)).toEqual({ name: 'Acquaintances', into: 13, span: 35 })
    expect(bondTier(9999).span).toBe(0)
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'))
  })
})

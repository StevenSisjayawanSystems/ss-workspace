// The text of a sticky note or a comment can be formatted. It is stored as plain text with a few
// light marks, so it stays safe to pass around and readable anywhere:
//   **bold**  *italic*  __underline__  ~~struck~~
//   "- " starts a bullet, "1. " a numbered item, and every two leading spaces indent a line one step.

export interface Span {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
}

export interface Block {
  // Steps in from the left edge.
  indent: number
  list: 'bullet' | 'number' | null
  // The number shown, for a numbered item.
  n: number
  spans: Span[]
}

export const MAX_INDENT = 4
const MARKS: [string, keyof Omit<Span, 'text'>][] = [
  ['**', 'bold'],
  ['__', 'underline'],
  ['~~', 'strike'],
  ['*', 'italic'],
]

// A mark only counts when it is closed again on the same line; a lone asterisk is just an asterisk.
function spansOf(line: string): Span[] {
  const spans: Span[] = []
  const on: Partial<Record<keyof Omit<Span, 'text'>, boolean>> = {}
  let text = ''
  const push = () => {
    if (text) spans.push({ text, ...on })
    text = ''
  }
  for (let i = 0; i < line.length; ) {
    const mark = MARKS.find(([m]) => line.startsWith(m, i))
    if (mark) {
      const [m, style] = mark
      const closing = on[style]
      // An opener needs something between it and its closer.
      if (closing || line.indexOf(m, i + m.length + 1) > 0) {
        push()
        if (closing) delete on[style]
        else on[style] = true
        i += m.length
        continue
      }
    }
    text += line[i++]
  }
  push()
  return spans
}

export function parseRich(text: string): Block[] {
  return text.split('\n').map((raw) => {
    const spaces = raw.length - raw.trimStart().length
    const indent = Math.min(MAX_INDENT, Math.floor(spaces / 2))
    const line = raw.trimStart()
    const numbered = /^(\d{1,3})\. /.exec(line)
    if (line.startsWith('- ')) return { indent, list: 'bullet', n: 0, spans: spansOf(line.slice(2)) }
    if (numbered) return { indent, list: 'number', n: Number(numbered[1]), spans: spansOf(line.slice(numbered[0].length)) }
    return { indent, list: null, n: 0, spans: spansOf(line) }
  })
}

// The words alone, with the marks taken out: for previews and for counting what was written.
export const plainOf = (text: string): string =>
  parseRich(text)
    .map((b) => b.spans.map((s) => s.text).join(''))
    .join('\n')

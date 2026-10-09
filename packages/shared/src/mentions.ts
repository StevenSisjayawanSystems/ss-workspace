// Naming someone with @ in a chat message or on a note. Names may contain spaces, so a mention is
// matched against the people who could be meant rather than cut at the first space.
export interface Person {
  id: string
  name: string
}

export interface Piece {
  text: string
  // Set when this piece is a mention: who it names.
  id?: string
}

const WORD = /[\p{L}\p{N}_]/u

// Splits text into plain runs and mentions.
export function splitMentions(text: string, people: Person[]): Piece[] {
  const byLength = people.filter((p) => p.name).sort((a, b) => b.name.length - a.name.length)
  const lower = text.toLowerCase()
  const pieces: Piece[] = []
  let plain = 0
  for (let i = 0; i < text.length; i++) {
    // An @ in the middle of a word is an email address or the like, not a mention.
    if (text[i] !== '@' || (i > 0 && WORD.test(text[i - 1]))) continue
    const who = byLength.find((p) => lower.startsWith(p.name.toLowerCase(), i + 1) && !WORD.test(text[i + 1 + p.name.length] ?? ''))
    if (!who) continue
    const end = i + 1 + who.name.length
    if (i > plain) pieces.push({ text: text.slice(plain, i) })
    pieces.push({ text: text.slice(i, end), id: who.id })
    plain = end
    i = end - 1
  }
  if (plain < text.length) pieces.push({ text: text.slice(plain) })
  return pieces
}

// Who a piece of text names, each person once.
export const mentionsIn = (text: string, people: Person[]): string[] => [...new Set(splitMentions(text, people).flatMap((p) => (p.id ? [p.id] : [])))]

// The name being typed after an @ just before the caret, or null when the caret is not in one.
export function mentionDraft(text: string, caret: number): { at: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0 || (at > 0 && WORD.test(before[at - 1]))) return null
  const query = before.slice(at + 1)
  // Names are short; past that the @ was something else.
  if (query.length > 20 || query.includes('\n')) return null
  return { at, query }
}

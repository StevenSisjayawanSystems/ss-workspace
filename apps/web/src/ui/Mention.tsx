import { useState, type KeyboardEvent, type RefObject, type SyntheticEvent } from 'react'
import { mentionDraft, splitMentions, type Person } from '@guildhouse/shared'
import { everyone, useNet } from '../net/net'

// Text with the people it names picked out; a mention of you stands out more.
export function Rich({ text }: { text: string }) {
  const me = useNet((s) => s.me)
  // Who can be named changes as people come and go.
  useNet((s) => s.people)
  useNet((s) => s.ids)
  return (
    <>
      {splitMentions(text, everyone()).map((piece, i) =>
        piece.id ? (
          <span key={i} className={piece.id === me ? 'mention me' : 'mention'}>
            {piece.text}
          </span>
        ) : (
          piece.text
        ),
      )}
    </>
  )
}

type Field = HTMLInputElement | HTMLTextAreaElement

// Typing @ in a field offers the people who can be named. Returns the list to draw next to the field,
// a key handler that reports whether it used the key, and a tracker for the caret.
export function useMentions(field: RefObject<Field | null>, value: string, set: (v: string) => void) {
  const me = useNet((s) => s.me)
  const [caret, setCaret] = useState(0)
  const [picked, setPicked] = useState(0)
  const [shut, setShut] = useState(false)
  const draft = shut ? null : mentionDraft(value, caret)
  const options = draft
    ? everyone()
        .filter((p) => p.id !== me && p.name.toLowerCase().startsWith(draft.query.toLowerCase()))
        .slice(0, 6)
    : []
  const at = Math.min(picked, options.length - 1)

  const choose = (person: Person) => {
    if (!draft) return
    const end = draft.at + person.name.length + 2
    set(`${value.slice(0, draft.at)}@${person.name} ${value.slice(caret)}`)
    setCaret(end)
    requestAnimationFrame(() => {
      field.current?.focus()
      field.current?.setSelectionRange(end, end)
    })
  }

  const onKeyDown = (e: KeyboardEvent<Field>): boolean => {
    if (!options.length) return false
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setPicked((at + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
    else if (e.key === 'Enter' || e.key === 'Tab') choose(options[at])
    else if (e.key === 'Escape') setShut(true)
    else return false
    e.preventDefault()
    e.stopPropagation()
    return true
  }

  const track = (e: SyntheticEvent<Field>) => {
    setCaret(e.currentTarget.selectionStart ?? e.currentTarget.value.length)
    if (e.type === 'change') {
      setShut(false)
      setPicked(0)
    }
  }

  const list = options.length ? (
    <ul className="mention-list" role="listbox" aria-label="People to mention">
      {options.map((p, i) => (
        // Chosen on mouse down, before the field can lose its place.
        <li key={p.id} role="option" aria-selected={i === at} className={i === at ? 'on' : ''} onMouseDown={(e) => (e.preventDefault(), choose(p))}>
          <i className={p.here ? 'here' : ''} />
          {p.name}
        </li>
      ))}
    </ul>
  ) : null

  return { list, onKeyDown, track }
}

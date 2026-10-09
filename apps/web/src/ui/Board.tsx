import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from 'react'
import { BOARDS, LANES, MAX_COMMENTS, MAX_COMMENT_LENGTH, MAX_NOTE_LENGTH, NOTE_COLORS, laneAt, onBoard, type BoardId } from '@guildhouse/shared'
import { useGame } from '../game'
import { board, useNet, type NoteItem } from '../net/net'
import { when } from '../time'
import { Icon } from './icons'
import { Rich, useMentions } from './Mention'
import { RichPad } from './RichPad'
import { RichText } from './RichText'

// What each lane of the roadmap is for, shown while it is empty.
const LANE_HINTS: Record<string, string> = { build: 'Ideas worth building', doing: 'Being built right now', done: 'Out in the world', remove: 'Time to retire these' }

// Each note hangs a little crooked, always the same way for the same note.
const tiltOf = (id: string) => ([...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 7) - 3

// Somewhere inside the given stretch of the board that is as clear of other notes as a few tries can find.
function clearSpot(notes: NoteItem[], x0: number, x1: number): { x: number; y: number } {
  let best = { x: (x0 + x1) / 2, y: 0.5 }
  let room = -1
  for (let i = 0; i < 40; i++) {
    const spot = { x: x0 + Math.random() * (x1 - x0), y: 0.24 + Math.random() * 0.6 }
    const nearest = Math.min(2, ...notes.map((n) => Math.hypot(n.x - spot.x, (n.y - spot.y) * 0.6)))
    if (nearest > room) {
      room = nearest
      best = spot
    }
  }
  return best
}

function Colors({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div className="board-colors">
      {NOTE_COLORS.map((c) => (
        <button key={c} type="button" aria-label={`Note colour ${c}`} className={c === value ? 'on' : ''} style={{ background: c }} onClick={() => onPick(c)} />
      ))}
    </div>
  )
}

// One note up close: all of its text, the comments under it, and, for whoever wrote it, a way to reword it.
function NoteCard({ note, onClose }: { note: NoteItem; onClose: () => void }) {
  const me = useNet((s) => s.me)
  const account = useNet((s) => s.account)
  const myName = useGame((s) => s.profile?.name)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note.text)
  const [color, setColor] = useState(note.color)
  const [reply, setReply] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const thread = useRef<HTMLUListElement>(null)
  const mentions = useMentions(field, reply, setReply)
  const mine = account ? note.authorId === me : !note.authorId && note.author === myName
  const full = note.comments.length >= MAX_COMMENTS

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight })
  }, [note.comments.length])

  const save = () => {
    if (!text.trim() || text.length > MAX_NOTE_LENGTH) return
    board.edit(note.id, text, color)
    setEditing(false)
  }
  const send = (e: FormEvent) => {
    e.preventDefault()
    if (!reply.trim()) return
    board.comment(note.id, reply.trim())
    setReply('')
  }

  return (
    <div className="note-scrim" onClick={onClose}>
      <div className="note-card" role="dialog" aria-label={`Note from ${note.author}`} onClick={(e) => e.stopPropagation()}>
        <div className="note-face" style={{ background: editing ? color : note.color }}>
          <header>
            <span>
              {note.author} · {when(note.at)}
            </span>
            {mine && !editing && (
              <button aria-label="Edit this note" title="Edit this note" onClick={() => (setText(note.text), setColor(note.color), setEditing(true))}>
                <Icon.edit />
              </button>
            )}
            <button
              aria-label="Take this note down"
              title="Take this note down"
              onClick={() => {
                board.remove(note.id)
                onClose()
              }}
            >
              <Icon.trash />
            </button>
            <button aria-label="Close" title="Close" onClick={onClose}>
              <Icon.close />
            </button>
          </header>
          {editing ? (
            <>
              <RichPad initial={note.text} placeholder="What should it say?" onChange={setText} onSubmit={save} autoFocus />
              <div className="note-edit">
                <Colors value={color} onPick={setColor} />
                <span className={text.length > MAX_NOTE_LENGTH ? 'over' : ''}>{MAX_NOTE_LENGTH - text.length}</span>
                <button type="button" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="button" className="on" disabled={!text.trim() || text.length > MAX_NOTE_LENGTH} onClick={save}>
                  Save
                </button>
              </div>
            </>
          ) : (
            <RichText text={note.text} />
          )}
        </div>
        <ul className="note-thread" ref={thread}>
          {note.comments.length === 0 && <li className="none">No comments yet. Say what you think.</li>}
          {note.comments.map((c) => (
            <li key={c.id} className={c.mentions.includes(me) ? 'named' : ''}>
              <div>
                <b>{c.author}</b>
                <time>{when(c.at)}</time>
              </div>
              <p>
                <Rich text={c.text} />
              </p>
            </li>
          ))}
        </ul>
        <form className="note-reply" onSubmit={send}>
          {mentions.list}
          <input
            ref={field}
            value={reply}
            maxLength={MAX_COMMENT_LENGTH}
            disabled={full}
            placeholder={full ? 'This note has all the comments it can hold' : 'Add a comment, @ to name someone'}
            onChange={(e) => (setReply(e.target.value), mentions.track(e))}
            onSelect={mentions.track}
            onKeyDown={(e) => {
              // Escape closes the card, not the whole board; the list of names takes it first.
              if (!mentions.onKeyDown(e) && e.key === 'Escape') (e.stopPropagation(), onClose())
            }}
          />
          <button className="icon-btn on" aria-label="Comment" title="Comment" disabled={!reply.trim()}>
            <Icon.send />
          </button>
        </form>
      </div>
    </div>
  )
}

// The bulletin board in the entrance hall. One face sorts feature ideas into lanes, so it is plain
// what to build and what to take out; the other is for anything at all. Notes are stuck on, and
// anyone can drag them about.
export function Board() {
  const open = useGame((s) => s.boardOpen)
  const myName = useGame((s) => s.profile?.name)
  const notes = useNet((s) => s.notes)
  const me = useNet((s) => s.me)
  const [face, setFace] = useState<BoardId>('features')
  const [lane, setLane] = useState<string>(LANES[0].id)
  const [text, setText] = useState('')
  const [color, setColor] = useState(NOTE_COLORS[0])
  // The note being dragged and where it is right now, ahead of the server's word.
  const [held, setHeld] = useState<{ id: string; x: number; y: number } | null>(null)
  // Notes that have just gone up, with how far away (in pixels) they fly in from.
  const [fresh, setFresh] = useState<Record<string, { fx: number; fy: number }>>({})
  // The note opened up close, and a counter that empties the pad after each note goes up.
  const [reading, setReading] = useState<string | null>(null)
  const [sheet, setSheet] = useState(0)
  const surface = useRef<HTMLDivElement>(null)
  const pad = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; dx: number; dy: number; x: number; y: number; sent: number; moved: boolean; fromX: number; fromY: number } | null>(null)
  const known = useRef<Set<string> | null>(null)
  const launched = useRef<{ x: number; y: number; at: number } | null>(null)
  const close = () => useGame.setState({ boardOpen: false })

  useEffect(() => {
    if (!open) return
    setReading(null)
    // Escape closes a note that is open up close first, then the board.
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setReading((r) => (r ? null : (close(), null)))
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])

  // Spot notes that went up while the board is open, so they can be stuck on rather than just appear.
  useEffect(() => {
    if (!open) {
      known.current = null
      return
    }
    const seen = (known.current ??= new Set(notes.map((n) => n.id)))
    const arrived = notes.filter((n) => !seen.has(n.id))
    if (!arrived.length) return
    const rect = surface.current?.getBoundingClientRect()
    const flights: Record<string, { fx: number; fy: number }> = {}
    for (const n of arrived) {
      seen.add(n.id)
      const from = launched.current
      // Our own note leaves from the pad we wrote it on; anyone else's comes down from above.
      if (from && rect && n.author === myName && Date.now() - from.at < 4000) {
        flights[n.id] = { fx: from.x - (rect.left + n.x * rect.width), fy: from.y - (rect.top + n.y * rect.height) }
        launched.current = null
      } else flights[n.id] = { fx: 0, fy: -70 }
    }
    setFresh((f) => ({ ...f, ...flights }))
  }, [notes, open])

  if (!open) return null

  const shown = notes.filter((n) => n.board === face).sort((a, b) => a.z - b.z)
  const heldLane = held && face === 'features' ? laneAt(held.x).id : null

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!text.trim() || text.length > MAX_NOTE_LENGTH) return
    const column = LANES.findIndex((l) => l.id === lane)
    const spot = face === 'features' ? clearSpot(shown, (column + 0.3) / LANES.length, (column + 0.7) / LANES.length) : clearSpot(shown, 0.1, 0.9)
    const from = pad.current?.getBoundingClientRect()
    if (from) launched.current = { x: from.left + from.width / 2, y: from.top + from.height / 2, at: Date.now() }
    board.add({ text, color, board: face, ...spot })
    setText('')
    setSheet((n) => n + 1)
  }

  const place = (e: PointerEvent, d: { dx: number; dy: number }) => {
    const rect = surface.current!.getBoundingClientRect()
    return { x: onBoard((e.clientX - d.dx - rect.left) / rect.width), y: onBoard((e.clientY - d.dy - rect.top) / rect.height) }
  }
  const grab = (e: PointerEvent<HTMLDivElement>, n: NoteItem) => {
    if ((e.target as HTMLElement).closest('button') || !surface.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = surface.current.getBoundingClientRect()
    // Hold the note by wherever it was picked up, not by its middle.
    drag.current = { id: n.id, dx: e.clientX - (rect.left + n.x * rect.width), dy: e.clientY - (rect.top + n.y * rect.height), x: n.x, y: n.y, sent: 0, moved: false, fromX: e.clientX, fromY: e.clientY }
  }
  const carry = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    // A press that barely moves is a click, which opens the note instead of shifting it.
    if (!d.moved && Math.hypot(e.clientX - d.fromX, e.clientY - d.fromY) < 5) return
    d.moved = true
    Object.assign(d, place(e, d))
    setHeld({ id: d.id, x: d.x, y: d.y })
    // Others watch it move, a dozen or so times a second.
    if (Date.now() - d.sent > 70) {
      d.sent = Date.now()
      board.move(d.id, d.x, d.y, false)
    }
  }
  const drop = () => {
    const d = drag.current
    if (!d) return
    drag.current = null
    if (!d.moved) return setReading(d.id)
    board.move(d.id, d.x, d.y, true)
    // Stay put until the server has caught up, so the note does not jump back for a moment.
    setTimeout(() => setHeld((h) => (h?.id === d.id && !drag.current ? null : h)), 400)
  }

  return (
    <div className="board-scrim" onClick={close}>
      <div className="board" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Bulletin board">
        <div className="board-head">
          <div className="board-faces">
            {BOARDS.map((b) => (
              <button key={b.id} className={b.id === face ? 'on' : ''} onClick={() => (setFace(b.id), setText(''))}>
                {b.name}
                <i>{notes.filter((n) => n.board === b.id).length}</i>
              </button>
            ))}
          </div>
          <button className="icon-btn small" aria-label="Close" title="Close" onClick={close}>
            <Icon.close />
          </button>
        </div>
        <div className="board-frame">
          <div className={`board-surface ${face}`} ref={surface}>
            {face === 'features' && (
              <div className="board-lanes">
                {LANES.map((l) => {
                  const count = shown.filter((n) => laneAt(n.id === held?.id ? held.x : n.x).id === l.id).length
                  return (
                    <div key={l.id} className={`${l.id} ${heldLane === l.id ? 'on' : ''}`}>
                      <header>
                        <span>{l.name}</span>
                        <i>{count}</i>
                      </header>
                      {count === 0 && <em>{LANE_HINTS[l.id]}</em>}
                    </div>
                  )
                })}
              </div>
            )}
            {shown.length === 0 && face === 'fun' && (
              <div className="board-empty">
                <em>Nothing up yet. Jokes, links, doodles in words: it all goes here.</em>
              </div>
            )}
            {shown.map((n) => {
              const at = held?.id === n.id ? held : n
              const flight = fresh[n.id]
              const voted = n.votes.includes(me)
              return (
                <div
                  key={n.id}
                  className={`sticky ${n.text.length > 120 ? 'long' : ''} ${held?.id === n.id ? 'held' : ''} ${flight ? 'fresh' : ''} ${n.mentions.includes(me) ? 'named' : ''}`}
                  style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%`, background: n.color, '--tilt': `${tiltOf(n.id)}deg`, '--fx': `${flight?.fx ?? 0}px`, '--fy': `${flight?.fy ?? 0}px` } as CSSProperties}
                  onPointerDown={(e) => grab(e, n)}
                  onPointerMove={carry}
                  onPointerUp={drop}
                  onPointerCancel={drop}
                  onAnimationEnd={() => setFresh(({ [n.id]: _, ...rest }) => rest)}
                >
                  <RichText text={n.text} />
                  <footer>
                    <span>
                      {n.author} · {when(n.at)}
                    </span>
                    {n.comments.length > 0 && (
                      <em title={`${n.comments.length} ${n.comments.length === 1 ? 'comment' : 'comments'}`}>
                        <Icon.message />
                        {n.comments.length}
                      </em>
                    )}
                    <button className={voted ? 'on' : ''} aria-pressed={voted} aria-label={face === 'features' ? 'Vote for this' : 'Like this'} title={face === 'features' ? 'Vote for this' : 'Like this'} onClick={() => board.vote(n.id)}>
                      {face === 'features' ? <Icon.up /> : <Icon.heart />}
                      {n.votes.length > 0 && n.votes.length}
                    </button>
                    <button aria-label="Take this note down" title="Take this note down" onClick={() => board.remove(n.id)}>
                      <Icon.close />
                    </button>
                  </footer>
                </div>
              )
            })}
          </div>
        </div>
        <form className="board-new" onSubmit={submit}>
          <div className="board-pad" ref={pad} style={{ background: color }}>
            <RichPad key={`${face}-${sheet}`} placeholder={face === 'features' ? 'A feature to build, or one to take out…' : 'Anything at all…'} onChange={setText} onSubmit={submit} />
            <span className={text.length > MAX_NOTE_LENGTH ? 'over' : ''}>{MAX_NOTE_LENGTH - text.length}</span>
          </div>
          <div className="board-new-side">
            <div className="board-opt">
              <span>Colour</span>
              <Colors value={color} onPick={setColor} />
            </div>
            {face === 'features' && (
              <div className="board-opt">
                <span>Goes in</span>
                <div className="board-lane-pick">
                  {LANES.map((l) => (
                    <button key={l.id} type="button" className={`${l.id} ${l.id === lane ? 'on' : ''}`} onClick={() => setLane(l.id)}>
                      <i />
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button className="board-stick" disabled={!text.trim() || text.length > MAX_NOTE_LENGTH}>
            <Icon.pin />
            Stick it
          </button>
        </form>
        {reading && notes.some((n) => n.id === reading) && <NoteCard key={reading} note={notes.find((n) => n.id === reading)!} onClose={() => setReading(null)} />}
      </div>
    </div>
  )
}

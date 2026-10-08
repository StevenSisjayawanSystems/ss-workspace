import { useEffect, useState, type FormEvent } from 'react'
import { useGame } from '../game'
import { board, useNet } from '../net/net'
import { Icon } from './icons'

const COLORS = ['#e9d18a', '#e8a48f', '#9fd0c4', '#b9a8e0', '#a9c98f']
const MAX_LENGTH = 280

const when = (at: number) => {
  const d = new Date(at)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// The bulletin board in the entrance hall: short notes anyone can pin up or take down.
export function Board() {
  const open = useGame((s) => s.boardOpen)
  const notes = useNet((s) => s.notes)
  const [text, setText] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const close = () => useGame.setState({ boardOpen: false })

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])

  if (!open) return null
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    board.add(text.trim(), color)
    setText('')
  }

  return (
    <div className="board-scrim" onClick={close}>
      <div className="board" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Bulletin board">
        <div className="board-head">
          <span>Bulletin board</span>
          <button className="icon-btn small" aria-label="Close" title="Close" onClick={close}>
            <Icon.close />
          </button>
        </div>
        <form className="board-new" onSubmit={submit}>
          <textarea value={text} maxLength={MAX_LENGTH} rows={2} placeholder="Pin a note for the team…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && submit(e)} />
          <div className="board-new-row">
            <div className="board-colors">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Note colour ${c}`} className={c === color ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
            <span>{MAX_LENGTH - text.length}</span>
            <button className="icon-btn on" disabled={!text.trim()} aria-label="Pin note" title="Pin note">
              <Icon.plus />
            </button>
          </div>
        </form>
        <div className="board-notes">
          {notes.length === 0 && <div className="board-empty">Nothing pinned yet.</div>}
          {[...notes].reverse().map((n) => (
            <div key={n.id} className="note" style={{ background: n.color }}>
              <p>{n.text}</p>
              <footer>
                <span>
                  {n.author} · {when(n.at)}
                </span>
                <button aria-label="Take this note down" title="Take this note down" onClick={() => board.remove(n.id)}>
                  <Icon.close />
                </button>
              </footer>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

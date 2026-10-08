import { useEffect, useRef, useState, type FormEvent } from 'react'
import { sendChat, sendEmote, useNet, type Emote } from '../net/net'
import { useVoice } from '../voice/voice'
import { Icon } from './icons'

const EMOTE_ICONS: [Emote, () => React.JSX.Element, string][] = [
  ['wave', Icon.wave, 'Wave'],
  ['heart', Icon.heart, 'Send a heart'],
  ['laugh', Icon.laugh, 'Laugh'],
  ['cheer', Icon.cheer, 'Cheer'],
]

// `docked` is the copy shown beside the call in focus mode; the floating one steps aside while that is open.
export function Chat({ docked = false }: { docked?: boolean }) {
  const chat = useNet((s) => s.chat)
  const online = useNet((s) => s.status === 'online')
  const focus = useVoice((s) => s.focus)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const active = online && docked === focus

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [chat, active])

  // Enter jumps into the chat box from anywhere; Escape hands the keyboard back to movement.
  useEffect(() => {
    if (!active) return
    const key = (e: KeyboardEvent) => {
      // Enter inside any other field or on a button belongs to that control.
      const busy = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement
      if (e.key === 'Enter' && !busy) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [active])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (t) sendChat(t)
    setText('')
    if (!docked) input.current?.blur()
  }

  if (!active) return null
  return (
    <div className={`chat ${docked ? 'docked' : ''}`}>
      <div className="chat-log" ref={log}>
        {chat.slice(docked ? -200 : -30).map((m, i) => (
          <div key={`${m.at}-${i}`}>
            <b>{m.name}</b> {m.text}
          </div>
        ))}
      </div>
      <form onSubmit={submit}>
        <input ref={input} value={text} maxLength={240} placeholder="Message" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && input.current?.blur()} />
        {EMOTE_ICONS.map(([k, Glyph, label]) => (
          <button key={k} type="button" className="icon-btn" aria-label={label} title={label} onClick={() => sendEmote(k)}>
            <Glyph />
          </button>
        ))}
      </form>
    </div>
  )
}

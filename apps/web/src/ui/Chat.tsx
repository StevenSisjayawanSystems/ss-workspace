import { useEffect, useRef, useState, type FormEvent } from 'react'
import { closeTalk, everyone, openTalk, sendChat, sendEmote, talkOf, useNet, type Emote } from '../net/net'
import { when } from '../time'
import { useVoice } from '../voice/voice'
import { Icon } from './icons'
import { Rich, useMentions } from './Mention'

const EMOTE_ICONS: [Emote, () => React.JSX.Element, string][] = [
  ['wave', Icon.wave, 'Wave'],
  ['heart', Icon.heart, 'Send a heart'],
  ['laugh', Icon.laugh, 'Laugh'],
  ['cheer', Icon.cheer, 'Cheer'],
]

// Messages from the same person within this long are shown under one name.
const GROUP_MS = 5 * 60000

// The room's conversation and your direct messages, one tab each.
// `docked` is the copy shown beside the call in focus mode; the floating one steps aside while that is open.
export function Chat({ docked = false }: { docked?: boolean }) {
  const chat = useNet((s) => s.chat)
  const me = useNet((s) => s.me)
  const talk = useNet((s) => s.talk)
  const talks = useNet((s) => s.talks)
  const unread = useNet((s) => s.unread)
  const online = useNet((s) => s.status === 'online')
  useNet((s) => s.people)
  useNet((s) => s.ids)
  const focus = useVoice((s) => s.focus)
  const [text, setText] = useState('')
  const [tall, setTall] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const mentions = useMentions(input, text, setText)
  const active = online && docked === focus

  const lines = chat.filter((m) => talkOf(m, me) === talk).slice(-200)
  const cast = everyone()
  const nameOf = (key: string) => cast.find((p) => p.id === key)?.name ?? chat.find((m) => m.from === key)?.name ?? 'Someone'
  const them = cast.find((p) => p.id === talk)

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [chat, active, talk, tall])

  // Enter jumps into the chat box from anywhere; Escape hands the keyboard back to movement.
  useEffect(() => {
    if (!active) return
    const key = (e: KeyboardEvent) => {
      // Enter inside any other field or on a button belongs to that control.
      const busy = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement || (e.target instanceof HTMLElement && e.target.isContentEditable)
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
    if (!docked && !talk) input.current?.blur()
  }

  const turnTo = (key: string) => {
    openTalk(key)
    setChoosing(false)
    input.current?.focus()
  }

  if (!active) return null
  return (
    <div className={`chat ${docked ? 'docked' : ''} ${tall ? 'tall' : ''}`}>
      <div className="chat-tabs">
        <button className={talk === '' ? 'on' : ''} onClick={() => turnTo('')}>
          Room
          {unread[''] > 0 && <i>{unread['']}</i>}
        </button>
        {talks.map((key) => (
          <button key={key} className={talk === key ? 'on' : ''} onClick={() => turnTo(key)}>
            <span>{nameOf(key)}</span>
            {unread[key] > 0 && <i>{unread[key]}</i>}
            <em role="button" aria-label={`Close messages with ${nameOf(key)}`} title="Close" onClick={(e) => (e.stopPropagation(), closeTalk(key))}>
              <Icon.close />
            </em>
          </button>
        ))}
        <button className={`chat-tool ${choosing ? 'on' : ''}`} aria-label="Message someone" title="Message someone" onClick={() => setChoosing(!choosing)}>
          <Icon.people />
        </button>
        {!docked && (
          <button className="chat-tool" aria-label={tall ? 'Shrink chat' : 'Expand chat'} title={tall ? 'Shrink chat' : 'Expand chat'} onClick={() => setTall(!tall)}>
            {tall ? <Icon.shrink /> : <Icon.expand />}
          </button>
        )}
      </div>
      {choosing && (
        <ul className="chat-people">
          {cast.filter((p) => p.id !== me).length === 0 && <li className="none">Nobody else has joined yet.</li>}
          {cast
            .filter((p) => p.id !== me)
            .map((p) => (
              <li key={p.id}>
                <button onClick={() => turnTo(p.id)}>
                  <i className={p.here ? 'here' : ''} />
                  <span>{p.name}</span>
                  <small>{p.here ? 'here now' : 'away'}</small>
                </button>
              </li>
            ))}
        </ul>
      )}
      <div className="chat-log" ref={log}>
        {talk && lines.length === 0 && (
          <div className="chat-empty">
            Just the two of you. {them && !them.here ? `${nameOf(talk)} is away and will find this waiting.` : `Say hello to ${nameOf(talk)}.`}
          </div>
        )}
        {lines.map((m, i) => {
          const prev = lines[i - 1]
          const head = !prev || prev.from !== m.from || m.at - prev.at > GROUP_MS
          return (
            <div key={`${m.at}-${i}`} className={`chat-line ${head ? 'head' : ''} ${m.from === me ? 'mine' : ''} ${m.mentions.includes(me) ? 'named' : ''}`}>
              {head && (
                <div className="chat-who">
                  <b>{m.name}</b>
                  <time>{when(m.at)}</time>
                </div>
              )}
              <p>
                <Rich text={m.text} />
              </p>
            </div>
          )
        })}
      </div>
      <form onSubmit={submit}>
        {mentions.list}
        <input
          ref={input}
          value={text}
          maxLength={240}
          placeholder={talk ? `Message ${nameOf(talk)}` : 'Message the room'}
          onChange={(e) => (setText(e.target.value), mentions.track(e))}
          onSelect={mentions.track}
          onKeyDown={(e) => !mentions.onKeyDown(e) && e.key === 'Escape' && input.current?.blur()}
        />
        {!talk &&
          EMOTE_ICONS.map(([k, Glyph, label]) => (
            <button key={k} type="button" className="icon-btn" aria-label={label} title={label} onClick={() => sendEmote(k)}>
              <Glyph />
            </button>
          ))}
        {talk && (
          <button className="icon-btn on" aria-label="Send" title="Send" disabled={!text.trim()}>
            <Icon.send />
          </button>
        )}
      </form>
    </div>
  )
}

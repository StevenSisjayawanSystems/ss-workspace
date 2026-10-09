import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { MAX_INDENT, mentionDraft, parseRich, type Person, type Span } from '@guildhouse/shared'
import { everyone, useNet } from '../net/net'
import { Icon } from './icons'

// A small formatted-text editor: what you see is what the note will look like. The browser does the
// editing; what is kept is the plain marked-up text described in the shared `rich` module, read back
// off the page here, so no HTML ever leaves this component.

const INDENT_PX = 18
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function inlineHtml(spans: Span[]): string {
  return spans
    .map((s) => {
      let h = esc(s.text)
      if (s.bold) h = `<b>${h}</b>`
      if (s.italic) h = `<i>${h}</i>`
      if (s.underline) h = `<u>${h}</u>`
      if (s.strike) h = `<s>${h}</s>`
      return h
    })
    .join('')
}

// Stored text, laid out as the editor's own markup.
function toHtml(text: string): string {
  if (!text) return ''
  let html = ''
  const open: string[] = []
  const close = (to: number) => {
    while (open.length > to) html += `</${open.pop()}>`
  }
  for (const block of parseRich(text)) {
    const inner = inlineHtml(block.spans) || '<br>'
    if (!block.list) {
      close(0)
      html += `<div${block.indent ? ` style="margin-left:${block.indent * INDENT_PX}px"` : ''}>${inner}</div>`
      continue
    }
    const tag = block.list === 'bullet' ? 'ul' : 'ol'
    const depth = block.indent + 1
    close(depth)
    if (open.length === depth && open[depth - 1] !== tag) close(depth - 1)
    while (open.length < depth) {
      html += `<${tag}>`
      open.push(tag)
    }
    html += `<li>${inner}</li>`
  }
  close(0)
  return html
}

interface Marks {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
}

const BLOCKS = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'PRE'])

// The editor's contents, read back as stored text.
function fromDom(root: HTMLElement): string {
  const lines: string[] = []
  let line: { prefix: string; text: string } | null = null
  const pad = (indent: number) => '  '.repeat(Math.min(MAX_INDENT, Math.max(0, indent)))
  const flush = () => {
    if (line) lines.push(line.prefix + line.text)
    line = null
  }
  const marked = (raw: string, m: Marks) => {
    const text = raw.replace(/ /g, ' ').replace(/\n/g, ' ')
    const core = text.trim()
    if (!core) return text
    const wrap = `${m.bold ? '**' : ''}${m.italic ? '*' : ''}${m.underline ? '__' : ''}${m.strike ? '~~' : ''}`
    const lead = text.slice(0, text.length - text.trimStart().length)
    const trail = text.slice(text.trimEnd().length)
    return `${lead}${wrap}${core}${[...wrap].reverse().join('')}${trail}`
  }
  const walk = (node: Node, indent: number, depth: number, marks: Marks, list: { tag: string; n: number } | null) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.textContent) return
      line ??= { prefix: pad(indent), text: '' }
      line.text += marked(node.textContent, marks)
      return
    }
    if (!(node instanceof HTMLElement)) return
    const tag = node.tagName
    if (tag === 'BR') {
      if (line) flush()
      else lines.push('')
      return
    }
    const style = node.style
    // A browser un-bolds part of a bold run by wrapping it in a span that says "normal".
    const plain = style.fontWeight === 'normal' || (style.fontWeight !== '' && Number(style.fontWeight) < 600)
    const m: Marks = {
      bold: !plain && (marks.bold || tag === 'B' || tag === 'STRONG' || style.fontWeight === 'bold' || Number(style.fontWeight) >= 600),
      italic: style.fontStyle !== 'normal' && (marks.italic || tag === 'I' || tag === 'EM' || style.fontStyle === 'italic'),
      underline: marks.underline || tag === 'U' || style.textDecorationLine.includes('underline'),
      strike: marks.strike || tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || style.textDecorationLine.includes('line-through'),
    }
    if (!BLOCKS.has(tag)) {
      node.childNodes.forEach((child) => walk(child, indent, depth, m, list))
      return
    }
    flush()
    if (tag === 'UL' || tag === 'OL') {
      const counter = { tag, n: 0 }
      node.childNodes.forEach((child) => walk(child, indent, depth + 1, m, counter))
    } else if (tag === 'LI') {
      const bullet = list?.tag === 'OL' ? `${++list.n}. ` : '- '
      line = { prefix: pad(indent + depth - 1) + bullet, text: '' }
      node.childNodes.forEach((child) => walk(child, indent, depth, m, null))
    } else {
      const inner = indent + (tag === 'BLOCKQUOTE' ? 1 : Math.round((parseFloat(style.marginLeft) || 0) / INDENT_PX))
      node.childNodes.forEach((child) => walk(child, inner, depth, m, list))
    }
    flush()
  }
  root.childNodes.forEach((child) => walk(child, 0, 0, {}, null))
  flush()
  return lines
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
}

const TOOLS: { command: string; label: string; face: React.JSX.Element }[] = [
  { command: 'bold', label: 'Bold', face: <b>B</b> },
  { command: 'italic', label: 'Italic', face: <i>I</i> },
  { command: 'underline', label: 'Underline', face: <u>U</u> },
  { command: 'strikeThrough', label: 'Strike through', face: <s>S</s> },
  { command: 'insertUnorderedList', label: 'Bulleted list', face: <Icon.bullets /> },
  { command: 'insertOrderedList', label: 'Numbered list', face: <Icon.numbers /> },
  { command: 'outdent', label: 'Indent less (Shift+Tab)', face: <Icon.outdent /> },
  { command: 'indent', label: 'Indent more (Tab)', face: <Icon.indent /> },
]

// `initial` is read once; give the pad a new `key` to load other text or to empty it.
export function RichPad({ initial = '', placeholder, onChange, onSubmit, autoFocus }: { initial?: string; placeholder: string; onChange: (text: string) => void; onSubmit: () => void; autoFocus?: boolean }) {
  const me = useNet((s) => s.me)
  const page = useRef<HTMLDivElement>(null)
  const [empty, setEmpty] = useState(!initial)
  const [active, setActive] = useState<Record<string, boolean>>({})
  // The name being typed after an @, and the text node it is in.
  const [draft, setDraft] = useState<{ node: Text; at: number; caret: number; query: string } | null>(null)
  const [picked, setPicked] = useState(0)

  useEffect(() => {
    if (!page.current) return
    page.current.innerHTML = toHtml(initial)
    if (autoFocus) {
      page.current.focus()
      getSelection()?.selectAllChildren(page.current)
      getSelection()?.collapseToEnd()
    }
  }, [])

  const options: Person[] = draft
    ? everyone()
        .filter((p) => p.id !== me && p.name.toLowerCase().startsWith(draft.query.toLowerCase()))
        .slice(0, 6)
    : []
  const at = Math.min(picked, options.length - 1)

  const read = () => {
    if (!page.current) return
    const text = fromDom(page.current)
    setEmpty(!text && !page.current.querySelector('li'))
    onChange(text)
  }
  // Which tools are on where the caret is, and whether a name is being typed there.
  const look = () => {
    const state: Record<string, boolean> = {}
    for (const t of TOOLS.slice(0, 6)) state[t.command] = document.queryCommandState(t.command)
    setActive(state)
    const sel = getSelection()
    const node = sel?.anchorNode
    const found = sel?.isCollapsed && node instanceof Text && page.current?.contains(node) ? mentionDraft(node.data.replace(/ /g, ' '), sel.anchorOffset) : null
    setDraft(found && node instanceof Text ? { node, caret: sel!.anchorOffset, ...found } : null)
    if (!found) setPicked(0)
  }
  const run = (command: string) => {
    page.current?.focus()
    document.execCommand(command)
    read()
    look()
  }
  const choose = (person: Person) => {
    if (!draft) return
    const { node, at: start, caret } = draft
    node.data = `${node.data.slice(0, start)}@${person.name} ${node.data.slice(caret)}`
    const end = start + person.name.length + 2
    getSelection()?.collapse(node, end)
    setDraft(null)
    read()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setPicked((at + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
      else if (e.key === 'Enter' || e.key === 'Tab') choose(options[at])
      else if (e.key === 'Escape') setDraft(null)
      else return
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      run(e.shiftKey ? 'outdent' : 'indent')
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSubmit()
    } else if (e.key === 'Escape') {
      // Leave the board open: Escape here only puts the pen down.
      e.stopPropagation()
      page.current?.blur()
    }
  }

  return (
    <div className={`richpad ${empty ? 'empty' : ''}`}>
      <div className="richpad-tools" role="toolbar" aria-label="Formatting">
        {TOOLS.map((t) => (
          // Mouse down is cancelled so the selection in the note is not lost to the button.
          <button key={t.command} type="button" className={active[t.command] ? 'on' : ''} aria-label={t.label} title={t.label} aria-pressed={!!active[t.command]} onMouseDown={(e) => e.preventDefault()} onClick={() => run(t.command)}>
            {t.face}
          </button>
        ))}
      </div>
      {options.length > 0 && (
        <ul className="mention-list" role="listbox" aria-label="People to mention">
          {options.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === at} className={i === at ? 'on' : ''} onMouseDown={(e) => (e.preventDefault(), choose(p))}>
              {p.name}
            </li>
          ))}
        </ul>
      )}
      <div
        ref={page}
        className="richpad-page rich"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        data-gramm="false"
        spellCheck
        onInput={() => (read(), look())}
        onKeyUp={look}
        onMouseUp={look}
        onBlur={() => setDraft(null)}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          // Pasted text comes in plain, so nothing foreign ends up in a note.
          e.preventDefault()
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
        }}
      />
    </div>
  )
}

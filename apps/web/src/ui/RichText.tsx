import type { ReactNode } from 'react'
import { parseRich, type Span } from '@guildhouse/shared'
import { Rich } from './Mention'

function piece(span: Span, key: number): ReactNode {
  let el: ReactNode = <Rich text={span.text} />
  if (span.bold) el = <b>{el}</b>
  if (span.italic) el = <i>{el}</i>
  if (span.underline) el = <u>{el}</u>
  if (span.strike) el = <s>{el}</s>
  return <span key={key}>{el}</span>
}

// Formatted text as it was written: bold, italic, underline, strike, lists and indents, with any
// @mentions picked out. It is drawn from the stored marks, never from HTML.
export function RichText({ text }: { text: string }) {
  return (
    <div className="rich">
      {parseRich(text).map((block, i) => (
        <div key={i} className={block.list ? 'rich-item' : undefined} style={block.indent ? { marginLeft: block.indent * 14 } : undefined}>
          {block.list && <em>{block.list === 'bullet' ? '•' : `${block.n}.`}</em>}
          <div>{block.spans.length ? block.spans.map(piece) : ' '}</div>
        </div>
      ))}
    </div>
  )
}

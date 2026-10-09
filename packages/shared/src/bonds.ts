// A bond is what two people have done together here: time in the same call, time in the same focus
// session, and messages and mentions between them. Nobody declares one; it grows by itself.
// Being friends is the part people choose: one asks, the other accepts.
export interface Bond {
  callSeconds: number
  focusSeconds: number
  messages: number
  friends: boolean
  // Who asked to be friends, while the other has yet to answer; otherwise ''.
  askedBy: string
}

export const NEW_BOND: Bond = { callSeconds: 0, focusSeconds: 0, messages: 0, friends: false, askedBy: '' }

// A bond as one person sees it: who it is with.
export interface BondWith extends Bond {
  id: string
  name: string
}

// A point for each minute in a call together, each two minutes focusing together, and each message.
export const bondPoints = (b: Pick<Bond, 'callSeconds' | 'focusSeconds' | 'messages'>) => Math.floor(b.callSeconds / 60) + Math.floor(b.focusSeconds / 120) + b.messages

const TIERS: [number, string][] = [
  [0, 'Passing faces'],
  [5, 'Acquaintances'],
  [40, 'Companions'],
  [150, 'Trusted allies'],
  [500, 'Sworn friends'],
]

// The name of a bond, how far it is into its tier, and what the next tier asks for (0 at the top).
export function bondTier(points: number): { name: string; into: number; span: number } {
  let i = 0
  while (i + 1 < TIERS.length && points >= TIERS[i + 1][0]) i++
  const next = TIERS[i + 1]?.[0] ?? 0
  return { name: TIERS[i][1], into: points - TIERS[i][0], span: next ? next - TIERS[i][0] : 0 }
}

// One key for a pair, whichever way round they are given.
export const pairKey = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`)

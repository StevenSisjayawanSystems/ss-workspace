// The bulletin board has two faces. The feature board sorts sticky notes into lanes, so it is plain
// what to build and what to take out; the free board is for anything at all.
export const BOARDS = [
  { id: 'features', name: 'Roadmap' },
  { id: 'fun', name: 'For the gags' },
] as const
export type BoardId = (typeof BOARDS)[number]['id']
export const isBoard = (v: unknown): v is BoardId => BOARDS.some((b) => b.id === v)

export const LANES = [
  { id: 'build', name: 'To build' },
  { id: 'doing', name: 'Building' },
  { id: 'done', name: 'Shipped' },
  { id: 'remove', name: 'To remove' },
] as const
export type Lane = (typeof LANES)[number]

export const NOTE_COLORS = ['#e9d18a', '#e8a48f', '#9fd0c4', '#b9a8e0', '#a9c98f']
// Per board. Past this, the oldest note comes down to make room.
export const MAX_NOTES = 60
export const MAX_NOTE_LENGTH = 600
export const MAX_COMMENTS = 40
export const MAX_COMMENT_LENGTH = 240

// A note sits at (x, y), each a fraction of the board from its top left corner to the note's centre.
export const onBoard = (v: unknown, fallback = 0.5) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(0.97, Math.max(0.03, v)) : fallback)

// On the feature board, the lane is simply the column the note was dropped in.
export const laneAt = (x: number): Lane => LANES[Math.min(LANES.length - 1, Math.max(0, Math.floor(x * LANES.length)))]

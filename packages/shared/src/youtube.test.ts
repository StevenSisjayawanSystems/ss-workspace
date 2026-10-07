import { describe, expect, it } from 'vitest'
import { parseYouTubeId } from './youtube'

describe('parseYouTubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=jfKfPfyJRdk', 'jfKfPfyJRdk'],
    ['https://youtu.be/jfKfPfyJRdk?t=30', 'jfKfPfyJRdk'],
    ['youtube.com/watch?list=PL123&v=jfKfPfyJRdk', 'jfKfPfyJRdk'],
    ['https://music.youtube.com/watch?v=jfKfPfyJRdk&feature=share', 'jfKfPfyJRdk'],
    ['https://m.youtube.com/shorts/jfKfPfyJRdk', 'jfKfPfyJRdk'],
    ['https://www.youtube.com/embed/jfKfPfyJRdk', 'jfKfPfyJRdk'],
    ['https://www.youtube.com/live/jfKfPfyJRdk', 'jfKfPfyJRdk'],
    ['  jfKfPfyJRdk ', 'jfKfPfyJRdk'],
  ])('%s', (url, id) => expect(parseYouTubeId(url)).toBe(id))

  it.each(['', 'hello', 'https://vimeo.com/12345678901', 'https://youtube.com/watch?v=short', 'https://evil.com/watch?v=jfKfPfyJRdk'])(
    'rejects %s',
    (url) => expect(parseYouTubeId(url)).toBeNull(),
  )
})

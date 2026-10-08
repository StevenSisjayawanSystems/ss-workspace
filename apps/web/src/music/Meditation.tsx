import { useEffect, useRef, useState } from 'react'
import { useGame } from '../game'
import { Icon } from '../ui/icons'
import { loadApi } from './Jukebox'

// The guided session that plays in the Meditation Grove.
const VIDEO_ID = 'inpok4MKVLM'
const TITLE = '5-Minute Meditation'
const PLAYING = 1
const BUFFERING = 3
const ENDED = 0

interface Guide {
  loadVideoById(o: { videoId: string; startSeconds: number }): void
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getPlayerState(): number
  getCurrentTime(): number
  getDuration(): number
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// Walking into the grove starts the guided meditation, for you alone; walking out stops it.
// Each visit begins from the start. The jukebox is silenced for you while you are in here.
export function Meditation() {
  const inside = useGame((s) => s.zone === 'meditation')
  const holder = useRef<HTMLDivElement>(null)
  const guide = useRef<Guide | null>(null)
  const [ready, setReady] = useState(false)
  const [state, setState] = useState(-1)
  const [paused, setPaused] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [time, setTime] = useState({ at: 0, of: 0 })

  // The player is built on the first visit and kept, so later visits start instantly.
  useEffect(() => {
    if (!inside || guide.current) return
    let cancelled = false
    void loadApi().then(() => {
      if (cancelled || guide.current || !holder.current) return
      const el = document.createElement('div')
      holder.current.appendChild(el)
      guide.current = new window.YT!.Player(el, {
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => setReady(true),
          onStateChange: (e: { data: number }) => setState(e.data),
        },
      }) as unknown as Guide
    })
    return () => {
      cancelled = true
    }
  }, [inside])

  // Enter: begin from the top. Leave: stop.
  useEffect(() => {
    if (!ready) return
    const g = guide.current!
    if (inside) {
      setPaused(false)
      setBlocked(false)
      g.loadVideoById({ videoId: VIDEO_ID, startSeconds: 0 })
      // Browsers can refuse to start sound without a tap; if it has not begun shortly, ask for one.
      const check = setTimeout(() => {
        const s = g.getPlayerState()
        if (s !== PLAYING && s !== BUFFERING) setBlocked(true)
      }, 3500)
      return () => {
        clearTimeout(check)
        g.pauseVideo()
      }
    }
  }, [ready, inside])

  useEffect(() => {
    if (state === PLAYING) setBlocked(false)
  }, [state])

  useEffect(() => {
    if (!ready || !inside) return
    const t = setInterval(() => setTime({ at: guide.current!.getCurrentTime() || 0, of: guide.current!.getDuration() || 0 }), 1000)
    return () => clearInterval(t)
  }, [ready, inside])

  const toggle = () => {
    const g = guide.current
    if (!g) return
    if (state === ENDED) {
      g.seekTo(0, true)
      g.playVideo()
      setPaused(false)
    } else if (paused) {
      g.playVideo()
      setPaused(false)
    } else {
      g.pauseVideo()
      setPaused(true)
    }
    setBlocked(false)
  }
  const restart = () => {
    guide.current?.seekTo(0, true)
    guide.current?.playVideo()
    setPaused(false)
    setBlocked(false)
  }

  const ended = state === ENDED
  return (
    // Hidden rather than unmounted outside the grove, so the player is kept between visits.
    <div className="meditation" hidden={!inside}>
      <div className="meditation-video" ref={holder} />
      <div className="meditation-text">
        <b>{TITLE}</b>
        <span>{ended ? 'Session complete' : blocked ? 'Tap play to begin' : !ready ? 'Preparing…' : `${clock(time.at)}${time.of ? ` / ${clock(time.of)}` : ''} · just for you`}</span>
      </div>
      <button className={`icon-btn ${blocked || paused || ended ? 'on' : ''}`} aria-label={paused || blocked || ended ? 'Play' : 'Pause'} title={paused || blocked || ended ? 'Play' : 'Pause'} onClick={blocked ? restart : toggle}>
        {paused || blocked || ended ? <Icon.play /> : <Icon.pause />}
      </button>
      <button className="icon-btn" aria-label="Start again" title="Start again" onClick={restart}>
        <Icon.restart />
      </button>
    </div>
  )
}

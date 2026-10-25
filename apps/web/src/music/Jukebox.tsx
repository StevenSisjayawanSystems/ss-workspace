import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useGame } from '../game'
import { jukebox, serverNow, useNet } from '../net/net'
import { Company } from '../ui/Company'
import { Icon } from '../ui/icons'

// Minimal surface of the YouTube IFrame Player API that we use.
interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds: number }): void
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  setVolume(v: number): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: object) => YTPlayer }
    onYouTubeIframeAPIReady?: () => void
  }
}

const PLAYING = 1
const BUFFERING = 3
const ENDED = 0
const DRIFT_SECONDS = 1.2

let api: Promise<void> | undefined
export function loadApi() {
  api ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve()
    window.onYouTubeIframeAPIReady = () => resolve()
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  })
  return api
}

const VOLUME_KEY = 'guildhouse.volume'
const MUTE_KEY = 'guildhouse.musicMuted'
const savedVolume = () => {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY))
    return Number.isFinite(v) && localStorage.getItem(VOLUME_KEY) !== null ? Math.min(100, Math.max(0, v)) : 60
  } catch {
    return 60
  }
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// Music the house keeps to hand: one press puts it in your queue. Add more here.
const PICKS = [{ videoId: 'jzAxOE3Fufk', title: 'Jazzy lo-fi beats for study and focus' }]

// Your music. It plays for you alone until someone tunes in; then everyone listening shares the queue.
export function Jukebox() {
  const juke = useNet((s) => s.juke)
  const stations = useNet((s) => s.stations)
  const error = useNet((s) => s.jukeError)
  const online = useNet((s) => s.status === 'online')
  // The meditation grove plays its own guide, so the jukebox falls silent for whoever is in there.
  const meditating = useGame((s) => s.zone === 'meditation')
  const open = useGame((s) => s.jukeOpen)
  const setOpen = useGame((s) => s.setJukeOpen)
  const [volume, setVolume] = useState(savedVolume)
  // Silences the music without leaving it; anyone listening along keeps hearing it.
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [url, setUrl] = useState('')
  const [ready, setReady] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const holder = useRef<HTMLDivElement>(null)
  const yt = useRef<YTPlayer | null>(null)
  const loaded = useRef<string | null>(null)
  const stalledSince = useRef(0)
  const jukeRef = useRef(juke)
  jukeRef.current = juke
  const current = juke.queue[0]
  const alone = juke.members.length < 2

  // Build the player the first time there is something to play.
  const wanted = !!current
  useEffect(() => {
    if (!wanted || yt.current) return
    let cancelled = false
    loadApi().then(() => {
      if (cancelled || yt.current || !holder.current) return
      const el = document.createElement('div')
      holder.current.appendChild(el)
      yt.current = new window.YT!.Player(el, {
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => setReady(true),
          onStateChange: (e: { data: number }) => {
            const cur = jukeRef.current.queue[0]
            if (e.data === ENDED && cur && loaded.current === cur.id) jukebox.ended(cur.id)
            if (e.data === PLAYING) setBlocked(false)
          },
          onError: () => {
            const cur = jukeRef.current.queue[0]
            if (cur && loaded.current === cur.id) jukebox.ended(cur.id)
          },
        },
      })
    })
    return () => {
      cancelled = true
    }
  }, [wanted])

  // Keep the local player on the server's clock: on every change, and on a timer to correct drift.
  useEffect(() => {
    if (!ready) return
    const sync = () => {
      const p = yt.current
      const j = jukeRef.current
      const cur = j.queue[0]
      if (!p) return
      if (!cur) {
        if (loaded.current) p.stopVideo()
        loaded.current = null
        setElapsed(0)
        return
      }
      const expected = Math.max(0, j.paused ? j.pausedAt : (serverNow() - j.startedAt) / 1000)
      setElapsed(expected)
      if (loaded.current !== cur.id) {
        loaded.current = cur.id
        stalledSince.current = Date.now()
        p.loadVideoById({ videoId: cur.videoId, startSeconds: expected })
        return
      }
      const state = p.getPlayerState()
      const duration = p.getDuration()
      if (duration > 0 && !cur.duration) jukebox.duration(cur.id, duration)
      if (j.paused) {
        if (state === PLAYING || state === BUFFERING) p.pauseVideo()
        return
      }
      if (state === PLAYING) {
        stalledSince.current = Date.now()
        if (duration > 0 && Math.abs(p.getCurrentTime() - expected) > DRIFT_SECONDS) p.seekTo(expected, true)
      } else if (state !== BUFFERING) {
        p.playVideo()
        // Browsers refuse to start sound without a tap; if it will not start, ask for one.
        if (Date.now() - stalledSince.current > 3000) setBlocked(true)
      }
    }
    sync()
    const t = setInterval(sync, 1000)
    return () => clearInterval(t)
  }, [ready, juke])

  useEffect(() => {
    if (ready) yt.current?.setVolume(muted || meditating ? 0 : volume)
    try {
      localStorage.setItem(VOLUME_KEY, String(volume))
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      // Volume simply will not be remembered.
    }
  }, [ready, volume, muted, meditating])

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (url.trim()) jukebox.add(url.trim())
    setUrl('')
  }

  const tuneIn = () => {
    yt.current?.playVideo()
    stalledSince.current = Date.now()
    setBlocked(false)
  }

  // Hidden rather than unmounted while offline, so the embedded player survives a reconnect.
  return (
    <div className={`jukebox ${open ? 'open' : ''}`} hidden={!online}>
      <div className="juke-head">
        <button
          className="icon-btn on"
          aria-expanded={open}
          aria-controls="jukebox-panel"
          aria-label={open ? 'Close jukebox' : 'Open jukebox'}
          title={open ? 'Close jukebox' : 'Open jukebox'}
          onClick={() => setOpen(!open)}
        >
          <Icon.note />
        </button>
        <div className="juke-now">
          <div className="juke-title">{current ? current.title : 'Nothing playing'}</div>
          <div className="juke-sub">
            {current ? `${clock(elapsed)}${current.duration ? ` / ${clock(current.duration)}` : ''} · added by ${current.addedBy}` : stations.length ? 'Play your own, or tune in to someone' : 'Add a YouTube link to play your own'}
          </div>
        </div>
        <button className={`icon-btn ${muted ? 'danger' : ''}`} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}>
          {muted ? <Icon.volumeOff /> : <Icon.volume />}
        </button>
        {current && (
          <>
            <button className="icon-btn" aria-label={juke.paused ? 'Play' : 'Pause'} title={juke.paused ? 'Play' : 'Pause'} onClick={() => (juke.paused ? jukebox.play() : jukebox.pause())}>
              {juke.paused ? <Icon.play /> : <Icon.pause />}
            </button>
            <button className="icon-btn" aria-label="Skip" title="Skip" onClick={() => jukebox.skip()}>
              <Icon.skip />
            </button>
          </>
        )}
        {juke.id && (
          <button className="icon-btn danger" aria-label={alone ? 'Stop the music' : 'Stop listening'} title={alone ? 'Stop the music' : 'Stop listening. It carries on for the others'} onClick={() => jukebox.leave()}>
            {alone ? <Icon.stop /> : <Icon.leave />}
          </button>
        )}
      </div>
      {blocked && current && !juke.paused && (
        <button className="primary juke-tune" onClick={tuneIn}>
          Tap to tune in
        </button>
      )}
      {/* The player stays mounted while collapsed so the music keeps going. */}
      <div className="juke-video" ref={holder} style={{ display: current ? undefined : 'none' }} />
      <div className="juke-body" id="jukebox-panel">
        <form onSubmit={add}>
          <input value={url} placeholder="Paste a YouTube link" onChange={(e) => setUrl(e.target.value)} />
          <button className="icon-btn" aria-label="Add to queue" title="Add to queue">
            <Icon.plus />
          </button>
        </form>
        {error && <div className="juke-error">{error}</div>}
        {juke.id && <Company members={juke.members} open={juke.open} onOpen={jukebox.open} onBring={jukebox.bring} />}
        {stations.length > 0 && (
          <div className="juke-picks">
            <span>Tune in</span>
            {stations.map((st) => (
              <button key={st.id} title={`Listen along with ${st.host}`} onClick={() => jukebox.join(st.id)}>
                <Icon.people />
                <b>
                  {st.host} · {st.queue[0].title}
                </b>
                <i>Join</i>
              </button>
            ))}
          </div>
        )}
        <div className="juke-picks">
          <span>House picks</span>
          {PICKS.map((pick) => {
            const queued = juke.queue.some((t) => t.videoId === pick.videoId)
            return (
              <button key={pick.videoId} disabled={queued} title={queued ? 'Already in the queue' : 'Add to the queue'} onClick={() => jukebox.add(`https://www.youtube.com/watch?v=${pick.videoId}`)}>
                <Icon.note />
                <b>{pick.title}</b>
                {queued ? <i>Queued</i> : <Icon.plus />}
              </button>
            )
          })}
        </div>
        <label className="juke-volume">
          <span>{muted ? 'Muted' : 'Volume'}</span>
          <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
        </label>
        {juke.queue.length > 1 && (
          <ol className="juke-queue">
            {juke.queue.slice(1).map((t) => (
              <li key={t.id}>
                <span>
                  {t.title} <i>· {t.addedBy}</i>
                </span>
                <button className="icon-btn small" aria-label={`Remove ${t.title}`} title="Remove" onClick={() => jukebox.remove(t.id)}>
                  <Icon.close />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

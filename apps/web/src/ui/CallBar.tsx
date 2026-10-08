import { useEffect, useRef, type ReactNode } from 'react'
import { QUIET_ZONES, roomById, seatById } from '@guildhouse/shared'
import { useGame } from '../game'
import { remotes, standUp, useNet } from '../net/net'
import { levels, startVoice, toggleBlur, toggleCam, toggleMic, useVoice } from '../voice/voice'
import { Chat } from './Chat'
import { Icon } from './icons'

function Stream({ stream, video, muted }: { stream: MediaStream | null; video: boolean; muted?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null)
  const vid = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (audio.current) audio.current.srcObject = stream
    if (vid.current) vid.current.srcObject = stream
  }, [stream, video])
  return (
    <>
      {!muted && <audio ref={audio} autoPlay />}
      {video && <video ref={vid} autoPlay playsInline muted />}
    </>
  )
}

const SPEAKING = 0.08

function Tile({ id, name, stream, cam, mic, self, waiting }: { id: string; name: string; stream: MediaStream | null; cam: boolean; mic: boolean; self?: boolean; waiting?: boolean }) {
  const el = useRef<HTMLDivElement>(null)
  // The ring around a tile follows that person's voice, frame by frame, without re-rendering React.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const level = levels[id] ?? 0
      el.current?.classList.toggle('speaking', level > SPEAKING)
      el.current?.style.setProperty('--level', level.toFixed(2))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [id])
  return (
    <div ref={el} className={`call-tile ${cam ? 'video' : ''}`}>
      <Stream stream={stream} video={cam} muted={self} />
      {!cam && <div className="call-initial">{name.slice(0, 1).toUpperCase()}</div>}
      <div className="call-name">
        <span>{name}</span>
        {waiting ? <i>connecting</i> : !mic && <Icon.micOff />}
      </div>
    </div>
  )
}

const Btn = ({ label, on, danger, onClick, children }: { label: string; on?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) => (
  <button className={`icon-btn ${on ? 'on' : ''} ${danger ? 'danger' : ''}`} aria-label={label} title={label} onClick={onClick}>
    {children}
  </button>
)

// The voice channel for the room you are seated in. Focus mode fills the screen with the call and the chat.
export function CallBar() {
  const seatId = useGame((s) => s.seat)
  const profile = useGame((s) => s.profile)
  const call = useNet((s) => s.call)
  const inCall = useNet((s) => s.inCall)
  const { mic, cam, micError, camError, local, peers, focus, blur, blurBusy } = useVoice()
  useEffect(startVoice, [])
  useEffect(() => {
    if (!focus) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target instanceof HTMLInputElement) && useVoice.setState({ focus: false })
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [focus])

  const seat = seatById(seatId ?? '')
  if (!seat) return null
  const room = roomById(seat.zone).name
  if (QUIET_ZONES.includes(seat.zone))
    return (
      <div className="call quiet">
        <div className="call-title">{room} · quiet room</div>
        <Btn label="Stand up" onClick={standUp}>
          <Icon.leave />
        </Btn>
      </div>
    )
  if (!inCall) return null
  const micLive = mic && !micError
  return (
    <div className={`call ${focus ? 'focus' : ''}`}>
      <div className="call-title">
        {room}
        <span>{call.length ? `${call.length + 1} in call` : 'Just you so far'}</span>
      </div>
      <div className="call-stage">
        <div className="call-tiles" data-count={call.length + 1}>
          <Tile id="self" name={profile?.name ?? 'You'} stream={local} cam={cam} mic={micLive} self />
          {call.map((id) => {
            const p = peers[id]
            return <Tile key={id} id={id} name={remotes.get(id)?.name ?? 'Guest'} stream={p?.stream ?? null} cam={!!p?.cam} mic={p?.mic ?? true} waiting={!p?.connected} />
          })}
        </div>
        {focus && <Chat docked />}
      </div>
      {(micError || camError) && <div className="call-error">{[micError, camError].filter(Boolean).join(' · ')}</div>}
      <div className="call-actions">
        <Btn label={micLive ? 'Mute microphone' : 'Unmute microphone'} danger={!micLive} onClick={() => void toggleMic()}>
          {micLive ? <Icon.mic /> : <Icon.micOff />}
        </Btn>
        <Btn label={cam ? 'Turn camera off' : 'Turn camera on'} on={cam} onClick={() => void toggleCam()}>
          {cam ? <Icon.cam /> : <Icon.camOff />}
        </Btn>
        <Btn label={blurBusy ? 'Preparing background blur' : blur ? 'Stop blurring my background' : 'Blur my background'} on={blur} onClick={() => void toggleBlur()}>
          <Icon.blur />
        </Btn>
        <Btn label={focus ? 'Back to the office' : 'Focus on the call'} on={focus} onClick={() => useVoice.setState({ focus: !focus })}>
          {focus ? <Icon.shrink /> : <Icon.expand />}
        </Btn>
        <Btn label="Leave call" danger onClick={standUp}>
          <Icon.leave />
        </Btn>
      </div>
    </div>
  )
}

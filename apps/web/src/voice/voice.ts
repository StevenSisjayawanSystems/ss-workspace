import { create } from 'zustand'
import { onRtc, sendRtc, useNet } from '../net/net'

// Room calls are a direct mesh: one WebRTC connection to each other person seated in the room.
// That needs no media server and suits a handful of people; the game server only relays the handshake.

export interface PeerView {
  stream: MediaStream
  mic: boolean
  cam: boolean
  connected: boolean
}

interface VoiceState {
  mic: boolean
  cam: boolean
  // Why we have no microphone or camera, if we asked and were refused.
  micError: string | null
  camError: string | null
  local: MediaStream | null
  peers: Record<string, PeerView>
  // Full-screen view of the call with the chat alongside.
  focus: boolean
}

export const useVoice = create<VoiceState>(() => ({ mic: true, cam: false, micError: null, camError: null, local: null, peers: {}, focus: false }))

// How loudly each person is speaking right now, 0 to 1, keyed by session id ('self' for us).
// Kept outside React: tiles read it every frame.
export const levels: Record<string, number> = {}

let audioCtx: AudioContext | null = null
const meters = new Map<string, { track: MediaStreamTrack; source: MediaStreamAudioSourceNode; analyser: AnalyserNode }>()
let meterTimer: ReturnType<typeof setInterval> | undefined
const samples = new Float32Array(512)

function sampleLevels() {
  for (const [id, m] of meters) {
    m.analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
    const now = m.track.enabled ? Math.min(1, Math.sqrt(sum / samples.length) * 7) : 0
    // Rise at once, fall away gently, so the ring does not flicker between syllables.
    levels[id] = Math.max(now, (levels[id] ?? 0) * 0.82)
  }
}

function meter(id: string, stream: MediaStream | null) {
  const track = stream?.getAudioTracks()[0]
  const existing = meters.get(id)
  if (existing?.track === track) return
  existing?.source.disconnect()
  meters.delete(id)
  delete levels[id]
  if (!track) return
  try {
    audioCtx ??= new AudioContext()
    void audioCtx.resume()
    const source = audioCtx.createMediaStreamSource(new MediaStream([track]))
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    meters.set(id, { track, source, analyser })
    meterTimer ??= setInterval(sampleLevels, 50)
  } catch {
    // No audio analysis available: calls still work, just without the speaking ring.
  }
}

// Swappable so tests can feed synthetic audio and video.
export const media = {
  getUserMedia: (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c),
}

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

interface Peer {
  pc: RTCPeerConnection
  stream: MediaStream
  queued: RTCIceCandidateInit[]
}
const peers = new Map<string, Peer>()
let audioTrack: MediaStreamTrack | null = null
let videoTrack: MediaStreamTrack | null = null
let ready: Promise<void> | null = null

const describe = (e: unknown) => (e instanceof DOMException && e.name === 'NotAllowedError' ? 'blocked in the browser' : 'not available')

function publishLocal() {
  const tracks = [audioTrack, videoTrack].filter((t): t is MediaStreamTrack => !!t)
  const local = tracks.length ? new MediaStream(tracks) : null
  meter('self', local)
  useVoice.setState({ local })
}

function view(id: string, patch: Partial<PeerView>) {
  const peer = peers.get(id)
  if (!peer) return
  useVoice.setState((s) => ({
    peers: { ...s.peers, [id]: { mic: true, cam: false, connected: false, ...(s.peers[id] as PeerView | undefined), ...patch, stream: peer.stream } },
  }))
}

const tellState = (id: string) => sendRtc(id, { state: { mic: useVoice.getState().mic && !!audioTrack, cam: !!videoTrack } })
const tellEveryone = () => peers.forEach((_, id) => tellState(id))

// Puts our current microphone and camera on every sending slot of a connection.
function attachLocal(pc: RTCPeerConnection) {
  for (const t of pc.getTransceivers()) {
    t.direction = 'sendrecv'
    void t.sender.replaceTrack(t.receiver.track.kind === 'audio' ? audioTrack : videoTrack)
  }
}

function createPeer(id: string): Peer {
  const pc = new RTCPeerConnection({ iceServers: ICE })
  const peer: Peer = { pc, stream: new MediaStream(), queued: [] }
  peers.set(id, peer)
  pc.onicecandidate = (e) => e.candidate && sendRtc(id, { candidate: e.candidate.toJSON() })
  pc.ontrack = (e) => {
    peer.stream.addTrack(e.track)
    meter(id, peer.stream)
    view(id, {})
  }
  pc.onconnectionstatechange = () => {
    view(id, { connected: pc.connectionState === 'connected' })
    if (pc.connectionState === 'connected') tellState(id)
  }
  view(id, {})
  return peer
}

function closePeer(id: string) {
  peers.get(id)?.pc.close()
  peers.delete(id)
  meter(id, null)
  useVoice.setState((s) => {
    const { [id]: _, ...rest } = s.peers
    return { peers: rest }
  })
}

async function offer(id: string) {
  const { pc } = createPeer(id)
  // Both slots exist from the start, so switching the camera on later needs no renegotiation.
  pc.addTransceiver('audio', { direction: 'sendrecv' })
  pc.addTransceiver('video', { direction: 'sendrecv' })
  attachLocal(pc)
  await pc.setLocalDescription(await pc.createOffer())
  sendRtc(id, { sdp: pc.localDescription })
}

async function handle(from: string, data: any) {
  if (!ready || !data) return
  await ready
  if (!useNet.getState().call.includes(from)) return
  if (data.state) return view(from, { mic: !!data.state.mic, cam: !!data.state.cam })
  if (data.sdp?.type === 'offer') {
    closePeer(from)
    const peer = createPeer(from)
    await peer.pc.setRemoteDescription(data.sdp)
    attachLocal(peer.pc)
    await peer.pc.setLocalDescription(await peer.pc.createAnswer())
    sendRtc(from, { sdp: peer.pc.localDescription })
    for (const c of peer.queued.splice(0)) await peer.pc.addIceCandidate(c)
    return
  }
  const peer = peers.get(from)
  if (!peer) return
  if (data.sdp?.type === 'answer') {
    await peer.pc.setRemoteDescription(data.sdp)
    for (const c of peer.queued.splice(0)) await peer.pc.addIceCandidate(c)
  } else if (data.candidate) {
    if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate)
    else peer.queued.push(data.candidate)
  }
}

async function openMic() {
  try {
    const stream = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    audioTrack = stream.getAudioTracks()[0] ?? null
    if (audioTrack) audioTrack.enabled = useVoice.getState().mic
    useVoice.setState({ micError: null })
  } catch (e) {
    // Without a microphone you can still sit in and listen.
    audioTrack = null
    useVoice.setState({ micError: `Microphone ${describe(e)}` })
  }
  publishLocal()
}

function leave() {
  ready = null
  for (const id of [...peers.keys()]) closePeer(id)
  audioTrack?.stop()
  videoTrack?.stop()
  audioTrack = videoTrack = null
  meter('self', null)
  useVoice.setState({ focus: false, cam: false, local: null, peers: {}, micError: null, camError: null })
}

// Of each pair, the one with the smaller id calls the other, so the two never call at once.
function reconcile() {
  const { inCall, call, selfId } = useNet.getState()
  if (!inCall || !selfId) {
    if (ready) leave()
    return
  }
  ready ??= openMic()
  void ready.then(() => {
    const now = useNet.getState()
    if (!now.inCall) return
    for (const id of [...peers.keys()]) if (!now.call.includes(id)) closePeer(id)
    for (const id of now.call) if (!peers.has(id) && selfId < id) void offer(id)
  })
}

export async function toggleMic() {
  if (!ready) return
  const mic = !useVoice.getState().mic
  useVoice.setState({ mic })
  if (mic && !audioTrack) {
    await openMic()
    peers.forEach((p) => attachLocal(p.pc))
  }
  if (audioTrack) audioTrack.enabled = mic
  tellEveryone()
}

export async function toggleCam() {
  if (!ready) return
  if (videoTrack) {
    videoTrack.stop()
    videoTrack = null
  } else {
    try {
      const stream = await media.getUserMedia({ video: { width: 640, height: 360, facingMode: 'user' } })
      videoTrack = stream.getVideoTracks()[0] ?? null
      useVoice.setState({ camError: null })
    } catch (e) {
      useVoice.setState({ camError: `Camera ${describe(e)}` })
    }
  }
  useVoice.setState({ cam: !!videoTrack })
  publishLocal()
  peers.forEach((p) => attachLocal(p.pc))
  tellEveryone()
}

let started = false
export function startVoice() {
  if (started) return
  started = true
  onRtc((from, data) => void handle(from, data).catch((e) => console.warn('call signalling failed', e)))
  useNet.subscribe((s, prev) => {
    if (s.inCall !== prev.inCall || s.call !== prev.call || s.selfId !== prev.selfId) reconcile()
  })
  reconcile()
}

if (import.meta.env.DEV) Object.assign((window as any).__game, { voice: { useVoice, media, peers, levels, toggleMic, toggleCam } })

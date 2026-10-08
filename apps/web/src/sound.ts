// Small synthesised sounds, so there are no audio files to ship or license.
let ctx: AudioContext | null = null

function tone(freq: number, at: number, length: number, volume = 0.1) {
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const t = ctx.currentTime + at
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(volume, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + length + 0.05)
  } catch {
    // Sound is a nicety; silence is fine if the browser refuses.
  }
}

// A rising three-note bell for the end of a focus session, falling for the end of a break.
export function bell(rising: boolean) {
  const notes = rising ? [523, 659, 784] : [784, 659, 523]
  notes.forEach((f, i) => tone(f, i * 0.22, 1.1))
}

// Three knuckle raps on a door.
export function knockSound() {
  ;[0, 0.16, 0.32].forEach((at) => tone(170, at, 0.12, 0.22))
}

let ringTimer: ReturnType<typeof setInterval> | undefined
const ringOnce = () => {
  tone(880, 0, 0.35, 0.09)
  tone(1109, 0.18, 0.5, 0.09)
}
export const ringtone = {
  start() {
    ringtone.stop()
    ringOnce()
    ringTimer = setInterval(ringOnce, 1800)
  },
  stop() {
    clearInterval(ringTimer)
    ringTimer = undefined
  },
}

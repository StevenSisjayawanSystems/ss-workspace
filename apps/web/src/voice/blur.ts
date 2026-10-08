// Background blur for the camera. Each frame is split into person and background by a small
// on-device segmentation model (MediaPipe selfie segmenter); the background is blurred and the
// person drawn back on top. Nothing leaves the browser: the model and its runtime are served
// with the app, and are only downloaded the first time blur is switched on.
import type { ImageSegmenter } from '@mediapipe/tasks-vision'

const MODEL_URL = '/models/selfie_segmenter.tflite'
// Copied into public/ by scripts/copy-mediapipe.mjs before every dev run and build.
const RUNTIME = { wasmLoaderPath: '/mediapipe/vision_wasm_internal.js', wasmBinaryPath: '/mediapipe/vision_wasm_internal.wasm' }
// The background is blurred by shrinking it and scaling it back up, which works in every browser.
const BLUR_SHRINK = 10
const FPS = 24

let segmenter: Promise<ImageSegmenter> | undefined
function loadSegmenter() {
  segmenter ??= (async () => {
    const { ImageSegmenter } = await import('@mediapipe/tasks-vision')
    const create = (delegate: 'GPU' | 'CPU') =>
      ImageSegmenter.createFromOptions(
        RUNTIME,
        { baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true },
      )
    try {
      return await create('GPU')
    } catch {
      return await create('CPU')
    }
  })()
  // A failed load should be retried next time, not remembered.
  segmenter.catch(() => (segmenter = undefined))
  return segmenter
}

export interface Blurred {
  track: MediaStreamTrack
  stop: () => void
}

// Wraps a camera track. The returned track carries the same picture with the background blurred.
export async function blurBackground(source: MediaStreamTrack): Promise<Blurred> {
  const seg = await loadSegmenter()

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = new MediaStream([source])
  await video.play()
  const width = video.videoWidth || 640
  const height = video.videoHeight || 360

  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')!
  const canFilter = 'filter' in ctx
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.round(width / BLUR_SHRINK))
  small.height = Math.max(1, Math.round(height / BLUR_SHRINK))
  const smallCtx = small.getContext('2d')!
  const maskCanvas = document.createElement('canvas')
  const maskCtx = maskCanvas.getContext('2d')!
  let maskPixels: ImageData | null = null

  // Until the first mask arrives the whole frame is blurred, so the room is never shown sharp.
  const drawBackground = () => {
    smallCtx.drawImage(video, 0, 0, small.width, small.height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    // Where the browser supports canvas filters, a light blur on top hides the blockiness of the upscale.
    if (canFilter) ctx.filter = 'blur(5px)'
    ctx.drawImage(small, 0, 0, width, height)
    if (canFilter) ctx.filter = 'none'
  }

  const render = () => {
    if (video.readyState < 2) return
    let personMask: Float32Array | null = null
    let mw = 0
    let mh = 0
    try {
      seg.segmentForVideo(video, performance.now(), (result) => {
        // The selfie model returns one mask: how strongly each pixel belongs to the person.
        const mask = result.confidenceMasks?.[result.confidenceMasks.length - 1]
        if (!mask) return
        mw = mask.width
        mh = mask.height
        personMask = mask.getAsFloat32Array()
      })
    } catch {
      personMask = null
    }
    const mask = personMask as Float32Array | null
    if (!mask) {
      ctx.globalCompositeOperation = 'source-over'
      drawBackground()
      return
    }
    if (!maskPixels || maskPixels.width !== mw || maskPixels.height !== mh) {
      maskCanvas.width = mw
      maskCanvas.height = mh
      maskPixels = maskCtx.createImageData(mw, mh)
    }
    const px = maskPixels.data
    for (let i = 0; i < mask.length; i++) {
      // Steepen the edge a little so hair and shoulders do not go see-through.
      const a = Math.min(1, Math.max(0, (mask[i] - 0.35) / 0.3))
      px[i * 4 + 3] = a * 255
    }
    maskCtx.putImageData(maskPixels, 0, 0)

    // Person cut-out first (the low-resolution mask is smoothed as it is scaled up, which feathers the edge),
    // then the blurred frame slipped in behind it.
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(maskCanvas, 0, 0, width, height)
    ctx.globalCompositeOperation = 'source-in'
    ctx.drawImage(video, 0, 0, width, height)
    ctx.globalCompositeOperation = 'destination-over'
    drawBackground()
    ctx.globalCompositeOperation = 'source-over'
  }

  render()
  const timer = setInterval(render, 1000 / FPS)
  const track = out.captureStream(FPS).getVideoTracks()[0]
  return {
    track,
    stop: () => {
      clearInterval(timer)
      track.stop()
      video.srcObject = null
    },
  }
}

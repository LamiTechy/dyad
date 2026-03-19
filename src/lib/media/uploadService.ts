// =============================================================================
// lib/media/uploadService.ts — Encrypted media upload to Supabase Storage
// =============================================================================

import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { encryptFile, deriveSharedKey } from '@/lib/crypto/e2ee'
import type { AttachmentType } from '@/types/database'

const BUCKET = 'chat-media'
const MAX_SIZE_BYTES = 100 * 1024 * 1024 // 100 MB

const ALLOWED_MIME_TYPES: Record<AttachmentType, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/ogg', 'audio/wav'],
  voice_note: ['audio/webm', 'audio/ogg', 'audio/mp4'],
  document: ['application/pdf', 'text/plain', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
}

export function detectAttachmentType(mimeType: string): AttachmentType {
  for (const [type, mimes] of Object.entries(ALLOWED_MIME_TYPES)) {
    if (mimes.includes(mimeType)) return type as AttachmentType
  }
  return 'document'
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_SIZE_BYTES) {
    return { valid: false, error: `File too large. Max size: ${MAX_SIZE_BYTES / 1024 / 1024}MB` }
  }

  const allMimes = Object.values(ALLOWED_MIME_TYPES).flat()
  if (!allMimes.includes(file.type)) {
    return { valid: false, error: `Unsupported file type: ${file.type}` }
  }

  return { valid: true }
}

export interface UploadResult {
  storagePath: string
  thumbnailPath: string | null
  encryptedKey: string | null
  fileIv: string | null
  mimeType: string
  filename: string
  sizeBytes: number
  width: number | null
  height: number | null
  durationSeconds: number | null
  type: AttachmentType
}

interface UploadOptions {
  myUserId: string
  conversationId: string
  myDeviceId: string
  peerPublicKeyJwk: JsonWebKey | null
  onProgress?: (pct: number) => void
}

export async function uploadMedia(
  file: File,
  options: UploadOptions
): Promise<UploadResult> {
  const { valid, error } = validateFile(file)
  if (!valid) throw new Error(error)

  const supabase = getSupabaseBrowserClient()
  const type = detectAttachmentType(file.type)
  const ext = file.name.split('.').pop() ?? 'bin'
  const storagePath = `${options.myUserId}/${options.conversationId}/${crypto.randomUUID()}.${ext}`

  const fileBuffer = await file.arrayBuffer()
  let uploadBuffer = fileBuffer
  let encryptedKey: string | null = null
  let fileIv: string | null = null

  // Encrypt if E2EE is enabled
  if (options.peerPublicKeyJwk) {
    const aesKey = await deriveSharedKey(
      options.myDeviceId,
      options.peerPublicKeyJwk,
      options.conversationId
    )
    const encrypted = await encryptFile(fileBuffer, aesKey)
    uploadBuffer = encrypted.encryptedBuffer
    encryptedKey = encrypted.encryptedKey
    fileIv = encrypted.iv
  }

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, uploadBuffer, {
      contentType: options.peerPublicKeyJwk ? 'application/octet-stream' : file.type,
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) throw uploadError

  // Get image/video dimensions
  let width: number | null = null
  let height: number | null = null
  let durationSeconds: number | null = null
  let thumbnailPath: string | null = null

  if (type === 'image' && !options.peerPublicKeyJwk) {
    // Only extract metadata if not encrypted (encrypted = opaque blob)
    const dims = await getImageDimensions(file)
    width = dims.width
    height = dims.height
    thumbnailPath = await generateAndUploadThumbnail(
      file,
      storagePath,
      options.myUserId,
      supabase
    )
  } else if (type === 'video' && !options.peerPublicKeyJwk) {
    const meta = await getVideoMetadata(file)
    width = meta.width
    height = meta.height
    durationSeconds = meta.duration
  } else if ((type === 'audio' || type === 'voice_note') && !options.peerPublicKeyJwk) {
    durationSeconds = await getAudioDuration(file)
  }

  return {
    storagePath,
    thumbnailPath,
    encryptedKey,
    fileIv,
    mimeType: file.type,
    filename: file.name,
    sizeBytes: file.size,
    width,
    height,
    durationSeconds,
    type,
  }
}

export async function getSignedUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const supabase = getSupabaseBrowserClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn)

  if (error) throw error
  return data.signedUrl
}

// =============================================================================
// Media metadata helpers
// =============================================================================

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = reject
    img.src = url
  })
}

function getVideoMetadata(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration })
      URL.revokeObjectURL(url)
    }
    video.onerror = reject
    video.src = url
  })
}

function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.onloadedmetadata = () => {
      resolve(audio.duration)
      URL.revokeObjectURL(url)
    }
    audio.onerror = reject
    audio.src = url
  })
}

async function generateAndUploadThumbnail(
  file: File,
  originalPath: string,
  userId: string,
  supabase: ReturnType<typeof getSupabaseBrowserClient>
): Promise<string | null> {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const img = await createImageBitmap(file)
    const maxDim = 256
    const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1)
    canvas.width = Math.round(img.width * ratio)
    canvas.height = Math.round(img.height * ratio)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const blob: Blob = await new Promise(res => canvas.toBlob(b => res(b!), 'image/webp', 0.7))
    const thumbPath = originalPath.replace(/\.[^.]+$/, '_thumb.webp')

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(thumbPath, blob, { contentType: 'image/webp', upsert: true })

    if (error) return null
    return thumbPath
  } catch {
    return null
  }
}

// =============================================================================
// Voice note recording
// =============================================================================

export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private audioCtx: AudioContext | null = null
  private waveformData: number[] = []
  private animFrame: number | null = null

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    })

    // Set up analyser for waveform
    this.audioCtx = new AudioContext()
    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 256
    const source = this.audioCtx.createMediaStreamSource(this.stream)
    source.connect(this.analyser)

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm;codecs=opus' })
    this.chunks = []
    this.waveformData = []

    this.mediaRecorder.ondataavailable = (e) => this.chunks.push(e.data)
    this.mediaRecorder.start(100)

    this.captureWaveform()
  }

  private captureWaveform() {
    if (!this.analyser) return
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(data)
    const avg = data.reduce((s, v) => s + v, 0) / data.length
    this.waveformData.push(avg / 255)

    this.animFrame = requestAnimationFrame(() => this.captureWaveform())
  }

  stop(): Promise<{ blob: Blob; waveform: number[] }> {
    return new Promise((resolve) => {
      if (this.animFrame) cancelAnimationFrame(this.animFrame)

      if (!this.mediaRecorder) {
        resolve({ blob: new Blob(), waveform: [] })
        return
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm;codecs=opus' })
        this.stream?.getTracks().forEach(t => t.stop())
        this.audioCtx?.close()
        resolve({ blob, waveform: this.waveformData })
      }

      this.mediaRecorder.stop()
    })
  }

  cancel(): void {
    if (this.animFrame) cancelAnimationFrame(this.animFrame)
    this.mediaRecorder?.stop()
    this.stream?.getTracks().forEach(t => t.stop())
    this.audioCtx?.close()
  }
}

'use client'

import {
  useRef, useState, useEffect,
  type ChangeEvent, type KeyboardEvent,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { RichMessage } from '@/types/database'

const MAX_TEXT = 8000
const BUCKET = 'chat-media'

interface Props {
  conversationId: string
  myUserId: string
  myDeviceId: string
  peerPublicKeyJwk: JsonWebKey | null
  editingMessage: RichMessage | null
  onSend: (body: string) => Promise<void>
  onTyping: (t: boolean) => void
  isSending: boolean
}

export function MessageComposer({ conversationId, myUserId, editingMessage, onSend, onTyping, isSending }: Props) {
  const supabase = getSupabaseBrowserClient()
  const queryClient = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [text, setText] = useState('')
  const [isTypingActive, setIsTypingActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadLabel, setUploadLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [recDuration, setRecDuration] = useState(0)

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.decrypted_body ?? editingMessage.body_plaintext ?? '')
      textareaRef.current?.focus()
    }
  }, [editingMessage])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [text])

  const startTyping = () => {
    if (!isTypingActive) { setIsTypingActive(true); onTyping(true) }
    if (typingRef.current) clearTimeout(typingRef.current)
    typingRef.current = setTimeout(() => { setIsTypingActive(false); onTyping(false) }, 2500)
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value.length > MAX_TEXT) return
    setText(e.target.value)
    if (e.target.value.trim()) startTyping()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleSend = async () => {
    const body = text.trim()
    if (!body || isSending) return
    setText('')
    setIsTypingActive(false)
    onTyping(false)
    if (typingRef.current) clearTimeout(typingRef.current)
    await onSend(body)
    textareaRef.current?.focus()
  }

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setUploading(true)
    setError(null)
    for (const file of files) {
      try {
        setUploadLabel(`Uploading ${file.name}…`)
        const ext = file.name.split('.').pop() ?? 'bin'
        const path = `${myUserId}/${conversationId}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
        if (upErr) throw upErr
        let type: 'image'|'video'|'audio'|'document'|'voice_note' = 'document'
        if (file.type.startsWith('image/')) type = 'image'
        else if (file.type.startsWith('video/')) type = 'video'
        else if (file.type.startsWith('audio/')) type = 'audio'
        const { data: msg, error: msgErr } = await supabase.from('messages').insert({
          client_id: crypto.randomUUID(),
          conversation_id: conversationId,
          sender_id: myUserId,
          body_plaintext: `[${type}] ${file.name}`,
          message_type: type,
          status: 'sent',
        }).select().single()
        if (msgErr) throw msgErr
        await supabase.from('attachments').insert({
          message_id: msg.id,
          conversation_id: conversationId,
          uploader_id: myUserId,
          type,
          storage_path: path,
          filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          is_encrypted: false,
        })
        // Invalidate messages cache to show attachment immediately on sender's side
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      }
    }
    setUploading(false)
    setUploadLabel('')
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = e => chunksRef.current.push(e.data)
      recorder.start(100)
      recorderRef.current = recorder
      setRecording(true)
      setRecDuration(0)
      recTimerRef.current = setInterval(() => setRecDuration(d => d + 1), 1000)
    } catch { setError('Microphone access denied') }
  }

  const stopRecording = async () => {
    if (!recorderRef.current) return
    if (recTimerRef.current) clearInterval(recTimerRef.current)
    setRecording(false)
    const duration = recDuration
    recorderRef.current.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      if (blob.size < 500) return
      setUploading(true)
      setUploadLabel('Sending voice note…')
      try {
        const path = `${myUserId}/${conversationId}/${crypto.randomUUID()}.webm`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'audio/webm' })
        if (upErr) throw upErr
        const { data: msg, error: msgErr } = await supabase.from('messages').insert({
          client_id: crypto.randomUUID(),
          conversation_id: conversationId,
          sender_id: myUserId,
          body_plaintext: '[voice note]',
          message_type: 'voice_note',
          status: 'sent',
        }).select().single()
        if (msgErr) throw msgErr
        await supabase.from('attachments').insert({
          message_id: msg.id,
          conversation_id: conversationId,
          uploader_id: myUserId,
          type: 'voice_note',
          storage_path: path,
          filename: 'voice-note.webm',
          mime_type: 'audio/webm',
          size_bytes: blob.size,
          duration_seconds: duration,
          is_encrypted: false,
        })
        // Invalidate messages cache to show voice note immediately on sender's side
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      } catch (err) { setError(err instanceof Error ? err.message : 'Failed') }
      finally { setUploading(false); setUploadLabel('') }
    }
    recorderRef.current.stop()
    recorderRef.current.stream.getTracks().forEach(t => t.stop())
    setRecDuration(0)
  }

  const cancelRecording = () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current)
    recorderRef.current?.stop()
    recorderRef.current?.stream.getTracks().forEach(t => t.stop())
    recorderRef.current = null
    setRecording(false)
    setRecDuration(0)
  }

  const canSend = text.trim().length > 0 && !isSending && !uploading

  return (
    <div className="shrink-0 bg-[#0d0d1a] border-t border-neutral-900/80">
      {/* Error bar */}
      {error && (
        <div className="mx-3 mt-2 flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          <span className="text-xs text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400 ml-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* Upload progress */}
      {uploadLabel && (
        <div className="mx-3 mt-2 flex items-center gap-2 text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-xl px-3 py-2">
          <div className="w-3 h-3 border border-violet-400 border-t-transparent rounded-full animate-spin shrink-0" />
          {uploadLabel}
        </div>
      )}

      <div className="px-3 py-3">
        {recording ? (
          /* Recording UI */
          <div className="flex items-center gap-3 bg-neutral-900 rounded-2xl border border-red-500/30 px-4 py-3">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-neutral-200 font-medium">Recording…</p>
              <p className="text-xs text-neutral-500">
                {Math.floor(recDuration / 60)}:{String(recDuration % 60).padStart(2, '0')}
              </p>
            </div>
            <button
              onClick={cancelRecording}
              className="text-xs text-neutral-500 hover:text-neutral-300 px-3 py-1.5 rounded-xl hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={stopRecording}
              className="w-9 h-9 bg-violet-600 hover:bg-violet-500 rounded-full flex items-center justify-center transition-colors shadow-lg"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                <rect x="4" y="4" width="16" height="16" rx="2"/>
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            {/* Attach */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-2.5 text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800 rounded-xl transition-all shrink-0 mb-0.5 disabled:opacity-40"
              title="Attach file"
            >
              {uploading ? (
                <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              )}
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx" className="hidden" onChange={handleFileSelect} />

            {/* Input */}
            <div className={`flex-1 bg-neutral-900/80 rounded-2xl border transition-all
              ${isTypingActive ? 'border-violet-500/40' : 'border-neutral-800/60'}`}>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={editingMessage ? 'Edit message…' : 'Message…'}
                rows={1}
                className="w-full bg-transparent px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 resize-none focus:outline-none min-h-[44px] max-h-[160px] leading-relaxed"
              />
            </div>

            {/* Send or Mic */}
            {canSend ? (
              <button
                onClick={handleSend}
                disabled={isSending}
                className="p-2.5 bg-violet-600 hover:bg-violet-500 active:scale-95 disabled:opacity-50 text-white rounded-xl transition-all shrink-0 mb-0.5 shadow-lg shadow-violet-900/30"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            ) : (
              <button
                onPointerDown={(e) => { e.preventDefault(); startRecording() }}
                className="p-2.5 text-neutral-600 hover:text-violet-400 hover:bg-neutral-800 rounded-xl transition-all shrink-0 mb-0.5"
                title="Hold to record"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
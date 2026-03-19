'use client'

import { useState, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { SmileIcon, EditIcon, TrashIcon, ReplyIcon, PinIcon, CopyIcon, MicrophoneIcon } from '@/components/ui/Icons'
import type { RichMessage, Attachment } from '@/types/database'

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const BUCKET = 'chat-media'

interface Props {
  message: RichMessage
  isOwn: boolean
  isGrouped: boolean
  myUserId: string
  onReply: () => void
  onEdit: () => void
  onDelete: (forEveryone: boolean) => void
  onReact: (emoji: string) => void
  onPin: () => void
  onImageClick: (src: string) => void
}

function Tick({ status }: { status: RichMessage['status'] }) {
  if (status === 'sending') return <span style={{color:'#6b7280',fontSize:10}}>○</span>
  if (status === 'sent') return <span style={{color:'#9ca3af',fontSize:11}}>✓</span>
  if (status === 'delivered') return <span style={{color:'#9ca3af',fontSize:11}}>✓✓</span>
  if (status === 'seen') return <span style={{color:'#a78bfa',fontSize:11}}>✓✓</span>
  if (status === 'failed') return <span style={{color:'#f87171',fontSize:11}}>!</span>
  return null
}

function MediaItem({ att, isOwn, onImg }: { att: Attachment; isOwn: boolean; onImg: (s: string) => void }) {
  const supabase = getSupabaseBrowserClient()
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    supabase.storage.from(BUCKET).createSignedUrl(att.storage_path, 3600)
      .then(({ data }) => { if (data) setUrl(data.signedUrl) })
  }, [att.storage_path])

  const loadAudio = async () => {
    if (busy || blobUrl) return
    setBusy(true)
    try {
      // Use Supabase download() which handles auth headers properly
      const { data, error } = await supabase.storage.from(BUCKET).download(att.storage_path)
      if (error) throw error
      if (data) setBlobUrl(URL.createObjectURL(data))
    } catch (e) {
      console.error('[Audio]', e)
    }
    setBusy(false)
  }

  if (!url) return <div style={{width:180,height:36,background:'rgba(255,255,255,0.05)',borderRadius:8,animation:'pulse 1s infinite'}} />

  if (att.type === 'image') return (
    <img src={url} alt={att.filename} onClick={() => onImg(url)}
      style={{maxWidth:240,maxHeight:260,borderRadius:12,display:'block',cursor:'pointer',objectFit:'cover'}} />
  )

  if (att.type === 'video') return (
    <video src={url} controls style={{maxWidth:240,maxHeight:260,borderRadius:12,display:'block'}} preload="metadata" />
  )

  if (att.type === 'voice_note' || att.type === 'audio') return (
    <div style={{minWidth:180}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
        <MicrophoneIcon size={18} color="currentColor" />
        {att.duration_seconds && <span style={{fontSize:11,opacity:0.5}}>{Math.floor(att.duration_seconds/60)}:{String(Math.floor(att.duration_seconds%60)).padStart(2,'0')}</span>}
      </div>
      {blobUrl ? (
        <audio src={blobUrl} controls autoPlay style={{width:'100%',height:32}} />
      ) : (
        <button onClick={loadAudio} disabled={busy}
          style={{
            display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,border:'none',cursor:'pointer',fontSize:12,
            background: isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(139,92,246,0.2)',
            color: isOwn ? 'white' : '#a78bfa'
          }}>
          {busy ? '⏳ Loading...' : '▶ Play voice note'}
        </button>
      )}
    </div>
  )

  return (
    <a href={url} download={att.filename} target="_blank" rel="noopener noreferrer"
      style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:10,textDecoration:'none',
        background: isOwn ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',color:'inherit'}}>
      <span style={{fontSize:20}}>📎</span>
      <div>
        <div style={{fontSize:13,fontWeight:500,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.filename}</div>
        <div style={{fontSize:11,opacity:0.5}}>{att.size_bytes < 1048576 ? `${(att.size_bytes/1024).toFixed(1)} KB` : `${(att.size_bytes/1048576).toFixed(1)} MB`}</div>
      </div>
    </a>
  )
}

export function MessageBubble({ message, isOwn, isGrouped, myUserId, onReply, onEdit, onDelete, onReact, onPin, onImageClick }: Props) {
  const [showMenu, setShowMenu] = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const body = message.decrypted_body ?? message.body_plaintext ?? ''
  const atts = ((message as any).attachments as Attachment[] | undefined) ?? []
  const att = atts[0] ?? null
  const hideBody = ['[image]','[video]','[audio]','[voice note]','[voice_note]','[document]'].includes(body)
  const isDeleted = message.deleted_for_everyone

  const grouped = message.reactions.reduce<Record<string, { count: number; mine: boolean }>>((a, r) => {
    if (!a[r.emoji]) a[r.emoji] = { count: 0, mine: false }
    a[r.emoji].count++
    if (r.user_id === myUserId) a[r.emoji].mine = true
    return a
  }, {})

  useEffect(() => {
    if (!showMenu && !showReactions) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowMenu(false)
        setShowReactions(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showMenu, showReactions])

  if (isDeleted) return (
    <div style={{display:'flex',justifyContent: isOwn ? 'flex-end' : 'flex-start',padding:'2px 12px',marginTop: isGrouped ? 2 : 16}}>
      <div style={{fontSize:12,color:'#6b7280',fontStyle:'italic',padding:'4px 12px',border:'1px solid #374151',borderRadius:99}}>🚫 Message deleted</div>
    </div>
  )

  // Call log message
  if (message.message_type === 'call') return (
    <div style={{display:'flex',justifyContent:'center',padding:'4px 12px',marginTop:12}}>
      <div style={{
        display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#9ca3af',
        padding:'6px 14px',background:'rgba(255,255,255,0.04)',
        border:'1px solid rgba(255,255,255,0.08)',borderRadius:99
      }}>
        <span>{body}</span>
        <span style={{fontSize:10,opacity:0.5}}>{format(new Date(message.created_at),'HH:mm')}</span>
      </div>
    </div>
  )

  const bubbleBg = isOwn ? '#7c3aed' : '#1e1e2e'
  const bubbleBorder = isOwn ? 'none' : '1px solid rgba(255,255,255,0.06)'
  const textColor = '#f1f1f3'

  return (
    <div ref={ref} style={{
      display:'flex', flexDirection: isOwn ? 'row-reverse' : 'row',
      alignItems:'flex-end', gap:6, padding:'0 8px',
      marginTop: isGrouped ? 2 : 16, position:'relative'
    }}>
      {!isOwn && <div style={{width:20,flexShrink:0}} />}

      <div style={{display:'flex',flexDirection:'column',alignItems: isOwn ? 'flex-end' : 'flex-start',maxWidth:'72%'}}>

        {/* Reply preview */}
        {message.reply_to && (
          <div style={{fontSize:11,padding:'4px 10px',marginBottom:4,borderLeft:'2px solid #7c3aed',
            background:'rgba(255,255,255,0.04)',borderRadius:8,maxWidth:'100%',textAlign: isOwn ? 'right' : 'left'}}>
            <div style={{color:'#a78bfa',fontWeight:600,marginBottom:2}}>{message.reply_to.sender_display_name}</div>
            <div style={{color:'#9ca3af',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:200}}>
              {(message.reply_to as RichMessage).decrypted_body ?? message.reply_to.body_plaintext}
            </div>
          </div>
        )}

        {/* Bubble */}
        <div style={{
          background: bubbleBg, border: bubbleBorder, color: textColor,
          borderRadius: isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          padding: att && ['image','video'].includes(att.type) ? 0 : '10px 14px',
          overflow: att && ['image','video'].includes(att.type) ? 'hidden' : 'visible',
          opacity: message.isOptimistic ? 0.6 : 1,
          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
          position:'relative'
        }}>
          {!isOwn && !isGrouped && message.sender_display_name && (
            <div style={{fontSize:11,fontWeight:700,color:'#a78bfa',marginBottom:4}}>{message.sender_display_name}</div>
          )}

          {att && <MediaItem att={att} isOwn={isOwn} onImg={onImageClick} />}

          {!hideBody && body && (
            <p style={{margin:0,whiteSpace:'pre-wrap',wordBreak:'break-word',fontSize:14,lineHeight:1.5, paddingTop: att ? 6 : 0}}>
              {body}
              {message.is_edited && <span style={{fontSize:10,opacity:0.4,marginLeft:4}}>edited</span>}
            </p>
          )}

          <div style={{display:'flex',alignItems:'center',gap:3,marginTop:4,justifyContent: isOwn ? 'flex-end' : 'flex-start'}}>
            <span style={{fontSize:10,opacity:0.4}}>{format(new Date(message.created_at),'HH:mm')}</span>
            {isOwn && <Tick status={message.status} />}
          </div>
        </div>

        {/* Reactions */}
        {Object.keys(grouped).length > 0 && (
          <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:4,justifyContent: isOwn ? 'flex-end' : 'flex-start'}}>
            {Object.entries(grouped).map(([emoji, { count, mine }]) => (
              <button key={emoji} onClick={() => onReact(emoji)} style={{
                display:'flex',alignItems:'center',gap:3,fontSize:12,padding:'2px 8px',
                borderRadius:99,border: mine ? '1px solid #7c3aed' : '1px solid #374151',
                background: mine ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.04)',
                color: mine ? '#a78bfa' : '#9ca3af',cursor:'pointer'
              }}>
                {emoji}{count > 1 && <span style={{fontWeight:600}}>{count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="msg-actions" style={{
        display:'flex', flexDirection: isOwn ? 'row-reverse' : 'row',
        gap:2, alignSelf:'center', flexShrink:0, opacity:0, transition:'opacity 0.15s'
      }}>
        <button onClick={(e) => { e.stopPropagation(); setShowReactions(v => !v) }}
          style={{width:28,height:28,borderRadius:'50%',border:'none',background:'transparent',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center'}}
          title="React"><SmileIcon size={16} color="#6b7280" /></button>
        <button onClick={(e) => { e.stopPropagation(); onReply() }}
          style={{width:28,height:28,borderRadius:'50%',border:'none',background:'transparent',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center'}}
          title="Reply"><ReplyIcon size={16} color="#6b7280" /></button>
        <button onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v) }}
          style={{width:28,height:28,borderRadius:'50%',border:'none',background:'transparent',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center'}}
          title="More">⋯</button>
      </div>

      {/* Reaction picker */}
      {showReactions && (
        <div onClick={e => e.stopPropagation()} style={{
          position:'absolute', bottom:'100%', [isOwn ? 'right' : 'left']:40, marginBottom:8, zIndex:100,
          display:'flex',gap:4,background:'#1a1a2e',border:'1px solid #374151',
          borderRadius:99,padding:'6px 10px',boxShadow:'0 8px 32px rgba(0,0,0,0.5)'
        }}>
          {REACTIONS.map(e => (
            <button key={e} onClick={() => { onReact(e); setShowReactions(false) }}
              style={{fontSize:20,background:'none',border:'none',cursor:'pointer',padding:'0 2px',
                borderRadius:8,transition:'transform 0.1s'}}
              onMouseEnter={ev => (ev.currentTarget.style.transform='scale(1.3)')}
              onMouseLeave={ev => (ev.currentTarget.style.transform='scale(1)')}>
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Context menu */}
      {showMenu && (
        <div onClick={e => e.stopPropagation()} style={{
          position:'absolute', bottom:'100%', [isOwn ? 'right' : 'left']:0, marginBottom:4, zIndex:100,
          background:'#1a1a2e',border:'1px solid #374151',borderRadius:16,
          boxShadow:'0 8px 32px rgba(0,0,0,0.5)',overflow:'hidden',minWidth:180,padding:'4px 0'
        }}>
          {[
            { label:'↩  Reply', fn: () => { onReply(); setShowMenu(false) }, danger: false, icon: ReplyIcon },
            ...(isOwn ? [
              { label:'✏️  Edit', fn: () => { onEdit(); setShowMenu(false) }, danger: false, icon: EditIcon },
              { label:'🗑  Delete for everyone', fn: () => { onDelete(true); setShowMenu(false) }, danger: true, icon: TrashIcon },
            ] : []),
            { label:'🗑  Delete for me', fn: () => { onDelete(false); setShowMenu(false) }, danger: false, icon: TrashIcon },
            { label:'📌  Pin', fn: () => { onPin(); setShowMenu(false) }, danger: false, icon: PinIcon },
            { label:'📋  Copy', fn: () => { navigator.clipboard.writeText(body); setShowMenu(false) }, danger: false, icon: CopyIcon },
          ].map(item => (
            <button key={item.label} onClick={item.fn} style={{
              width:'100%',textAlign:'left',padding:'10px 16px',border:'none',cursor:'pointer',
              fontSize:13,background:'transparent',display:'flex',alignItems:'center',gap:8,
              color: item.danger ? '#f87171' : '#e5e7eb'
            }}
            onMouseEnter={ev => { ev.currentTarget.style.background = item.danger ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.05)' }}
            onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}>
              {item.icon && <item.icon size={16} color="currentColor" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
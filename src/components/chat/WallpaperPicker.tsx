'use client'

import { useState, useRef } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { PictureIcon, X, CheckIcon } from '@/components/ui/Icons'

const PRESET_WALLPAPERS = [
  { id: 'none', label: 'None', value: null, preview: '#080812' },
  { id: 'gradient1', label: 'Midnight', value: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)', preview: '#302b63' },
  { id: 'gradient2', label: 'Ocean', value: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)', preview: '#203a43' },
  { id: 'gradient3', label: 'Forest', value: 'linear-gradient(135deg, #0a3d0a, #1a5c1a, #0d2b0d)', preview: '#1a5c1a' },
  { id: 'gradient4', label: 'Rose', value: 'linear-gradient(135deg, #2d1b2e, #4a1942, #6b1f6b)', preview: '#4a1942' },
  { id: 'gradient5', label: 'Sunset', value: 'linear-gradient(135deg, #1a0a00, #3d1a00, #6b3300)', preview: '#3d1a00' },
  { id: 'gradient6', label: 'Aurora', value: 'linear-gradient(135deg, #001a1a, #003333, #004d4d)', preview: '#003333' },
]

interface WallpaperPickerProps {
  conversationId: string
  myUserId: string
  currentWallpaper: string | null
  onClose: () => void
  onWallpaperChange: (wallpaper: string | null) => void
}

export function WallpaperPicker({ conversationId, myUserId, currentWallpaper, onClose, onWallpaperChange }: WallpaperPickerProps) {
  const supabase = getSupabaseBrowserClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState<string | null>(currentWallpaper)

  const applyWallpaper = async (wallpaper: string | null) => {
    setSelected(wallpaper)
    try {
      const { error } = await supabase
        .from('conversations')
        .update({
          wallpaper_url: wallpaper,
          wallpaper_set_by: myUserId,
          wallpaper_set_at: new Date().toISOString(),
        })
        .eq('id', conversationId)

      if (error) {
        console.error('Failed to update wallpaper:', error)
        return
      }

      onWallpaperChange(wallpaper)
    } catch (err) {
      console.error('Error applying wallpaper:', err)
      setSelected(currentWallpaper) // Reset on error
    }
  }

  const handleCustomUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `wallpapers/${conversationId}/${Date.now()}.${ext}`
      const { data, error } = await supabase.storage.from('chat-media').upload(path, file, { upsert: true })
      
      if (error) {
        console.error('Wallpaper upload failed:', error)
        setUploading(false)
        return
      }

      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path)
      await applyWallpaper(urlData.publicUrl)
    } catch (err) {
      console.error('Wallpaper upload error:', err)
    }
    setUploading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
    }} onClick={onClose}>
      <div
        style={{
          background: '#111118', borderRadius: '24px 24px 0 0',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: 24, width: '100%', maxWidth: 480,
          boxShadow: '0 -20px 60px rgba(0,0,0,0.5)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f1f3' }}>Chat Wallpaper</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>Both users will see this wallpaper</p>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%', border: 'none',
            background: 'rgba(255,255,255,0.08)', color: '#9ca3af',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}><X size={18} color="#9ca3af" /></button>
        </div>

        {/* Preset grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          {PRESET_WALLPAPERS.map(wp => (
            <button
              key={wp.id}
              onClick={() => applyWallpaper(wp.value)}
              style={{
                height: 72, borderRadius: 12, border: selected === wp.value ? '2px solid #7c3aed' : '2px solid transparent',
                background: wp.value ?? '#080812',
                cursor: 'pointer', position: 'relative', overflow: 'hidden',
                boxShadow: selected === wp.value ? '0 0 0 3px rgba(124,58,237,0.3)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              {selected === wp.value && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.4)'
                }}>
                  <CheckIcon size={20} color="white" />
                </div>
              )}
              <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
                {wp.label}
              </div>
            </button>
          ))}

          {/* Custom upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              height: 72, borderRadius: 12, border: '2px dashed rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.03)', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, color: '#9ca3af', fontSize: 11
            }}
          >
            {uploading ? (
              <div style={{ width: 16, height: 16, border: '2px solid #7c3aed', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <>
                <PictureIcon size={20} color="#9ca3af" />
                <span>Custom</span>
              </>
            )}
          </button>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleCustomUpload} />

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '12px', borderRadius: 12, border: 'none',
            background: '#7c3aed', color: 'white', fontSize: 14,
            fontWeight: 600, cursor: 'pointer'
          }}
        >
          Done
        </button>
      </div>
    </div>
  )
}
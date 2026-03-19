'use client'

import { useState, useEffect } from 'react'
import { ChatIcon } from '@/components/ui/Icons'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

export default function SetupPage() {
  const supabase = getSupabaseBrowserClient()
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [about, setAbout] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [userId, setUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      setUserEmail(user.email ?? '')
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setDisplayName(data.display_name ?? '')
            setAbout(data.about ?? '')
            if (data.avatar_url) setAvatarPreview(data.avatar_url)
          }
          setInitializing(false)
        })
    })
  }, [])

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!displayName.trim()) { setError('Display name is required'); return }
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      let avatar_url: string | null = null

      if (avatarFile && userId) {
        const ext = avatarFile.name.split('.').pop()
        const path = `${userId}/avatar.${ext}`

        // Upload to public avatars bucket
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true })

        if (uploadError) {
          console.error('Avatar upload error:', uploadError)
        } else {
          // Use public URL — no expiry
          const { data: publicData } = supabase.storage
            .from('avatars')
            .getPublicUrl(path)
          avatar_url = publicData.publicUrl
        }
      }

      const updateData: Record<string, string | null> = {
        display_name: displayName.trim(),
        about: about.trim() || null,
      }
      if (avatar_url) updateData.avatar_url = avatar_url

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId)

      if (updateError) throw updateError

      setSuccess('Profile saved!')
      setTimeout(() => { window.location.href = '/chat' }, 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (initializing) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-violet-600 rounded-2xl mb-4 shadow-lg shadow-violet-900/40">
            <ChatIcon size={24} color="white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Your Profile</h1>
          <p className="text-neutral-500 text-sm mt-1">{userEmail}</p>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div className="flex flex-col items-center gap-2 mb-2">
            <label htmlFor="avatar-input" className="cursor-pointer group">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-neutral-800 group-hover:border-violet-500 transition-all duration-200 relative">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-violet-600/20 flex items-center justify-center">
                    <span className="text-3xl font-bold text-violet-400">{initials}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                  <span className="text-white text-xs font-medium">Change</span>
                </div>
              </div>
            </label>
            <span className="text-xs text-neutral-600">Tap to add a photo</span>
            <input id="avatar-input" type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">Display Name</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={60}
              className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 transition-all placeholder:text-neutral-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">
              About <span className="normal-case font-normal text-neutral-700">(optional)</span>
            </label>
            <input
              type="text"
              value={about}
              onChange={e => setAbout(e.target.value)}
              placeholder="A short bio..."
              maxLength={160}
              className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 transition-all placeholder:text-neutral-600"
            />
            <p className="text-xs text-neutral-700 mt-1.5 text-right">{about.length}/160</p>
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</div>
          )}
          {success && (
            <div className="text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">✓ {success}</div>
          )}

          <button
            type="submit"
            disabled={loading || !displayName.trim()}
            className="w-full bg-violet-600 hover:bg-violet-500 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-lg shadow-violet-900/30"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </span>
            ) : 'Save & Open Chat'}
          </button>

          <button type="button" onClick={() => router.push('/chat')} className="w-full text-neutral-600 hover:text-neutral-400 text-sm py-2 transition-colors">
            ← Back to Chat
          </button>

          <div className="border-t border-neutral-800 pt-4">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full text-red-500 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 rounded-xl py-2.5 text-sm font-medium transition-all"
            >
              Sign Out
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
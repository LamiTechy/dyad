'use client'

import { useState } from 'react'
import { ChatIcon } from '@/components/ui/Icons'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const supabase = getSupabaseBrowserClient()
  const router = useRouter()

  const [mode, setMode] = useState<'magic' | 'password'>('magic')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const { data: allowed } = await supabase
      .from('allowed_users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .eq('is_active', true)
      .single()

    if (!allowed) {
      setError('This email is not authorized to access Dyad.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithOtp({
  email: email.toLowerCase().trim(),
  options: {
    emailRedirectTo: 'http://localhost:3000/auth/callback',
  },
})

    if (error) setError(error.message)
    else setMessage('Check your email for the login link!')
    setLoading(false)
  }

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    })

    if (error) setError(error.message)
    else router.push('/chat')
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            backgroundColor: '#7c3aed',
            borderRadius: '16px',
            marginBottom: '16px',
          }}>
            <ChatIcon size={32} color="white" />
          </div>
          <h1 style={{ color: '#fff', fontSize: '28px', fontWeight: '700', margin: '0 0 6px' }}>Dyad</h1>
          <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>Private. Encrypted. Just the two of you.</p>
        </div>

        {/* Mode toggle */}
        <div style={{
          display: 'flex',
          backgroundColor: '#1a1a1a',
          borderRadius: '12px',
          padding: '4px',
          marginBottom: '24px',
        }}>
          {(['magic', 'password'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'all 0.15s',
                backgroundColor: mode === m ? '#2a2a2a' : 'transparent',
                color: mode === m ? '#fff' : '#666',
              }}
            >
              {m === 'magic' ? 'Magic Link' : 'Password'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={mode === 'magic' ? handleMagicLink : handlePassword}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#999', fontSize: '13px', marginBottom: '6px' }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: '100%',
                backgroundColor: '#1a1a1a',
                border: '1px solid #2a2a2a',
                color: '#fff',
                borderRadius: '12px',
                padding: '12px 16px',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {mode === 'password' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#999', fontSize: '13px', marginBottom: '6px' }}>
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  color: '#fff',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {error && (
            <div style={{
              backgroundColor: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#f87171',
              borderRadius: '12px',
              padding: '12px 16px',
              fontSize: '14px',
              marginBottom: '16px',
            }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{
              backgroundColor: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              color: '#4ade80',
              borderRadius: '12px',
              padding: '12px 16px',
              fontSize: '14px',
              marginBottom: '16px',
            }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              backgroundColor: loading ? '#5b21b6' : '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              padding: '13px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Loading...' : mode === 'magic' ? 'Send Login Link' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: '#333', fontSize: '12px', marginTop: '32px' }}>
          Access is by invitation only.
        </p>
      </div>
    </div>
  )
}
'use client'

import { useState, useEffect } from 'react'
import { LockIcon } from '@/components/ui/Icons'

interface LockScreenProps {
  onUnlock: (pin: string) => void
  isLocked: boolean
}

export function LockScreen({ onUnlock, isLocked }: LockScreenProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const MAX_ATTEMPTS = 5

  if (!isLocked) return null

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (attempts >= MAX_ATTEMPTS) {
      setError('Too many attempts. Try again in 1 minute.')
      return
    }

    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      setError('PIN must be 4 digits')
      setPin('')
      return
    }

    onUnlock(pin)
    setError('')
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!/^\d$/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Enter') {
      e.preventDefault()
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-violet-950 to-neutral-950 flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-8">
        <div className="w-16 h-16 bg-gradient-to-br from-violet-600 to-violet-800 rounded-full flex items-center justify-center shadow-lg">
          <LockIcon size={32} color="white" />
        </div>

        <h1 className="text-2xl font-bold text-white">Dyad Locked</h1>
        <p className="text-neutral-400 text-sm">Enter your PIN to unlock</p>

        <form onSubmit={handlePinSubmit} className="flex flex-col gap-4 w-80">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, '').slice(0, 4))
              setError('')
            }}
            onKeyPress={handleKeyPress}
            placeholder="••••"
            className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-center text-2xl tracking-widest focus:outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/30"
            autoFocus
          />

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          {attempts > 0 && attempts < MAX_ATTEMPTS && (
            <p className="text-yellow-500 text-xs text-center">
              {MAX_ATTEMPTS - attempts} attempt{MAX_ATTEMPTS - attempts > 1 ? 's' : ''} remaining
            </p>
          )}

          <button
            type="submit"
            className="w-full px-4 py-3 bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 text-white font-semibold rounded-lg transition-all"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}

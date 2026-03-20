'use client'

import { useState, useEffect, useCallback } from 'react'

const LOCK_KEY = 'dyad_lock_enabled'
const PIN_KEY = 'dyad_pin_hash'
const INACTIVITY_TIMEOUT = 5 * 60 * 1000 // 5 minutes
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION = 60 * 1000 // 1 minute

export function useLockScreen() {
  const [isLocked, setIsLocked] = useState(false)
  const [isLockEnabled, setIsLockEnabled] = useState(false)
  const [lockoutTime, setLockoutTime] = useState<number | null>(null)
  const inactivityTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initialize lock state on mount
  useEffect(() => {
    const lockEnabled = localStorage.getItem(LOCK_KEY) === 'true'
    setIsLockEnabled(lockEnabled)
    
    if (lockEnabled) {
      setIsLocked(true)
      startInactivityTimer()
    }
  }, [])

  // Handle lockout countdown
  useEffect(() => {
    if (!lockoutTime) return
    
    const interval = setInterval(() => {
      setLockoutTime(prev => {
        if (prev === null || prev <= 1000) {
          clearInterval(interval)
          return null
        }
        return prev - 1000
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [lockoutTime])

  // Simple hash function for PIN
  const hashPin = (pin: string): string => {
    let hash = 0
    for (let i = 0; i < pin.length; i++) {
      const char = pin.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return hash.toString()
  }

  const startInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
    }

    inactivityTimerRef.current = setTimeout(() => {
      if (isLockEnabled) {
        setIsLocked(true)
      }
    }, INACTIVITY_TIMEOUT)
  }, [isLockEnabled])

  // Reset inactivity timer on user activity
  useEffect(() => {
    const handleActivity = () => {
      if (isLockEnabled && !isLocked) {
        startInactivityTimer()
      }
    }

    window.addEventListener('mousedown', handleActivity)
    window.addEventListener('keydown', handleActivity)
    window.addEventListener('touchstart', handleActivity)

    return () => {
      window.removeEventListener('mousedown', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      window.removeEventListener('touchstart', handleActivity)
    }
  }, [isLockEnabled, isLocked, startInactivityTimer])

  const setLock = useCallback((pin: string, enabled: boolean) => {
    if (enabled) {
      const hashedPin = hashPin(pin)
      localStorage.setItem(PIN_KEY, hashedPin)
      localStorage.setItem(LOCK_KEY, 'true')
      setIsLockEnabled(true)
      setIsLocked(true)
    } else {
      localStorage.removeItem(PIN_KEY)
      localStorage.removeItem(LOCK_KEY)
      setIsLockEnabled(false)
      setIsLocked(false)
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }
    }
  }, [])

  const unlock = useCallback((pin: string): boolean => {
    if (lockoutTime) return false

    const storedHash = localStorage.getItem(PIN_KEY)
    const providedHash = hashPin(pin)

    if (storedHash === providedHash) {
      setIsLocked(false)
      startInactivityTimer()
      return true
    } else {
      setLockoutTime(LOCKOUT_DURATION)
      return false
    }
  }, [lockoutTime, startInactivityTimer])

  const lock = useCallback(() => {
    if (isLockEnabled) {
      setIsLocked(true)
    }
  }, [isLockEnabled])

  return {
    isLocked,
    isLockEnabled,
    setLock,
    unlock,
    lock,
    lockoutTime,
  }
}

// Need to add React import at the top
import React from 'react'

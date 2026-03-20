'use client'

import { useState } from 'react'
import { LockScreen } from '@/components/LockScreen'
import { LockSettingsModal } from '@/components/LockSettingsModal'
import { useLockScreen } from '@/hooks/useLockScreen'

interface AppLayoutClientProps {
  children: React.ReactNode
}

export function AppLayoutClient({ children }: AppLayoutClientProps) {
  const { isLocked, unlock, isLockEnabled, setLock } = useLockScreen()
  const [lockSettingsOpen, setLockSettingsOpen] = useState(false)

  const handleUnlock = (pin: string) => {
    const success = unlock(pin)
    if (!success) {
      // Error will be shown by lock screen
    }
  }

  const handleEnableLock = (pin: string) => {
    setLock(pin, true)
    setLockSettingsOpen(false)
  }

  const handleDisableLock = () => {
    setLock('', false)
    setLockSettingsOpen(false)
  }

  return (
    <>
      <LockScreen isLocked={isLocked} onUnlock={handleUnlock} />
      {!isLocked && (
        <>
          {children}
          <LockSettingsModal
            isOpen={lockSettingsOpen}
            isEnabled={isLockEnabled}
            onClose={() => setLockSettingsOpen(false)}
            onEnable={handleEnableLock}
            onDisable={handleDisableLock}
          />
        </>
      )}
    </>
  )
}

// Export hook for accessing lock settings in components
export { useLockScreen }

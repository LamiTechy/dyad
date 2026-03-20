'use client'

import { useState } from 'react'
import { X } from '@/components/ui/Icons'

interface LockSettingsModalProps {
  isOpen: boolean
  isEnabled: boolean
  onClose: () => void
  onEnable: (pin: string) => void
  onDisable: () => void
}

export function LockSettingsModal({
  isOpen,
  isEnabled,
  onClose,
  onEnable,
  onDisable,
}: LockSettingsModalProps) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState<'initial' | 'setup'>('initial')

  if (!isOpen) return null

  const handleEnable = () => {
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      setError('PIN must be 4 digits')
      return
    }
    if (pin !== confirmPin) {
      setError('PINs do not match')
      return
    }
    onEnable(pin)
    setPin('')
    setConfirmPin('')
    setStep('initial')
    onClose()
  }

  const handleDisable = () => {
    onDisable()
    setPin('')
    setConfirmPin('')
    setStep('initial')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 rounded-xl p-6 max-w-md w-full border border-neutral-800 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Lock Screen</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        {step === 'initial' && (
          <div className="space-y-4">
            <div className="p-4 bg-neutral-800 rounded-lg">
              <p className="text-neutral-300 text-sm">
                {isEnabled
                  ? 'Lock screen is currently enabled. Enter your PIN to unlock the app.'
                  : 'Enable lock screen to protect your messages with a PIN.'}
              </p>
            </div>

            {!isEnabled && (
              <button
                onClick={() => setStep('setup')}
                className="w-full px-4 py-2 bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 text-white font-semibold rounded-lg transition-all"
              >
                Set Up Lock Screen
              </button>
            )}

            {isEnabled && (
              <button
                onClick={handleDisable}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg transition-all"
              >
                Disable Lock Screen
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-lg transition-all"
            >
              Close
            </button>
          </div>
        )}

        {step === 'setup' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Create a 4-digit PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                  setError('')
                }}
                placeholder="••••"
                className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-center text-2xl tracking-widest focus:outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/30"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Confirm PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => {
                  setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                  setError('')
                }}
                placeholder="••••"
                className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-center text-2xl tracking-widest focus:outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/30"
              />
            </div>

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <div className="space-y-2">
              <button
                onClick={handleEnable}
                className="w-full px-4 py-2 bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 text-white font-semibold rounded-lg transition-all"
              >
                Enable Lock Screen
              </button>
              <button
                onClick={() => {
                  setStep('initial')
                  setPin('')
                  setConfirmPin('')
                  setError('')
                }}
                className="w-full px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-lg transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

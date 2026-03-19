'use client'

import { VideoIcon, PhoneIcon, X, CheckIcon } from '@/components/ui/Icons'
import type { CallType } from '@/types/database'

interface IncomingCallToastProps {
  peerName: string
  callType: CallType
  onAccept: () => void
  onReject: () => void
}

export function IncomingCallToast({ peerName, callType, onAccept, onReject }: IncomingCallToastProps) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl p-4 flex items-center gap-4 min-w-[280px] animate-slide-down">
      <div className="flex-1">
        <p className="font-semibold text-white text-sm">{peerName}</p>
        <p className="text-neutral-400 text-xs flex items-center gap-1">
          {callType === 'video' ? <><VideoIcon size={14} color="currentColor" /> Incoming video call</> : <><PhoneIcon size={14} color="currentColor" /> Incoming voice call</>}
        </p>
      </div>
      <button onClick={onReject} className="w-10 h-10 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors"><X size={18} color="white" /></button>
      <button onClick={onAccept} className="w-10 h-10 bg-green-600 hover:bg-green-500 rounded-full flex items-center justify-center transition-colors"><CheckIcon size={18} color="white" /></button>
    </div>
  )
}
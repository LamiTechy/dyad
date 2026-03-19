'use client'

import { Avatar } from './ChatHeader'
import { PhoneIcon, MicrophoneIcon, MicrophoneOffIcon, VideoIcon, CameraOffIcon, HangupIcon, X } from '@/components/ui/Icons'
import type { CallUI } from '@/hooks/usePresence'
import type { Profile } from '@/types/database'

interface CallOverlayProps {
  callUI: CallUI
  myProfile: Profile
  peerProfile: { display_name: string; avatar_url: string | null } | null
  onAccept: () => void
  onReject: () => void
  onEnd: () => void
  onToggleMute: () => void
  onToggleCamera: () => void
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function CallOverlay({
  callUI,
  myProfile: _myProfile,
  peerProfile,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleCamera,
}: CallOverlayProps) {
  const localVideoRef = (el: HTMLVideoElement | null) => {
    if (el && callUI.localStream) el.srcObject = callUI.localStream
  }
  const remoteVideoRef = (el: HTMLVideoElement | null) => {
    if (el && callUI.remoteStream) el.srcObject = callUI.remoteStream
  }
  const remoteAudioRef = (el: HTMLAudioElement | null) => {
    if (el && callUI.remoteStream) el.srcObject = callUI.remoteStream
  }

  const isVideo = callUI.callType === 'video'
  const isActive = callUI.state === 'active'
  const isIncoming = callUI.state === 'ringing' && callUI.incomingCallEvent != null

  const statusLabel = () => {
    switch (callUI.state) {
      case 'initiating': return 'Calling...'
      case 'ringing': return isIncoming ? 'Incoming call...' : 'Ringing...'
      case 'connecting': return 'Connecting...'
      case 'reconnecting': return 'Reconnecting...'
      case 'active': return `${formatDuration(callUI.duration)}`
      case 'ended': return 'Call ended'
      default: return ''
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-neutral-950 flex flex-col">
      {isVideo && callUI.remoteStream && (
        <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
      )}

      {!isVideo && callUI.remoteStream && (
        <audio ref={remoteAudioRef} autoPlay playsInline />
      )}

      <div className={`flex flex-col items-center justify-center flex-1 gap-6 relative z-10 ${isVideo && isActive ? 'justify-end pb-24' : ''}`}>
        {(!isVideo || !isActive) && (
          <>
            <Avatar name={peerProfile?.display_name ?? '?'} url={peerProfile?.avatar_url ?? null} size={96} />
            <div className="text-center">
              <h2 className="text-xl font-semibold text-white">{peerProfile?.display_name ?? '...'}</h2>
              <p className="text-neutral-400 mt-1">{statusLabel()}</p>
            </div>
          </>
        )}

        {isVideo && callUI.localStream && (
          <video
            ref={localVideoRef}
            autoPlay playsInline muted
            className={`rounded-xl object-cover border-2 border-neutral-800 ${isActive ? 'absolute top-4 right-4 w-24 h-36' : 'w-32 h-48 mt-4'}`}
          />
        )}
      </div>

      <div className="absolute bottom-12 left-0 right-0 flex items-center justify-center gap-6 z-20">
        {/* Incoming call: accept/reject */}
        {isIncoming && (
          <>
            <button onClick={onReject} className="w-16 h-16 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center shadow-xl"><X size={28} color="white" /></button>
            <button onClick={onAccept} className="w-16 h-16 bg-green-600 hover:bg-green-500 rounded-full flex items-center justify-center shadow-xl"><PhoneIcon size={28} color="white" /></button>
          </>
        )}

        {/* Outgoing ringing / initiating: just cancel */}
        {(callUI.state === 'initiating' || (callUI.state === 'ringing' && !isIncoming)) && (
          <button onClick={onEnd} className="w-16 h-16 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center shadow-xl"><HangupIcon size={28} color="white" /></button>
        )}

        {/* Active call controls */}
        {isActive && (
          <>
            <button
              onClick={onToggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${callUI.isMuted ? 'bg-red-600' : 'bg-neutral-700 hover:bg-neutral-600'}`}
            >
              {callUI.isMuted ? <MicrophoneOffIcon size={22} color="white" /> : <MicrophoneIcon size={22} color="white" />}
            </button>
            {isVideo && (
              <button
                onClick={onToggleCamera}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${callUI.isCameraOff ? 'bg-red-600' : 'bg-neutral-700 hover:bg-neutral-600'}`}
              >
                {callUI.isCameraOff ? <CameraOffIcon size={22} color="white" /> : <VideoIcon size={22} color="white" />}
              </button>
            )}
            <button onClick={onEnd} className="w-16 h-16 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center shadow-xl"><HangupIcon size={28} color="white" /></button>
          </>
        )}
      </div>
    </div>
  )
}
'use client'

import { formatDistanceToNow, format } from 'date-fns'
import { PhoneIcon, VideoIcon, X, Circle, HangupIcon } from '@/components/ui/Icons'

export interface CallLog {
  id: string
  conversation_id: string
  caller_id: string
  callee_id: string
  call_type: 'voice' | 'video'
  status: 'initiating' | 'ringing' | 'active' | 'ended' | 'missed' | 'rejected' | 'failed'
  started_at: string
  answered_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  caller_name?: string
  callee_name?: string
}

interface CallLogItemProps {
  call: CallLog
  myUserId: string
  peerName?: string
}

function getCallStatusIcon(status: string, call_type: string) {
  if (status === 'missed' || status === 'rejected') {
    return <X size={20} color="#f43f5e" />
  }
  if (status === 'active') {
    return <Circle size={20} color="#ec4899" variant="filled" />
  }
  if (call_type === 'video') {
    return <VideoIcon size={20} color="#ec4899" />
  }
  return <PhoneIcon size={20} color="#ec4899" />
}

function getCallStatusLabel(status: string, callerId: string, myUserId: string): string {
  const isMissed = status === 'rejected' || status === 'missed'
  const isIncoming = callerId !== myUserId

  if (isMissed && isIncoming) return 'Missed'
  if (status === 'rejected') return 'Declined'
  return 'Completed'
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '0s'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

export function CallLogItem({ call, myUserId, peerName = 'Other' }: CallLogItemProps) {
  const isIncoming = call.caller_id !== myUserId
  const isMissed = call.status === 'rejected' || call.status === 'missed'
  const icon = getCallStatusIcon(call.status, call.call_type)
  const statusLabel = getCallStatusLabel(call.status, call.caller_id, myUserId)
  const duration = call.duration_seconds ? formatDuration(call.duration_seconds) : null

  return (
    <div className="flex items-center justify-center py-3 px-2">
      <div className="glass-card flex items-center gap-3 px-4 py-2 rounded-lg text-sm max-w-xs">
        <div className="flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1">
          <div className="text-neutral-300">
            <span className={isMissed ? 'text-rose-400 font-medium' : ''}>
              {isIncoming ? 'Incoming' : 'Outgoing'} {call.call_type} call
            </span>
          </div>
          <div className="text-xs text-neutral-500 flex items-center gap-2 mt-0.5">
            <span>{statusLabel}</span>
            {duration && (
              <>
                <span>•</span>
                <span>{duration}</span>
              </>
            )}
            {call.ended_at && (
              <>
                <span>•</span>
                <span title={format(new Date(call.ended_at), 'PPpp')}>
                  {formatDistanceToNow(new Date(call.ended_at), { addSuffix: true })}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

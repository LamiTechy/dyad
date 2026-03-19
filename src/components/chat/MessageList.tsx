'use client'
// =============================================================================
// components/chat/MessageList.tsx
// =============================================================================


import { useCallback, useState } from 'react'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import { MessageBubble } from './MessageBubble'
import { MessageSkeleton } from './MessageSkeleton'
import { CallLogItem } from './CallLogItem'
import type { RichMessage } from '@/types/database'
import type { CallLog } from './CallLogItem'

interface MessageListProps {
  messages: RichMessage[]
  callLogs?: CallLog[]
  myUserId: string
  isLoading: boolean
  isLoadingMore: boolean
  onReply: (msg: RichMessage) => void
  onEdit: (msg: RichMessage) => void
  onDelete: (id: string, forEveryone: boolean) => void
  onReact: (params: { messageId: string; emoji: string }) => void
  onPin: (messageId: string) => void
}

function formatDateSeparator(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMMM d, yyyy')
}

function getItemTimestamp(item: { type: 'message'; data: RichMessage } | { type: 'call'; data: CallLog }): string {
  if (item.type === 'message') {
    return item.data.created_at
  } else {
    return item.data.started_at
  }
}

export function MessageList({
  messages,
  callLogs = [],
  myUserId,
  isLoading,
  isLoadingMore,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onPin,
}: MessageListProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  // Merge messages and calls, sorted by timestamp (newest first for loading, oldest first for display)
  const combinedItems = useCallback(() => {
    const items: Array<{ type: 'message'; data: RichMessage } | { type: 'call'; data: CallLog }> = [
      ...messages.map((msg) => ({ type: 'message' as const, data: msg })),
      ...callLogs.map((call) => ({ type: 'call' as const, data: call })),
    ]
    return items.sort((a, b) => {
      const dateA = new Date(getItemTimestamp(a)).getTime()
      const dateB = new Date(getItemTimestamp(b)).getTime()
      return dateA - dateB // oldest first
    })
  }, [messages, callLogs])

  const shouldShowDateSeparator = useCallback(
    (item: ReturnType<typeof combinedItems>[number], prevItem: ReturnType<typeof combinedItems>[number] | undefined): boolean => {
      if (!prevItem) return true
      const itemDate = new Date(getItemTimestamp(item))
      const prevDate = new Date(getItemTimestamp(prevItem))
      return !isSameDay(itemDate, prevDate)
    },
    []
  )

  // Group consecutive messages from same sender (within 60s) for visual grouping
  const shouldGroupWithPrev = useCallback(
    (item: ReturnType<typeof combinedItems>[number], prevItem: ReturnType<typeof combinedItems>[number] | undefined): boolean => {
      if (!prevItem || item.type !== 'message' || prevItem.type !== 'message') return false
      const msg = item.data as RichMessage
      const prevMsg = prevItem.data as RichMessage
      if (msg.sender_id !== prevMsg.sender_id) return false
      const diff = new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()
      return diff < 60_000 // 1 minute
    },
    []
  )

  if (isLoading) {
    return (
      <div className="px-4 pt-4 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <MessageSkeleton key={i} isOwn={i % 3 === 0} />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="px-3 py-4 space-y-0.5">
        {/* Load more indicator */}
        {isLoadingMore && (
          <div className="text-center py-3">
            <div className="inline-block w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {(() => {
          const items = combinedItems()
          return items.map((item, idx) => {
            const prevItem = items[idx - 1]
            const showDateSep = shouldShowDateSeparator(item, prevItem)

            if (item.type === 'call') {
              return (
                <div key={`call-${item.data.id}`}>
                  {showDateSep && (
                    <div className="flex items-center gap-3 py-4 px-2">
                      <div className="flex-1 h-px bg-neutral-800" />
                      <span className="text-xs text-neutral-500 whitespace-nowrap font-medium px-2">
                        {formatDateSeparator(new Date(item.data.started_at))}
                      </span>
                      <div className="flex-1 h-px bg-neutral-800" />
                    </div>
                  )}
                  <CallLogItem call={item.data} myUserId={myUserId} />
                </div>
              )
            }

            const msg = item.data as RichMessage
            const isGrouped = shouldGroupWithPrev(item, prevItem)
            const isOwn = msg.sender_id === myUserId

            return (
              <div key={msg.id}>
                {showDateSep && (
                  <div className="flex items-center gap-3 py-4 px-2">
                    <div className="flex-1 h-px bg-neutral-800" />
                    <span className="text-xs text-neutral-500 whitespace-nowrap font-medium px-2">
                      {formatDateSeparator(new Date(msg.created_at))}
                    </span>
                    <div className="flex-1 h-px bg-neutral-800" />
                  </div>
                )}

                <div className="group">
                  <MessageBubble
                    message={msg}
                    isOwn={isOwn}
                    isGrouped={isGrouped}
                    myUserId={myUserId}
                    onReply={() => onReply(msg)}
                    onEdit={() => onEdit(msg)}
                    onDelete={(forEveryone) => onDelete(msg.id, forEveryone)}
                    onReact={(emoji) => onReact({ messageId: msg.id, emoji })}
                    onPin={() => onPin(msg.id)}
                    onImageClick={setLightboxSrc}
                  />
                </div>
              </div>
            )
          })
        })()}
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="Media"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl p-2"
            onClick={() => setLightboxSrc(null)}
          >
            ✕
          </button>
          <a
            href={lightboxSrc}
            download
            className="absolute bottom-6 text-white/70 hover:text-white text-sm border border-white/20 px-4 py-2 rounded-full"
            onClick={(e) => e.stopPropagation()}
          >
            Download
          </a>
        </div>
      )}
    </>
  )
}
'use client'

import { useState } from 'react'

interface PinnedMessageBannerProps {
  messages: { id: string; decrypted_body?: string | null; body_plaintext?: string | null }[]
  conversationId: string
}

export function PinnedMessageBanner({ messages }: PinnedMessageBannerProps) {
  const [idx, setIdx] = useState(0)
  const current = messages[idx % messages.length]

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 bg-neutral-900 border-b border-neutral-800 cursor-pointer"
      onClick={() => setIdx(i => (i + 1) % messages.length)}
    >
      <div className="w-0.5 h-8 bg-violet-500 rounded-full shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-violet-400 font-medium mb-0.5">
          Pinned Message {messages.length > 1 && `${idx + 1}/${messages.length}`}
        </p>
        <p className="text-xs text-neutral-300 truncate">
          {current?.decrypted_body ?? current?.body_plaintext ?? '📎 Attachment'}
        </p>
      </div>
    </div>
  )
}
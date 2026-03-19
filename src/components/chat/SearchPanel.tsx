'use client'

import { useState, useRef } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { format } from 'date-fns'

interface SearchPanelProps {
  conversationId: string
  onClose: () => void
}

export function SearchPanel({ conversationId, onClose }: SearchPanelProps) {
  const supabase = getSupabaseBrowserClient()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; body_plaintext: string | null; created_at: string }[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setIsSearching(true)
    const { data } = await supabase
      .from('messages')
      .select('id, body_plaintext, created_at')
      .eq('conversation_id', conversationId)
      .eq('deleted_for_everyone', false)
      .ilike('body_plaintext', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(20)
    setResults(data ?? [])
    setIsSearching(false)
  }

  const handleChange = (v: string) => {
    setQuery(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(v), 400)
  }

  return (
    <div className="fixed inset-0 z-30 bg-neutral-950 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-900">
        <input
          autoFocus
          type="text"
          placeholder="Search messages..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1 bg-neutral-900 text-neutral-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <button onClick={onClose} className="text-neutral-500 hover:text-white p-2">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isSearching && <div className="text-center py-8 text-neutral-600">Searching...</div>}
        {!isSearching && query && results.length === 0 && (
          <div className="text-center py-8 text-neutral-600">No results found</div>
        )}
        {!isSearching && query && (
          <p className="text-xs text-neutral-600 px-4 py-2 italic">
            Note: E2EE-encrypted messages require client-side search (in-memory index).
          </p>
        )}
        {results.map(r => (
          <div key={r.id} className="px-4 py-3 border-b border-neutral-900 hover:bg-neutral-900 cursor-pointer">
            <p className="text-sm text-neutral-200 truncate">{r.body_plaintext}</p>
            <p className="text-xs text-neutral-600 mt-0.5">{format(new Date(r.created_at), 'MMM d, yyyy HH:mm')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
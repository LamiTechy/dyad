'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { RichMessage, MessageType } from '@/types/database'

const PAGE_SIZE = 40

interface SendMessageParams {
  conversationId: string
  body: string
  messageType?: MessageType
  replyToId?: string
}

interface UseMessagesOptions {
  conversationId: string
  myUserId: string
  myDeviceId: string
  peerPublicKeyJwk: import('globalThis').JsonWebKey | null
}

export function useMessages({
  conversationId,
  myUserId,
}: UseMessagesOptions) {
  const supabase = getSupabaseBrowserClient()
  const queryClient = useQueryClient()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)

  const queryKey = ['messages', conversationId]

  // Paginated message fetching
  const fetchPage = useCallback(
    async ({ pageParam }: { pageParam: string | null }) => {
      let query = supabase
        .from('messages_with_sender')
        .select('*, reactions(*), attachments(*), message_receipts(*)')
        .eq('conversation_id', conversationId)
        .eq('deleted_for_everyone', false)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (pageParam) {
        query = query.lt('created_at', pageParam)
      }

      const { data, error } = await query
      if (error) throw error

      const messages = (data ?? []).map(m => ({
        ...m,
        decrypted_body: m.body_plaintext,
        reactions: (m as RichMessage).reactions ?? [],
      })) as RichMessage[]

      return {
        messages: messages.reverse(),
        nextCursor: data && data.length === PAGE_SIZE
          ? data[data.length - 1].created_at
          : null,
      }
    },
    [conversationId, supabase]
  )

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey,
    queryFn: fetchPage,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })

  const messages: RichMessage[] = data?.pages
    ? [...data.pages].reverse().flatMap(p => p.messages)
    : []

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as RichMessage
          if (newMsg.sender_id === myUserId) return

          const { data } = await supabase
            .from('messages_with_sender')
            .select('*, reactions(*), attachments(*), message_receipts(*)')
            .eq('id', newMsg.id)
            .single()

          if (data) {
            const msg = { ...data, decrypted_body: data.body_plaintext, reactions: [] } as RichMessage
            queryClient.setQueryData(queryKey, (old: { pages: { messages: RichMessage[] }[] } | undefined) => {
              if (!old) return old
              const pages = [...old.pages]
              if (pages.length > 0) {
                pages[0] = { ...pages[0], messages: [...pages[0].messages, msg] }
              }
              return { ...old, pages }
            })
            await markDelivered(newMsg.id)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          updateMessageInCache(payload.new as RichMessage)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reactions',
        },
        () => {
          queryClient.invalidateQueries({ queryKey })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_receipts',
        },
        (payload) => {
          const r = payload.new as { message_id: string; user_id: string; seen_at: string | null }
          updateReceiptInCache(r)
        }
      )
      .subscribe((status) => {
        setIsRealtimeConnected(status === 'SUBSCRIBED')
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, myUserId])

  function updateMessageInCache(updated: Partial<RichMessage> & { id: string }) {
    queryClient.setQueryData(queryKey, (old: { pages: { messages: RichMessage[] }[] } | undefined) => {
      if (!old) return old
      const pages = old.pages.map(page => ({
        ...page,
        messages: page.messages.map(m =>
          m.id === updated.id ? { ...m, ...updated, decrypted_body: updated.body_plaintext ?? m.decrypted_body } : m
        ),
      }))
      return { ...old, pages }
    })
  }

  function updateReceiptInCache(receipt: { message_id: string; user_id: string; seen_at: string | null }) {
    queryClient.setQueryData(queryKey, (old: { pages: { messages: RichMessage[] }[] } | undefined) => {
      if (!old) return old
      const pages = old.pages.map(page => ({
        ...page,
        messages: page.messages.map(m => {
          if (m.id !== receipt.message_id) return m
          const status = receipt.seen_at ? 'seen' : 'delivered'
          return { ...m, status: status as RichMessage['status'] }
        }),
      }))
      return { ...old, pages }
    })
  }

  // Send message
  const sendMutation = useMutation({
    mutationFn: async (params: SendMessageParams) => {
      const clientId = crypto.randomUUID()

      const { data, error } = await supabase
        .from('messages')
        .insert({
          client_id: clientId,
          conversation_id: conversationId,
          sender_id: myUserId,
          body_plaintext: params.body,
          message_type: params.messageType ?? 'text',
          reply_to_id: params.replyToId,
          status: 'sent',
        })
        .select()
        .single()

      if (error) throw error
      return { ...data, decrypted_body: params.body, reactions: [] } as RichMessage
    },

    onMutate: async (params) => {
      const optimisticMsg: RichMessage = {
        id: `optimistic-${Date.now()}`,
        client_id: crypto.randomUUID(),
        conversation_id: conversationId,
        sender_id: myUserId,
        encrypted_body: null,
        iv: null,
        body_plaintext: params.body,
        decrypted_body: params.body,
        message_type: params.messageType ?? 'text',
        reply_to_id: params.replyToId ?? null,
        forwarded_from_id: null,
        is_forwarded: false,
        is_edited: false,
        edited_at: null,
        original_encrypted_body: null,
        deleted_for_everyone: false,
        deleted_at: null,
        expires_at: null,
        search_tokens: null,
        status: 'sending',
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sender_display_name: null,
        sender_avatar_url: null,
        reactions: [],
        receipt: null,
        isOptimistic: true,
        sendFailed: false,
      }

      queryClient.setQueryData(queryKey, (old: { pages: { messages: RichMessage[] }[] } | undefined) => {
        if (!old || !old.pages.length) return old
        const pages = [...old.pages]
        pages[0] = { ...pages[0], messages: [...pages[0].messages, optimisticMsg] }
        return { ...old, pages }
      })

      return { optimisticMsg }
    },

    onError: (_, __, context) => {
      if (context?.optimisticMsg) {
        queryClient.setQueryData(queryKey, (old: { pages: { messages: RichMessage[] }[] } | undefined) => {
          if (!old) return old
          const pages = old.pages.map(page => ({
            ...page,
            messages: page.messages.map(m =>
              m.id === context.optimisticMsg.id
                ? { ...m, sendFailed: true, status: 'failed' as const }
                : m
            ),
          }))
          return { ...old, pages }
        })
      }
    },

    onSuccess: (data, _, context) => {
      queryClient.setQueryData(queryKey, (old: { pages: { messages: RichMessage[] }[] } | undefined) => {
        if (!old) return old
        const pages = old.pages.map(page => ({
          ...page,
          messages: page.messages.map(m =>
            m.id === context?.optimisticMsg.id ? data : m
          ),
        }))
        return { ...old, pages }
      })
    },
  })

  // Edit message
  const editMutation = useMutation({
    mutationFn: async ({ messageId, newBody }: { messageId: string; newBody: string }) => {
      const { error } = await supabase
        .from('messages')
        .update({
          body_plaintext: newBody,
          is_edited: true,
          edited_at: new Date().toISOString(),
        })
        .eq('id', messageId)
        .eq('sender_id', myUserId)

      if (error) throw error
      updateMessageInCache({ id: messageId, is_edited: true, decrypted_body: newBody, body_plaintext: newBody })
    },
  })

  // Delete message
  const deleteMutation = useMutation({
    mutationFn: async ({ messageId, forEveryone }: { messageId: string; forEveryone: boolean }) => {
      if (forEveryone) {
        const { error } = await supabase
          .from('messages')
          .update({
            deleted_for_everyone: true,
            deleted_at: new Date().toISOString(),
            body_plaintext: null,
          })
          .eq('id', messageId)
          .eq('sender_id', myUserId)

        if (error) throw error
        updateMessageInCache({ id: messageId, deleted_for_everyone: true })
      } else {
        queryClient.setQueryData(queryKey, (old: { pages: { messages: RichMessage[] }[] } | undefined) => {
          if (!old) return old
          const pages = old.pages.map(page => ({
            ...page,
            messages: page.messages.filter(m => m.id !== messageId),
          }))
          return { ...old, pages }
        })
      }
    },
  })

  // React to message
  const reactMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const existing = messages
        .find(m => m.id === messageId)
        ?.reactions.find(r => r.user_id === myUserId && r.emoji === emoji)

      if (existing) {
        await supabase.from('reactions').delete().eq('id', existing.id)
      } else {
        await supabase.from('reactions').insert({ message_id: messageId, user_id: myUserId, emoji })
      }
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const markDelivered = useCallback(async (messageId: string) => {
    await supabase.from('message_receipts').upsert({
      message_id: messageId,
      user_id: myUserId,
      delivered_at: new Date().toISOString(),
    }, { onConflict: 'message_id,user_id' })
  }, [supabase, myUserId])

  const markSeen = useCallback(async (messageId: string) => {
    await supabase.from('message_receipts').upsert({
      message_id: messageId,
      user_id: myUserId,
      delivered_at: new Date().toISOString(),
      seen_at: new Date().toISOString(),
    }, { onConflict: 'message_id,user_id' })

    await supabase
      .from('conversation_members')
      .update({ last_read_message_id: messageId, last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', myUserId)
  }, [supabase, myUserId, conversationId])

  const pinMutation = useMutation({
    mutationFn: async (messageId: string) => {
      // Check if already pinned — if so, unpin it
      const { data: existing } = await supabase
        .from('pinned_messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('message_id', messageId)
        .maybeSingle()

      if (existing) {
        await supabase.from('pinned_messages').delete().eq('id', existing.id)
      } else {
        await supabase.from('pinned_messages').insert({
          conversation_id: conversationId,
          message_id: messageId,
          pinned_by: myUserId,
        })
      }
    },
  })

  return {
    messages,
    isLoading,
    error,
    isRealtimeConnected,
    loadMore: fetchNextPage,
    hasMore: hasNextPage,
    isLoadingMore: isFetchingNextPage,
    sendMessage: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
    editMessage: editMutation.mutateAsync,
    deleteMessage: deleteMutation.mutateAsync,
    reactToMessage: reactMutation.mutateAsync,
    markSeen,
    pinMessage: pinMutation.mutateAsync,
  }
}
import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ChatShell } from '@/components/chat/ChatShell'

export default async function ChatPage() {
  const supabase = await getSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify allowed
  const { data: allowed } = await supabase
    .from('allowed_users')
    .select('id')
    .eq('email', user.email!)
    .eq('is_active', true)
    .maybeSingle()

  if (!allowed) redirect('/login')

  // Get conversation membership
  const { data: membership } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', user.id)
    .maybeSingle() as any

  let conversationId: string

  if (!membership) {
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .limit(1)
      .maybeSingle() as any

    if (existingConv) {
      await supabase.from('conversation_members').insert([{
        conversation_id: existingConv.id,
        user_id: user.id,
      }] as any)
      conversationId = existingConv.id
    } else {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({} as any)
        .select()
        .single() as any
      if (!newConv) redirect('/error?error=Failed+to+create+conversation')
      await supabase.from('conversation_members').insert([{
        conversation_id: newConv.id,
        user_id: user.id,
      }] as any)
      conversationId = newConv.id
    }
  } else {
    conversationId = membership.conversation_id
  }

  // Fetch my profile
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle() as any

  // Get peer user_id from conversation_members
  const { data: peerMember } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .neq('user_id', user.id)
    .maybeSingle() as any

  // Fetch peer profile separately
  const { data: peerProfile } = peerMember
    ? await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, is_online, last_seen_at')
        .eq('id', peerMember.user_id)
        .maybeSingle() as any
    : { data: null }

  // Fetch peer device keys for E2EE
  const { data: peerDeviceKeys } = peerMember
    ? await supabase
        .from('device_keys')
        .select('identity_public_key')
        .eq('user_id', peerMember.user_id)
        .eq('is_current', true)
        .order('created_at', { ascending: false })
        .limit(1) as any
    : { data: null }

  const finalProfile = myProfile ?? {
    id: user.id,
    email: user.email!,
    display_name: user.email!.split('@')[0],
    avatar_url: null,
    about: null,
    last_seen_at: null,
    is_online: false,
    notifications_enabled: true,
    disappearing_messages_duration: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  return (
    <ChatShell
      conversationId={conversationId}
      myUserId={user.id}
      myProfile={finalProfile}
      peerProfile={peerProfile as {
        id: string
        display_name: string
        avatar_url: string | null
        is_online: boolean
        last_seen_at: string | null
      } | null}
      peerDeviceKeyJwk={peerDeviceKeys?.[0]?.identity_public_key as JsonWebKey | null}
    />
  )
}
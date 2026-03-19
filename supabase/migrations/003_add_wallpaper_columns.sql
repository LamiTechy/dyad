-- =============================================================================
-- Migration 003: Add wallpaper columns to conversations table
-- Adds support for chat wallpaper customization (idempotent)
-- Enables realtime for call_sessions if not already enabled
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'wallpaper_url'
  ) THEN
    ALTER TABLE public.conversations ADD COLUMN wallpaper_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'wallpaper_set_by'
  ) THEN
    ALTER TABLE public.conversations ADD COLUMN wallpaper_set_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'wallpaper_set_at'
  ) THEN
    ALTER TABLE public.conversations ADD COLUMN wallpaper_set_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create index for efficient wallpaper_set_at queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_conversations_wallpaper_set_at 
  ON public.conversations(wallpaper_set_at DESC NULLS LAST);

-- =============================================================================
-- Enable Realtime for call_sessions (required for real-time call log updates)
-- =============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;


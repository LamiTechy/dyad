'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { AppLayoutClient } from '@/components/AppLayoutClient'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 2 } },
  }))
  return (
    <QueryClientProvider client={queryClient}>
      <AppLayoutClient>{children}</AppLayoutClient>
    </QueryClientProvider>
  )
}

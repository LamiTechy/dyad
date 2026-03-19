export function MessageSkeleton({ isOwn }: { isOwn: boolean }) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} px-1 py-0.5`}>
      <div className={`h-10 rounded-2xl bg-neutral-800 animate-pulse ${isOwn ? 'w-48' : 'w-56'}`} />
    </div>
  )
}

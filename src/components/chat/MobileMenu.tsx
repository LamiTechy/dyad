'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { MenuIcon, X, SearchIcon, PictureIcon, LockIcon, SettingsIcon } from '@/components/ui/Icons'

interface MobileMenuProps {
  onSearchOpen: () => void
  onWallpaperOpen?: () => void
  onLockSettingsOpen?: () => void
}

export function MobileMenu({
  onSearchOpen,
  onWallpaperOpen,
  onLockSettingsOpen,
}: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleMenuItemClick = (callback: () => void) => {
    callback()
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-neutral-500 hover:text-pink-400 hover:bg-pink-500/10 rounded-full transition-all duration-300 relative z-10"
        title="Menu"
      >
        {isOpen ? <X size={20} color="currentColor" /> : <MenuIcon size={20} color="currentColor" />}
      </button>

      {/* Dropdown menu - using fixed positioning to ensure it stays on top */}
      {isOpen && (
        <div className="fixed right-4 top-16 w-48 bg-black/95 border border-pink-500/20 rounded-lg shadow-2xl z-[99999] overflow-hidden backdrop-blur">
          <button
            onClick={() => handleMenuItemClick(onSearchOpen)}
            className="w-full px-4 py-3 text-left text-neutral-200 hover:bg-pink-500/10 hover:text-pink-300 flex items-center gap-3 transition-colors border-b border-neutral-800/50"
            title="Search messages"
          >
            <SearchIcon size={18} color="currentColor" />
            <span className="text-sm font-medium">Search</span>
          </button>

          {onWallpaperOpen && (
            <button
              onClick={() => handleMenuItemClick(onWallpaperOpen)}
              className="w-full px-4 py-3 text-left text-neutral-200 hover:bg-pink-500/10 hover:text-pink-300 flex items-center gap-3 transition-colors border-b border-neutral-800/50"
              title="Set wallpaper"
            >
              <PictureIcon size={18} color="currentColor" />
              <span className="text-sm font-medium">Wallpaper</span>
            </button>
          )}

          {onLockSettingsOpen && (
            <button
              onClick={() => handleMenuItemClick(onLockSettingsOpen)}
              className="w-full px-4 py-3 text-left text-neutral-200 hover:bg-pink-500/10 hover:text-pink-300 flex items-center gap-3 transition-colors border-b border-neutral-800/50"
              title="Lock settings"
            >
              <LockIcon size={18} color="currentColor" />
              <span className="text-sm font-medium">Lock</span>
            </button>
          )}

          <Link
            href="/setup"
            onClick={() => setIsOpen(false)}
            className="w-full px-4 py-3 text-left text-neutral-200 hover:bg-pink-500/10 hover:text-pink-300 flex items-center gap-3 transition-colors"
            title="Settings"
          >
            <SettingsIcon size={18} color="currentColor" />
            <span className="text-sm font-medium">Settings</span>
          </Link>
        </div>
      )}
    </div>
  )
}

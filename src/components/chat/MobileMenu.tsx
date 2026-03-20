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

      {/* Dropdown menu - context menu style */}
      {isOpen && (
        <div className="fixed right-4 top-16 w-40 bg-neutral-950 border border-neutral-700 rounded-md shadow-xl z-[99999] overflow-hidden">
          <button
            onClick={() => handleMenuItemClick(onSearchOpen)}
            className="w-full px-3 py-2 text-left text-neutral-300 hover:bg-neutral-800 hover:text-pink-400 flex items-center gap-2.5 transition-colors text-xs"
            title="Search messages"
          >
            <SearchIcon size={16} color="currentColor" />
            <span className="font-normal">Search</span>
          </button>

          {onWallpaperOpen && (
            <button
              onClick={() => handleMenuItemClick(onWallpaperOpen)}
              className="w-full px-3 py-2 text-left text-neutral-300 hover:bg-neutral-800 hover:text-pink-400 flex items-center gap-2.5 transition-colors text-xs border-t border-neutral-800"
              title="Set wallpaper"
            >
              <PictureIcon size={16} color="currentColor" />
              <span className="font-normal">Wallpaper</span>
            </button>
          )}

          {onLockSettingsOpen && (
            <button
              onClick={() => handleMenuItemClick(onLockSettingsOpen)}
              className="w-full px-3 py-2 text-left text-neutral-300 hover:bg-neutral-800 hover:text-pink-400 flex items-center gap-2.5 transition-colors text-xs border-t border-neutral-800"
              title="Lock settings"
            >
              <LockIcon size={16} color="currentColor" />
              <span className="font-normal">Lock</span>
            </button>
          )}

          <Link
            href="/setup"
            onClick={() => setIsOpen(false)}
            className="w-full px-3 py-2 text-left text-neutral-300 hover:bg-neutral-800 hover:text-pink-400 flex items-center gap-2.5 transition-colors text-xs border-t border-neutral-800"
            title="Settings"
          >
            <SettingsIcon size={16} color="currentColor" />
            <span className="font-normal">Settings</span>
          </Link>
        </div>
      )}
    </div>
  )
}

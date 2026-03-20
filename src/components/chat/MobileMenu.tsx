'use client'

import { useState, useEffect } from 'react'
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

  // Close menu when clicking backdrop
  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsOpen(false)
      }
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleMenuItemClick = (callback: () => void) => {
    callback()
    setIsOpen(false)
  }

  return (
    <>
      {/* Menu toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-neutral-500 hover:text-pink-400 hover:bg-pink-500/10 rounded-full transition-all duration-300 relative z-10"
        title="Menu"
      >
        {isOpen ? <X size={20} color="currentColor" /> : <MenuIcon size={20} color="currentColor" />}
      </button>

      {/* Bottom sheet backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/40 z-[99998] transition-opacity duration-300"
        />
      )}

      {/* Bottom sheet menu - slides up from bottom */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-neutral-950 rounded-t-2xl shadow-2xl z-[99999] transition-all duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-neutral-700 rounded-full" />
        </div>

        {/* Menu content */}
        <div className="px-4 pb-6 space-y-2">
          {/* Search */}
          <button
            onClick={() => handleMenuItemClick(onSearchOpen)}
            className="w-full px-4 py-3 text-left text-neutral-200 hover:bg-neutral-800 hover:text-pink-400 flex items-center gap-3 transition-colors rounded-lg"
            title="Search messages"
          >
            <SearchIcon size={20} color="currentColor" />
            <span className="font-medium text-base">Search</span>
          </button>

          {/* Wallpaper */}
          {onWallpaperOpen && (
            <button
              onClick={() => handleMenuItemClick(onWallpaperOpen)}
              className="w-full px-4 py-3 text-left text-neutral-200 hover:bg-neutral-800 hover:text-pink-400 flex items-center gap-3 transition-colors rounded-lg"
              title="Set wallpaper"
            >
              <PictureIcon size={20} color="currentColor" />
              <span className="font-medium text-base">Wallpaper</span>
            </button>
          )}

          {/* Lock settings */}
          {onLockSettingsOpen && (
            <button
              onClick={() => handleMenuItemClick(onLockSettingsOpen)}
              className="w-full px-4 py-3 text-left text-neutral-200 hover:bg-neutral-800 hover:text-pink-400 flex items-center gap-3 transition-colors rounded-lg"
              title="Lock settings"
            >
              <LockIcon size={20} color="currentColor" />
              <span className="font-medium text-base">Lock</span>
            </button>
          )}

          {/* Settings */}
          <Link
            href="/setup"
            onClick={() => setIsOpen(false)}
            className="w-full px-4 py-3 text-left text-neutral-200 hover:bg-neutral-800 hover:text-pink-400 flex items-center gap-3 transition-colors rounded-lg block"
            title="Settings"
          >
            <SettingsIcon size={20} color="currentColor" />
            <span className="font-medium text-base">Settings</span>
          </Link>
        </div>
      </div>
    </>
  )
}

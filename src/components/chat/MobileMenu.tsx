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
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)

  // Update content height when open state changes
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(isOpen ? contentRef.current.scrollHeight : 0)
    }
  }, [isOpen])

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
      {/* Menu toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-neutral-500 hover:text-pink-400 hover:bg-pink-500/10 rounded-full transition-all duration-300 relative z-10"
        title="Menu"
      >
        {isOpen ? <X size={20} color="currentColor" /> : <MenuIcon size={20} color="currentColor" />}
      </button>

      {/* Accordion menu - slides down from button */}
      <div
        ref={contentRef}
        style={{ 
          maxHeight: `${contentHeight}px`,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out'
        }}
        className="absolute right-0 top-full mt-1 w-48 bg-neutral-950 border border-neutral-700 rounded-md shadow-lg z-[99999]"
      >
        {/* Search */}
        <button
          onClick={() => handleMenuItemClick(onSearchOpen)}
          className="w-full px-4 py-3 text-left text-neutral-300 hover:bg-neutral-800 hover:text-pink-400 flex items-center gap-3 transition-colors text-sm border-b border-neutral-800/50"
          title="Search messages"
        >
          <SearchIcon size={18} color="currentColor" />
          <span className="font-medium">Search</span>
        </button>

        {/* Wallpaper */}
        {onWallpaperOpen && (
          <button
            onClick={() => handleMenuItemClick(onWallpaperOpen)}
            className="w-full px-4 py-3 text-left text-neutral-300 hover:bg-neutral-800 hover:text-pink-400 flex items-center gap-3 transition-colors text-sm border-b border-neutral-800/50"
            title="Set wallpaper"
          >
            <PictureIcon size={18} color="currentColor" />
            <span className="font-medium">Wallpaper</span>
          </button>
        )}

        {/* Lock settings */}
        {onLockSettingsOpen && (
          <button
            onClick={() => handleMenuItemClick(onLockSettingsOpen)}
            className="w-full px-4 py-3 text-left text-neutral-300 hover:bg-neutral-800 hover:text-pink-400 flex items-center gap-3 transition-colors text-sm border-b border-neutral-800/50"
            title="Lock settings"
          >
            <LockIcon size={18} color="currentColor" />
            <span className="font-medium">Lock</span>
          </button>
        )}

        {/* Settings */}
        <Link
          href="/setup"
          onClick={() => setIsOpen(false)}
          className="w-full px-4 py-3 text-left text-neutral-300 hover:bg-neutral-800 hover:text-pink-400 flex items-center gap-3 transition-colors text-sm"
          title="Settings"
        >
          <SettingsIcon size={18} color="currentColor" />
          <span className="font-medium">Settings</span>
        </Link>
      </div>
    </div>
  )
}

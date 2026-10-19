'use client'

import { useEffect } from 'react'

export default function Home() {
  // Full-screen embed of the static Ace app (served from /public/ace).
  // The standalone folder in /download/ace is what you deploy to GitHub Pages.
  useEffect(() => {
    document.title = 'Ace — AI Study Copilot'
  }, [])

  return (
    <iframe
      src="/ace/index.html"
      title="Ace — AI Study Copilot"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        border: 'none',
        background: '#212121',
      }}
      allow="clipboard-read; clipboard-write; microphone"
    />
  )
}

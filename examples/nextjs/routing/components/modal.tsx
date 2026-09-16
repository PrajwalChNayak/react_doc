'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

export function Modal({
  title,
  closeLabel,
  children,
}: {
  title: string
  closeLabel: string
  children: ReactNode
}) {
  const router = useRouter()
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButton.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      // Going back pops the intercepted URL, which closes the modal.
      if (event.key === 'Escape') router.back()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [router])

  return (
    <div className="backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">{title}</h2>
        {children}
        <button ref={closeButton} type="button" onClick={() => router.back()}>
          {closeLabel}
        </button>
      </div>
    </div>
  )
}

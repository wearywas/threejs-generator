import React, { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/** Native modal isolation keeps focus and keyboard input out of the workspace. */
export default function Modal({ onClose, labelledBy, initialFocusRef, dismissOnBackdrop = true, className = '', children }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // Open before child preview effects measure their canvas dimensions.
  useLayoutEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement
    dialog.showModal()
    initialFocusRef?.current?.focus()
    return () => {
      dialog.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [initialFocusRef])
  return createPortal(
    <dialog ref={ref} tabIndex={-1} aria-labelledby={labelledBy} className={`studio-dialog ${className}`}
      onCancel={event => { event.preventDefault(); closeRef.current?.() }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const dialog = event.currentTarget
        const controls = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]')]
          .filter(element => !element.matches(':disabled') && element.tabIndex >= 0 && element.getClientRects().length)
        const first = controls[0]
        const last = controls.at(-1)
        if (!first) { event.preventDefault(); dialog.focus() }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }}
      onClick={event => {
        if (!dismissOnBackdrop || event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeRef.current?.()
      }}>
      {children}
    </dialog>, document.body
  )
}

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createRecoveryController } from '../services/recoveryController'
import { RECOVERY_CHANNEL } from '../services/workspaceRecovery'

const serverSnapshot = { ready: true, candidate: null, status: 'idle', error: null }

/** Browser-local safety net; only committed inputs and the editor draft are stored. */
export function useWorkspaceRecovery(document, draftCode) {
  const instance = useRef(null)
  if (!instance.current) instance.current = createRecoveryController()
  const controller = instance.current
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => serverSnapshot)
  useEffect(() => { controller.start() }, [controller])
  useEffect(() => {
    const check = () => { controller.checkForChanges() }
    let channel
    try {
      channel = new BroadcastChannel(RECOVERY_CHANNEL)
      channel.onmessage = event => controller.checkForChanges(event.data?.id)
    } catch { /* Focus checks cover browsers without cross-tab messaging. */ }
    window.addEventListener('focus', check)
    return () => { channel?.close(); window.removeEventListener('focus', check) }
  }, [controller])
  useEffect(() => {
    controller.update(document, draftCode)
  }, [controller, document, draftCode, state.ready, state.candidate])
  useEffect(() => {
    if (!document || state.status === 'saved') return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [document, state.status])
  return { ...state, controller }
}

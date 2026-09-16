import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createAssetWorkspace } from '../runtime/assetWorkspace'
import { createAssetActions } from '../runtime/assetActions'
import { llmClient } from '../api/llmClient'

/** React adapter for the document/runtime owner; orchestration stays testable outside React. */
export function useAssetWorkspace({ uncapTriCount }) {
  const optionsRef = useRef({})
  optionsRef.current = uncapTriCount ? { maxTriangles: Infinity } : {}
  const instanceRef = useRef(null)
  if (!instanceRef.current) {
    const workspace = createAssetWorkspace()
    const actions = createAssetActions(workspace, { getExecutionOptions: () => optionsRef.current })
    const cancel = () => { workspace.cancel(); llmClient.cancelRequests() }
    instanceRef.current = { workspace, actions, cancel }
  }
  const { workspace, actions, cancel } = instanceRef.current
  const state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot)
  useEffect(() => {
    workspace.activate()
    return () => {
      const pending = workspace.getSnapshot().pending
      workspace.deactivate()
      if (pending) llmClient.cancelRequests()
    }
  }, [workspace])
  return { ...state, actions, cancel, getCurrent: () => workspace.getSnapshot().current }
}

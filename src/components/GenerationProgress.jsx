import React, { useSyncExternalStore } from 'react'
import { generationProgress } from '../api/generationProgress'
import { llmClient } from '../api/llmClient'

const stageLabels = {
  preparing: 'Preparing request...',
  model: 'Waiting for model response...',
  repair: 'Waiting for model repair response...',
  validation: 'Checking model response...',
  execution: 'Executing and validating generated code...',
}

/** Show observed stages and elapsed time, never a completion estimate. */
export default function GenerationProgress({ active = false, task, onCancelRequest, className = 'request-status' }) {
  const current = useSyncExternalStore(generationProgress.subscribe, generationProgress.getSnapshot, generationProgress.getSnapshot)
  const requests = useSyncExternalStore(llmClient.subscribe, llmClient.getSnapshot, llmClient.getSnapshot)
  const progress = !task || current?.task === task ? current : null
  if (!progress && !active && !(requests.pending > 0 && !task)) return null

  const elapsedSeconds = Math.floor((progress?.elapsedMs || 0) / 1000)
  const elapsed = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`
  const label = progress ? stageLabels[progress.stage]
    : requests.pending > 0 ? 'Waiting for the model. Complex assets can take a few minutes.' : 'Preparing asset...'

  return <div className={className}>
    <div className="min-w-0 space-y-1">
      <p role="status">{label}</p>
      {progress && <>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-300">
          <span role="timer" aria-live="off">Elapsed {elapsed}</span>
          {progress.attempt > 0 && <span>Model request {progress.attempt} · maximum {progress.maxAttempts}</span>}
          {progress.repairAttempt > 0 && <span>Repair requests: {progress.repairAttempt} (included above)</span>}
        </div>
        {progress.retryReason && <p className="text-xs text-neutral-300 break-words" role="status">
          <span className="font-medium">Why another request?</span> {progress.retryReason}
        </p>}
        <p className="text-xs text-neutral-400">{requests.provider === 'codex'
          ? 'The request limit includes repairs; additional requests consume Codex allowance.'
          : 'The request limit includes repairs; additional requests can incur API charges.'}</p>
      </>}
    </div>
    {onCancelRequest && <button type="button" className="shrink-0 text-helios-300 underline" onClick={onCancelRequest}>Cancel request</button>}
  </div>
}
